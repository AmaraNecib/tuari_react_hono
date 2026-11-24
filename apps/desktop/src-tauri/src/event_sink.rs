//! Desktop adapter for the event-sink protocol. Each process owns its chunk prefix.
use chrono::{DateTime, FixedOffset, Local, SecondsFormat};
use serde_json::json;
use std::collections::{HashMap, VecDeque};
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Mutex, OnceLock,
};

static SINK: OnceLock<Mutex<EventSink>> = OnceLock::new();
static DEGRADED: AtomicBool = AtomicBool::new(false);
static DROPPED_EVENTS: AtomicUsize = AtomicUsize::new(0);
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
    recent: VecDeque<DiagnosticEvent>,
}
impl EventSink {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            duplicates: HashMap::new(),
            chunks: HashMap::new(),
            recent: VecDeque::new(),
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
        self.emit_with_error_id(severity, message, error, None, now)
    }
    fn emit_with_error_id(
        &mut self,
        severity: &str,
        message: &str,
        error: Option<String>,
        error_id: Option<u32>,
        now: DateTime<FixedOffset>,
    ) -> std::io::Result<()> {
        let instant = now.timestamp_millis();
        self.duplicates
            .retain(|_, d| instant >= d.instant && instant - d.instant < 60_000);
        let day = now.format("%Y-%m-%d").to_string();
        let signature = json!([day, message, error, error_id]).to_string();
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
        let mut attributes = serde_json::Map::new();
        attributes.insert("error".into(), json!(error));
        if let Some(id) = error_id {
            attributes.insert("errorId".into(), json!(id));
        }
        let payload = json!({ "schemaVersion": 1, "timestamp": now.to_rfc3339_opts(SecondsFormat::Millis, false),
            "severity": severity, "source": "desktop", "message": message,
            "lifecycle": severity != "error", "attributes": attributes }).to_string();
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
        if matches!(severity, "error" | "warn" | "info") {
            if self.recent.len() == 100 {
                self.recent.pop_front();
            }
            let category = match message {
                "UI failure" => "ui",
                "desktop panic" => "crash",
                _ if severity == "error" => "error",
                _ => "lifecycle",
            };
            self.recent.push_back(DiagnosticEvent {
                occurred_at: now.to_rfc3339_opts(SecondsFormat::Millis, false),
                level: severity.to_owned(),
                source: "desktop".into(),
                category: category.to_owned(),
                error_id,
            });
        }
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
    pub fn diagnostic_snapshot(&self) -> Vec<DiagnosticEvent> {
        let mut events = self.persisted_diagnostics().unwrap_or_default();
        // Reconcile multiplicities, not just unique metadata. Distinct failures can
        // have identical timestamps and projections, including absent error IDs.
        let mut counts = HashMap::new();
        for event in &events {
            *counts.entry(event.clone()).or_insert(0usize) += 1;
        }
        for event in &self.recent {
            match counts.get_mut(event) {
                Some(count) if *count > 0 => *count -= 1,
                _ => events.push(event.clone()),
            }
        }
        bound_diagnostics(&mut events);
        events
    }
    /// Read bounded metadata projections, never messages, attributes or raw errors.
    pub fn persisted_diagnostics(&self) -> std::io::Result<Vec<DiagnosticEvent>> {
        let mut events = Vec::new();
        if !self.root.exists() {
            return Ok(events);
        }
        if fs::symlink_metadata(&self.root)?.file_type().is_symlink() {
            return Err(std::io::Error::other("log root is a link"));
        }
        let mut days = Vec::new();
        for entry in fs::read_dir(&self.root)?.take(1024) {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            if entry.file_type()?.is_dir()
                && name.len() == 10
                && chrono::NaiveDate::parse_from_str(&name, "%Y-%m-%d").is_ok()
            {
                days.push(entry.path());
            }
        }
        days.sort();
        let mut budget = 8 * 1024 * 1024;
        for day in days.into_iter().rev().take(30) {
            let mut files = Vec::new();
            for entry in fs::read_dir(day)?.take(256) {
                let entry = entry?;
                let name = entry.file_name().to_string_lossy().to_string();
                if !entry.file_type()?.is_file()
                    || !(owned_log(&entry.path())
                        || name == "app.log"
                        || name == "api.log"
                        || name
                            .strip_prefix("api.")
                            .or_else(|| name.strip_prefix("app."))
                            .and_then(|n| n.strip_suffix(".log"))
                            .is_some_and(|n| {
                                !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit())
                            }))
                {
                    continue;
                }
                files.push((entry.path(), name));
            }
            files.sort();
            let mut remaining = files.len();
            for (path, name) in files {
                // Give every chunk a tail allowance so directory enumeration order
                // and an older large chunk cannot hide the latest records.
                let allowance = budget / remaining;
                remaining -= 1;
                let mut file = std::fs::File::open(path)?;
                let size = file.metadata()?.len();
                let start = size.saturating_sub(allowance as u64);
                file.seek(SeekFrom::Start(start))?;
                let mut bytes = Vec::new();
                file.take(allowance as u64).read_to_end(&mut bytes)?;
                budget -= bytes.len();
                let bytes = if start > 0 {
                    // The first fragment may be half a JSON record.
                    bytes
                        .iter()
                        .position(|b| *b == b'\n')
                        .map_or(&[][..], |end| &bytes[end + 1..])
                } else {
                    &bytes[..]
                };
                for line in bytes.split(|b| *b == b'\n') {
                    let Ok(value) = serde_json::from_slice::<serde_json::Value>(line) else {
                        continue;
                    };
                    let Some(timestamp) = value["timestamp"]
                        .as_str()
                        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
                    else {
                        continue;
                    };
                    let Some(level @ ("error" | "warn" | "info")) = value["severity"].as_str()
                    else {
                        continue;
                    };
                    let error_id = value["attributes"]["errorId"]
                        .as_u64()
                        .and_then(|v| u32::try_from(v).ok());
                    events.push(DiagnosticEvent {
                        occurred_at: timestamp.to_rfc3339_opts(SecondsFormat::Millis, false),
                        level: level.into(),
                        source: if name.starts_with("desktop") {
                            "desktop"
                        } else {
                            "api"
                        }
                        .into(),
                        category: match value["message"].as_str() {
                            Some("UI failure") => "ui",
                            Some("desktop panic") => "crash",
                            _ if level == "error" => "error",
                            _ => "lifecycle",
                        }
                        .into(),
                        error_id,
                    });
                }
                if budget == 0 {
                    break;
                }
            }
            if budget == 0 {
                break;
            }
        }
        bound_diagnostics(&mut events);
        Ok(events)
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
    emit_record(severity, message, error, None);
}
pub fn record_ui_failure(error_id: u32) {
    emit_record("error", "UI failure", None, Some(error_id));
}
fn emit_record(severity: &str, message: &str, error: Option<String>, error_id: Option<u32>) {
    #[cfg(test)]
    if TEST_SINK.with(|cell| {
        if let Some(sink) = cell.borrow_mut().as_mut() {
            sink.emit_with_error_id(
                severity,
                message,
                error.clone(),
                error_id,
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
        guard.emit_with_error_id(
            severity,
            message,
            error.clone(),
            error_id,
            Local::now().fixed_offset(),
        )
    })();
    if result.is_err() {
        DROPPED_EVENTS.fetch_add(1, Ordering::Relaxed);
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

#[derive(Clone, Debug, PartialEq, Eq, Hash, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticEvent {
    pub occurred_at: String,
    pub level: String,
    pub source: String,
    pub category: String,
    pub error_id: Option<u32>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticStatus {
    pub enabled: bool,
    pub initialized: bool,
    pub buffered_event_count: usize,
    pub dropped_event_count: usize,
}

fn bound_diagnostics(events: &mut Vec<DiagnosticEvent>) {
    events.sort_by_key(|e| {
        DateTime::parse_from_rfc3339(&e.occurred_at)
            .map(|d| d.timestamp_millis())
            .unwrap_or(0)
    });
    if events.len() > 100 {
        events.drain(..events.len() - 100);
    }
}

fn read_diagnostics(
    lock: &Mutex<EventSink>,
    scan: impl FnOnce(EventSink) -> Vec<DiagnosticEvent>,
) -> Vec<DiagnosticEvent> {
    let snapshot = {
        let Ok(sink) = lock.lock() else {
            return Vec::new();
        };
        let mut snapshot = EventSink::new(sink.root.clone());
        snapshot.recent = sink.recent.clone();
        snapshot
    };
    scan(snapshot)
}

/// Copy process state under the writer lock; scan retained files without it.
pub fn recent_diagnostics() -> (Vec<DiagnosticEvent>, DiagnosticStatus) {
    let initialized = SINK.get().is_some();
    let events = SINK
        .get()
        .map(|lock| read_diagnostics(lock, |sink| sink.diagnostic_snapshot()))
        .unwrap_or_default();
    (
        events,
        DiagnosticStatus {
            enabled: initialized,
            initialized,
            // Native events are written synchronously; there is no pending buffer.
            buffered_event_count: 0,
            dropped_event_count: DROPPED_EVENTS.load(Ordering::Relaxed),
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retained_scan_releases_writer_lock_and_keeps_snapshot() {
        let root = std::env::temp_dir().join(format!("tuari-read-lock-{}", rand::random::<u64>()));
        let lock = Mutex::new(EventSink::new(root.clone()));
        let now = DateTime::parse_from_rfc3339("2026-01-02T12:00:00Z").unwrap();
        lock.lock()
            .unwrap()
            .emit("info", "startup", None, now)
            .unwrap();
        let events = read_diagnostics(&lock, |snapshot| {
            let mut writer = lock
                .try_lock()
                .expect("scan must not hold the logging lock");
            writer
                .emit("error", "concurrent failure", None, now)
                .unwrap();
            drop(writer);
            snapshot.diagnostic_snapshot()
        });
        assert_eq!(events.len(), 2);
        assert_eq!(events.last().unwrap().level, "error");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn oversized_single_chunk_reads_tail_not_partial_prefix() {
        let root = std::env::temp_dir().join(format!("tuari-large-tail-{}", rand::random::<u64>()));
        fs::create_dir_all(root.join("2026-01-02")).unwrap();
        let mut bytes = vec![b' '; 9 * 1024 * 1024];
        bytes.extend_from_slice(b"\n{\"timestamp\":\"2026-01-02T12:00:00Z\",\"severity\":\"error\",\"attributes\":{\"errorId\":99}}\n");
        fs::write(root.join("2026-01-02/desktop.log"), bytes).unwrap();
        let events = EventSink::new(root.clone())
            .persisted_diagnostics()
            .unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].error_id, Some(99));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn bounded_history_keeps_newest_chunk_tail_and_memory_events() {
        let root = std::env::temp_dir().join(format!("tuari-tail-{}", rand::random::<u64>()));
        let day = root.join("2026-01-02");
        fs::create_dir_all(&day).unwrap();
        let padding = vec![b' '; 5 * 1024 * 1024];
        fs::write(day.join("desktop.log"), &padding).unwrap();
        let mut newer = padding;
        newer.extend_from_slice(b"\n{\"timestamp\":\"2026-01-02T12:00:00Z\",\"severity\":\"error\",\"attributes\":{\"errorId\":42}}\n");
        fs::write(day.join("desktop.1.log"), newer).unwrap();
        let mut sink = EventSink::new(root.clone());
        sink.recent.push_back(DiagnosticEvent {
            occurred_at: "2026-01-02T13:00:00.000+00:00".into(),
            level: "error".into(),
            source: "desktop".into(),
            category: "ui".into(),
            error_id: Some(43),
        });
        let events = sink.diagnostic_snapshot();
        assert_eq!(
            events.iter().map(|e| e.error_id).collect::<Vec<_>>(),
            vec![Some(42), Some(43)]
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reopened_sink_projects_history_and_excludes_business_data() {
        let root = std::env::temp_dir().join(format!("tuari-history-{}", rand::random::<u64>()));
        fs::create_dir_all(root.join("2026-01-02")).unwrap();
        fs::write(root.join("2026-01-02/desktop.log"), concat!(
            "{\"timestamp\":\"2026-01-02T12:00:00Z\",\"severity\":\"error\",\"message\":\"UI failure\",\"attributes\":{\"errorId\":42,\"token\":\"SECRET_TOKEN\"},\"customer\":\"PRIVATE_CUSTOMER\"}\n",
            "{\"timestamp\":\"SECRET_TIMESTAMP\",\"severity\":\"error\"}\n"
        )).unwrap();
        fs::write(root.join("2026-01-02/database.sqlite"), "SECRET_DATABASE").unwrap();
        fs::write(root.join("config.json"), "SECRET_CONFIG").unwrap();
        let events = EventSink::new(root.clone())
            .persisted_diagnostics()
            .unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].error_id, Some(42));
        assert_eq!(events[0].category, "ui");
        assert_eq!(events[0].occurred_at, "2026-01-02T12:00:00.000+00:00");
        let text = serde_json::to_string(&events).unwrap();
        assert!(!text.contains("SECRET"));
        assert!(!text.contains("PRIVATE"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn diagnostics_are_bounded_redacted_and_keep_distinct_failure_codes() {
        let root = std::env::temp_dir().join(format!("tuari-snapshot-{}", rand::random::<u64>()));
        let mut sink = EventSink::new(root);
        let now = DateTime::parse_from_rfc3339("2026-01-02T03:04:05+00:00").unwrap();
        for id in 0..105 {
            sink.emit_with_error_id(
                "error",
                "secret customer payload",
                Some("token=secret".into()),
                Some(id),
                now,
            )
            .unwrap();
        }
        let events = sink.diagnostic_snapshot();
        assert_eq!(events.len(), 100);
        assert_eq!(events.first().unwrap().error_id, Some(5));
        assert_eq!(events.last().unwrap().error_id, Some(104));
        assert_eq!(events[0].occurred_at, "2026-01-02T03:04:05.000+00:00");
        let serialized = serde_json::to_string(&events).unwrap();
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("token"));
        assert_eq!(events[0].category, "error");
    }
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
    fn ui_failure_event_contains_only_numeric_correlation_id() {
        let events = capture_events(|| record_ui_failure(4_294_967_295));
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["message"], "UI failure");
        assert_eq!(events[0]["severity"], "error");
        assert_eq!(events[0]["attributes"]["errorId"], 4_294_967_295_u64);
        assert!(events[0]["attributes"]["error"].is_null());
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
