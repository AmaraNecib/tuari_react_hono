//! Desktop adapter for the event-sink protocol. Each process owns its chunk prefix.
use chrono::{DateTime, FixedOffset, Local, SecondsFormat};
use serde_json::json;
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
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
    marker: String,
}

pub struct EventSink {
    root: PathBuf,
    duplicates: HashMap<String, Duplicate>,
    chunks: HashMap<String, usize>,
}
impl EventSink {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            duplicates: HashMap::new(),
            chunks: HashMap::new(),
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
        let day = now.format("%Y-%m-%d").to_string();
        let signature = json!([day, message, error]).to_string();
        if severity == "error" {
            if let Some(duplicate) = self.duplicates.get_mut(&signature) {
                if update_duplicate(duplicate)? {
                    return Ok(());
                }
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
        let marker = format!(",\"recordId\":\"{:032x}\",", rand::random::<u128>());
        let line = format!("{{\"count\":{:>12}{}{}\n", 1, marker, &payload[1..]);
        if line.len() as u64 > 100 * 1024 * 1024 {
            return Err(std::io::Error::other("event exceeds log capacity"));
        }
        self.cleanup_reserved(now, line.len() as u64)?;
        let mut index = match self.chunks.get(&day) {
            Some(index) => *index,
            None => fs::read_dir(&dir)?
                .filter_map(Result::ok)
                .filter_map(|entry| {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name == "desktop.log" {
                        Some(0)
                    } else {
                        name.strip_prefix("desktop.")?
                            .strip_suffix(".log")?
                            .parse::<usize>()
                            .ok()
                    }
                })
                .max()
                .unwrap_or(0),
        };
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
                let mut file = OpenOptions::new().read(true).write(true).open(&path)?;
                let original_size = size;
                let mut end = size;
                let mut buffer = [0_u8; 4096];
                while end > 0 {
                    let start = end.saturating_sub(buffer.len() as u64);
                    let length = (end - start) as usize;
                    file.seek(SeekFrom::Start(start))?;
                    file.read_exact(&mut buffer[..length])?;
                    if let Some(pos) = buffer[..length].iter().rposition(|b| *b == b'\n') {
                        size = start + pos as u64 + 1;
                        break;
                    }
                    end = start;
                    if end == 0 {
                        size = 0;
                    }
                }
                if size != original_size {
                    file.set_len(size)?;
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
        self.chunks.insert(day, index);
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
                    marker,
                },
            );
        }
        self.cleanup(now)
    }
    pub fn cleanup(&mut self, now: DateTime<FixedOffset>) -> std::io::Result<()> {
        self.cleanup_reserved(now, 0)
    }
    fn cleanup_reserved(
        &mut self,
        now: DateTime<FixedOffset>,
        reserved: u64,
    ) -> std::io::Result<()> {
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
            if day < cutoff || total + reserved > 100 * 1024 * 1024 {
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
fn update_duplicate(duplicate: &mut Duplicate) -> std::io::Result<bool> {
    let mut file = match OpenOptions::new()
        .read(true)
        .write(true)
        .open(&duplicate.path)
    {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(e),
    };
    file.seek(SeekFrom::Start(duplicate.offset + 12))?;
    let mut marker = vec![0_u8; duplicate.marker.len()];
    match file.read_exact(&mut marker) {
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(false),
        Err(e) => return Err(e),
        Ok(()) => {}
    }
    if marker != duplicate.marker.as_bytes() {
        return Ok(false);
    }
    duplicate.count += 1;
    file.seek(SeekFrom::Start(duplicate.offset))?;
    file.write_all(format!("{:>12}", duplicate.count).as_bytes())?;
    Ok(true)
}
fn owned_log(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
        return false;
    };
    let Some(stem) = name.strip_suffix(".log") else {
        return false;
    };
    let mut parts = stem.split('.');
    matches!(parts.next(), Some("desktop"))
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
#[cfg(test)]
thread_local! {
    static TEST_SINK: std::cell::RefCell<Option<EventSink>> = const { std::cell::RefCell::new(None) };
}
#[cfg(test)]
pub(crate) fn capture_events(operation: impl FnOnce()) -> Vec<serde_json::Value> {
    let root = std::env::temp_dir().join(format!("tuari-caller-events-{}", rand::random::<u64>()));
    TEST_SINK.with(|cell| *cell.borrow_mut() = Some(EventSink::new(root.clone())));
    operation();
    TEST_SINK.with(|cell| *cell.borrow_mut() = None);
    let mut events = Vec::new();
    for day in fs::read_dir(&root).unwrap() {
        let text = fs::read_to_string(day.unwrap().path().join("desktop.log")).unwrap();
        events.extend(
            text.lines()
                .map(|line| serde_json::from_str::<serde_json::Value>(line).unwrap()),
        );
    }
    fs::remove_dir_all(root).unwrap();
    events
}
pub fn emit(severity: &str, message: &str, error: Option<String>) {
    #[cfg(test)]
    if TEST_SINK.with(|cell| {
        if let Some(sink) = cell.borrow_mut().as_mut() {
            sink.emit(
                severity,
                message,
                error.clone(),
                Local::now().fixed_offset(),
            )
            .unwrap();
            true
        } else {
            false
        }
    }) {
        return;
    }
    let result = (|| -> std::io::Result<()> {
        let sink = SINK
            .get()
            .ok_or_else(|| std::io::Error::other("logger unavailable"))?;
        let mut guard = if std::thread::panicking() {
            sink.try_lock()
                .map_err(|_| std::io::Error::other("logger busy during panic"))?
        } else {
            sink.lock()
                .map_err(|_| std::io::Error::other("logger poisoned"))?
        };
        guard.emit(
            severity,
            message,
            error.clone(),
            Local::now().fixed_offset(),
        )
    })();
    if result.is_err() {
        DEGRADED.store(true, Ordering::Relaxed);
        let _ = writeln!(
            std::io::stderr(),
            "Local logging degraded: {message}: {}",
            error.as_deref().unwrap_or("")
        );
    }
}
pub fn degraded() -> bool {
    DEGRADED.load(Ordering::Relaxed)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn event_sink_preserves_other_writers_replacements_and_midnight_errors() {
        let root = std::env::temp_dir().join(format!("tuari-isolation-{}", rand::random::<u64>()));
        let before = DateTime::parse_from_rfc3339("2025-08-10T23:59:50.000+01:00").unwrap();
        let after = DateTime::parse_from_rfc3339("2025-08-11T00:00:10.000+01:00").unwrap();
        let mut sink = EventSink::new(root.clone());
        sink.emit("error", "repeat", None, before).unwrap();
        let file = root.join("2025-08-10/desktop.log");
        fs::write(&file, "{\"message\":\"replacement\"}\n").unwrap();
        sink.emit("error", "repeat", None, before).unwrap();
        let events: Vec<serde_json::Value> = fs::read_to_string(&file)
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(events[0]["message"], "replacement");
        assert_eq!(events[1]["message"], "repeat");
        fs::write(root.join("2025-08-10/api.log"), "other-process\n").unwrap();
        sink.emit("error", "repeat", None, after).unwrap();
        let event: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(root.join("2025-08-11/desktop.log")).unwrap())
                .unwrap();
        assert_eq!(event["count"], 1);
        sink.cleanup(after + chrono::Duration::days(40)).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("2025-08-10/api.log")).unwrap(),
            "other-process\n"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn ordinary_concurrent_capture_waits_and_preserves_details() {
        if let Ok(root) = std::env::var("TUARI_CONCURRENT_ROOT") {
            initialize(PathBuf::from(&root));
            let guard = SINK.get().unwrap().lock().unwrap();
            let (started_tx, started_rx) = std::sync::mpsc::channel();
            let (done_tx, done_rx) = std::sync::mpsc::channel();
            let worker = std::thread::spawn(move || {
                started_tx.send(()).unwrap();
                emit(
                    "error",
                    "API stderr",
                    Some("concurrent failure details".into()),
                );
                done_tx.send(()).unwrap();
            });
            started_rx
                .recv_timeout(std::time::Duration::from_secs(5))
                .unwrap();
            let early = done_rx.recv_timeout(std::time::Duration::from_millis(100));
            drop(guard);
            worker.join().unwrap();
            assert!(
                early.is_err(),
                "ordinary writes must wait, not discard the error"
            );
            done_rx
                .recv_timeout(std::time::Duration::from_secs(5))
                .unwrap();
            return;
        }
        let root = std::env::temp_dir().join(format!("tuari-concurrent-{}", rand::random::<u64>()));
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "event_sink::tests::ordinary_concurrent_capture_waits_and_preserves_details",
            ])
            .env("TUARI_CONCURRENT_ROOT", &root)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let day = fs::read_dir(&root).unwrap().next().unwrap().unwrap().path();
        let log = fs::read_to_string(day.join("desktop.log")).unwrap();
        let events: Vec<serde_json::Value> = log
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert!(events
            .iter()
            .any(|e| e["attributes"]["error"] == "concurrent failure details"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn panic_hook_records_failure() {
        if let Ok(root) = std::env::var("TUARI_PANIC_TEST_ROOT") {
            initialize(PathBuf::from(root));
            let guard = if std::env::var_os("TUARI_PANIC_LOCKED").is_some() {
                Some(SINK.get().unwrap().lock().unwrap())
            } else {
                None
            };
            let _ = std::panic::catch_unwind(|| panic!("panic capture probe"));
            drop(guard);
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
    fn panic_while_locked_preserves_details_without_deadlocking() {
        let root =
            std::env::temp_dir().join(format!("tuari-locked-panic-{}", rand::random::<u64>()));
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "event_sink::tests::panic_hook_records_failure"])
            .env("TUARI_PANIC_TEST_ROOT", &root)
            .env("TUARI_PANIC_LOCKED", "1")
            .output()
            .unwrap();
        assert!(output.status.success());
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            stderr.contains("Local logging degraded: desktop panic:"),
            "{stderr}"
        );
        assert!(stderr.contains("panic capture probe"), "{stderr}");
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
