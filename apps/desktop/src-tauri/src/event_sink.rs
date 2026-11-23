//! Desktop adapter for the event-sink protocol. Each process owns its chunk prefix.
use chrono::{DateTime, FixedOffset, Local, SecondsFormat};
use serde_json::json;
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex, OnceLock,
};

static SINK: OnceLock<Mutex<EventSink>> = OnceLock::new();
static DEGRADED: AtomicBool = AtomicBool::new(false);
struct Duplicate {
    path: PathBuf,
    offset: u64,
    count: u64,
    instant: i64,
}

pub struct EventSink {
    root: PathBuf,
    duplicates: HashMap<String, Duplicate>,
}
impl EventSink {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            duplicates: HashMap::new(),
        }
    }
    /// Emit lifecycle milestones or errors. Routine API info/debug uses its memory ring.
    pub fn emit(
        &mut self,
        severity: &str,
        message: &str,
        error: Option<String>,
        now: DateTime<FixedOffset>,
    ) -> std::io::Result<()> {
        let instant = now.timestamp_millis();
        self.duplicates
            .retain(|_, d| instant >= d.instant && instant - d.instant < 60_000);
        let signature = json!([message, error]).to_string();
        if severity == "error" {
            if let Some(duplicate) = self.duplicates.get_mut(&signature) {
                duplicate.count += 1;
                let mut file = OpenOptions::new().write(true).open(&duplicate.path)?;
                file.seek(SeekFrom::Start(duplicate.offset))?;
                file.write_all(format!("{:>12}", duplicate.count).as_bytes())?;
                return Ok(());
            }
        }
        let dir = self.root.join(now.format("%Y-%m-%d").to_string());
        fs::create_dir_all(&dir)?;
        if fs::symlink_metadata(&dir)?.file_type().is_symlink() {
            return Err(std::io::Error::other("log directory is a link"));
        }
        let payload = json!({ "schemaVersion": 1, "timestamp": now.to_rfc3339_opts(SecondsFormat::Millis, false),
            "severity": severity, "source": "desktop", "message": message,
            "lifecycle": severity != "error", "attributes": { "error": error } }).to_string();
        let line = format!("{{\"count\":{:>12},{}\n", 1, &payload[1..]);
        let mut index = 0;
        let (path, size) = loop {
            let name = if index == 0 {
                "desktop.log".to_owned()
            } else {
                format!("desktop.{index}.log")
            };
            let path = dir.join(name);
            let mut size = match fs::symlink_metadata(&path) {
                Ok(m) if m.is_file() && !m.file_type().is_symlink() => m.len(),
                Ok(_) => return Err(std::io::Error::other("invalid log file")),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => 0,
                Err(e) => return Err(e),
            };
            if size > 0 {
                let bytes = fs::read(&path)?;
                if bytes.last() != Some(&b'\n') {
                    size = bytes
                        .iter()
                        .rposition(|b| *b == b'\n')
                        .map(|n| n + 1)
                        .unwrap_or(0) as u64;
                    OpenOptions::new().write(true).open(&path)?.set_len(size)?;
                }
            }
            if size == 0 || size + line.len() as u64 <= 5 * 1024 * 1024 {
                break (path, size);
            }
            index += 1;
        };
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?
            .write_all(line.as_bytes())?;
        if severity == "error" {
            if self.duplicates.len() >= 1000 {
                self.duplicates.clear();
            }
            self.duplicates.insert(
                signature,
                Duplicate {
                    path,
                    offset: size + 9,
                    count: 1,
                    instant,
                },
            );
        }
        self.cleanup(now)
    }
    pub fn cleanup(&mut self, now: DateTime<FixedOffset>) -> std::io::Result<()> {
        fs::create_dir_all(&self.root)?;
        let cutoff = (now.date_naive() - chrono::Duration::days(29)).to_string();
        let mut files = Vec::new();
        for day in fs::read_dir(&self.root)? {
            let day = day?;
            let name = day.file_name().to_string_lossy().to_string();
            if !day.file_type()?.is_dir()
                || chrono::NaiveDate::parse_from_str(&name, "%Y-%m-%d").is_err()
            {
                continue;
            }
            for entry in fs::read_dir(day.path())? {
                let entry = entry?;
                if entry.file_type()?.is_file() && owned_log(&entry.path()) {
                    files.push((
                        name.clone(),
                        entry.metadata()?.modified()?,
                        entry.path(),
                        entry.metadata()?.len(),
                    ));
                }
            }
        }
        files.sort();
        let mut total: u64 = files.iter().map(|f| f.3).sum();
        for (day, _, path, size) in files {
            if day < cutoff || total > 200 * 1024 * 1024 {
                match fs::remove_file(&path) {
                    Ok(()) => {
                        total -= size;
                        self.duplicates.retain(|_, d| d.path != path);
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                    Err(e) => return Err(e),
                }
            }
        }
        Ok(())
    }
}
fn owned_log(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
        return false;
    };
    let Some(stem) = name.strip_suffix(".log") else {
        return false;
    };
    let mut parts = stem.split('.');
    matches!(parts.next(), Some("app" | "api" | "desktop"))
        && match parts.next() {
            None => true,
            Some(n) => {
                !n.is_empty() && n.bytes().all(|c| c.is_ascii_digit()) && parts.next().is_none()
            }
        }
}
pub fn initialize(root: PathBuf) {
    let mut sink = EventSink::new(root);
    if sink.cleanup(Local::now().fixed_offset()).is_err() {
        DEGRADED.store(true, Ordering::Relaxed);
    }
    let _ = SINK.set(Mutex::new(sink));
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        emit("error", "desktop panic", Some(info.to_string()));
        previous(info);
    }));
    emit("info", "startup", None);
}
pub fn emit(severity: &str, message: &str, error: Option<String>) {
    let result = (|| -> std::io::Result<()> {
        let sink = SINK
            .get()
            .ok_or_else(|| std::io::Error::other("logger unavailable"))?;
        let mut guard = sink
            .try_lock()
            .map_err(|_| std::io::Error::other("logger busy"))?;
        guard.emit(severity, message, error, Local::now().fixed_offset())
    })();
    if result.is_err() {
        DEGRADED.store(true, Ordering::Relaxed);
        let _ = writeln!(std::io::stderr(), "Local logging degraded: {message}");
    }
}
pub fn degraded() -> bool {
    DEGRADED.load(Ordering::Relaxed)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn panic_hook_records_failure() {
        if let Ok(root) = std::env::var("TUARI_PANIC_TEST_ROOT") {
            initialize(PathBuf::from(root));
            let _ = std::panic::catch_unwind(|| panic!("panic capture probe"));
            return;
        }
        let root = std::env::temp_dir().join(format!("tuari-panic-{}", rand::random::<u64>()));
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "event_sink::tests::panic_hook_records_failure"])
            .env("TUARI_PANIC_TEST_ROOT", &root)
            .status()
            .unwrap();
        assert!(status.success());
        let day = fs::read_dir(&root).unwrap().next().unwrap().unwrap().path();
        let log = fs::read_to_string(day.join("desktop.log")).unwrap();
        let events: Vec<serde_json::Value> = log
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert!(events
            .iter()
            .any(|e| e["message"] == "desktop panic" && e["severity"] == "error"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn event_sink_routes_dates_and_counts_errors() {
        let root = std::env::temp_dir().join(format!(
            "tuari-events-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        let mut sink = EventSink::new(root.clone());
        let before = DateTime::parse_from_rfc3339("2025-08-10T23:55:45.123+01:00").unwrap();
        let after = DateTime::parse_from_rfc3339("2025-08-11T00:00:01.000+01:00").unwrap();
        sink.emit("info", "before", None, before).unwrap();
        sink.emit("error", "failure", None, after).unwrap();
        sink.emit("error", "failure", None, after).unwrap();
        let first: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(root.join("2025-08-10/desktop.log")).unwrap())
                .unwrap();
        assert_eq!(first["timestamp"], "2025-08-10T23:55:45.123+01:00");
        let second: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(root.join("2025-08-11/desktop.log")).unwrap())
                .unwrap();
        assert_eq!(second["count"], 2);
        fs::remove_dir_all(root).unwrap();
    }
}
