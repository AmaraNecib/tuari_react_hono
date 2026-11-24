//! Retained chunks are projected independently of the bounded recent-event viewer.
use serde_json::{json, Value};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, BufRead, BufReader, Read},
    path::Path,
};

const MAX_INPUT: u64 = 100 * 1024 * 1024;
const MAX_LINE: u64 = 1024 * 1024;
const MAX_FILES: usize = 1022;
fn invalid() -> io::Error {
    io::Error::other("Unsafe, malformed, or oversized support logs")
}

pub fn chunk_name(name: &str) -> bool {
    ["desktop", "api", "app"].iter().any(|source| {
        name == format!("{source}.log")
            || name
                .strip_prefix(&format!("{source}."))
                .and_then(|s| s.strip_suffix(".log"))
                .is_some_and(|s| {
                    !s.is_empty() && s.len() <= 10 && s.bytes().all(|c| c.is_ascii_digit())
                })
    })
}

// Windows pins directories against rename/delete and opens reparse points themselves.
// Chunk handles allow deletion so retention can proceed during a support export.
fn trusted_open(path: &Path, directory: bool) -> io::Result<File> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink()
        || metadata.is_dir() != directory
        || (!directory && !metadata.is_file())
    {
        return Err(invalid());
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        // O_NOFOLLOW values from the platform ABI. No new native dependency.
        #[cfg(any(target_os = "linux", target_os = "android"))]
        options.custom_flags(0x20000);
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        options.custom_flags(0x100);
        #[cfg(not(any(
            target_os = "linux",
            target_os = "android",
            target_os = "macos",
            target_os = "ios"
        )))]
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "Unsupported trusted log traversal",
        ));
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(invalid());
        }
        options
            .share_mode(if directory { 3 } else { 7 })
            .custom_flags(0x00200000 | if directory { 0x02000000 } else { 0 });
    }
    let file = options.open(path)?;
    let actual = file.metadata()?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if actual.file_attributes() & 0x400 != 0 {
            return Err(invalid());
        }
    }
    if actual.is_dir() != directory || (!directory && !actual.is_file()) {
        return Err(invalid());
    }
    Ok(file)
}

// Directory enumeration stays anchored to the held handle on Unix, even after rename.
fn held_directory_path(file: &File, original: &Path) -> std::path::PathBuf {
    #[cfg(unix)]
    {
        use std::os::fd::AsRawFd;
        let _ = original;
        #[cfg(any(target_os = "linux", target_os = "android"))]
        let prefix = "/proc/self/fd";
        #[cfg(not(any(target_os = "linux", target_os = "android")))]
        let prefix = "/dev/fd";
        std::path::PathBuf::from(prefix).join(file.as_raw_fd().to_string())
    }
    #[cfg(not(unix))]
    {
        let _ = file;
        original.to_path_buf()
    }
}

/// Save/cancel seam shared with the native command. Existing files are never overwritten.
pub fn save(root: &Path, destination: Option<&Path>) -> io::Result<bool> {
    let Some(destination) = destination else {
        return Ok(false);
    };
    let bytes = encode(root)?;
    use std::io::Write;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    Ok(true)
}

/// Export every trusted retained chunk or fail explicitly. No partial archive is returned.
pub fn encode(root: &Path) -> io::Result<Vec<u8>> {
    let mut entries = Vec::new();
    let mut input = 0u64;
    let mut output = 0usize;
    let mut events = 0usize;
    let mut first: Option<chrono::DateTime<chrono::FixedOffset>> = None;
    let mut last = first;
    let mut scanned = 0usize;
    let exists = match fs::symlink_metadata(root) {
        Ok(_) => true,
        Err(e) if e.kind() == io::ErrorKind::NotFound => false,
        Err(e) => return Err(e),
    };
    if exists {
        let root_handle = trusted_open(root, true)?;
        for day in fs::read_dir(held_directory_path(&root_handle, root))? {
            scanned += 1;
            if scanned > 4096 {
                return Err(invalid());
            }
            let day = day?;
            let name = day.file_name().to_string_lossy().into_owned();
            if name.len() != 10 || chrono::NaiveDate::parse_from_str(&name, "%Y-%m-%d").is_err() {
                continue;
            }
            let day_handle = trusted_open(&day.path(), true)?;
            let mut chunks = 0;
            for chunk in fs::read_dir(held_directory_path(&day_handle, &day.path()))? {
                chunks += 1;
                if chunks > 4096 {
                    return Err(invalid());
                }
                let chunk = chunk?;
                let filename = chunk.file_name().to_string_lossy().into_owned();
                if !chunk_name(&filename) {
                    continue;
                }
                if entries.len() >= MAX_FILES {
                    return Err(invalid());
                }
                let file = trusted_open(&chunk.path(), false)?;
                let mut reader = BufReader::new(file);
                let mut projected = Vec::new();
                loop {
                    let mut line = Vec::new();
                    let count = reader
                        .by_ref()
                        .take(MAX_LINE + 1)
                        .read_until(b'\n', &mut line)?;
                    if count == 0 {
                        break;
                    }
                    input = input.checked_add(count as u64).ok_or_else(invalid)?;
                    if count as u64 > MAX_LINE || input > MAX_INPUT || line.last() != Some(&b'\n') {
                        return Err(invalid());
                    }
                    let value: Value = serde_json::from_slice(&line).map_err(|_| invalid())?;
                    let timestamp = value["timestamp"]
                        .as_str()
                        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                        .ok_or_else(invalid)?;
                    let severity = value["severity"]
                        .as_str()
                        .filter(|s| {
                            matches!(*s, "error" | "warn" | "info" | "debug" | "trace" | "fatal")
                        })
                        .ok_or_else(invalid)?;
                    let source = if filename.starts_with("desktop") {
                        "desktop"
                    } else if filename.starts_with("app") {
                        "app"
                    } else {
                        "api"
                    };
                    let category = match value["message"].as_str() {
                        Some("UI failure") => "ui",
                        Some("desktop panic") => "crash",
                        _ if severity == "error" || severity == "fatal" => "error",
                        _ => "lifecycle",
                    };
                    let record = json!({"schemaVersion":1,"timestamp":timestamp.to_rfc3339(),"severity":severity,"source":source,"message":category,"count":value["count"].as_u64().unwrap_or(1),"attributes":{"errorId":value["attributes"]["errorId"].as_u64().and_then(|v| u32::try_from(v).ok())}});
                    let bytes = serde_json::to_vec(&record)?;
                    output = output.checked_add(bytes.len() + 1).ok_or_else(invalid)?;
                    if output > crate::support_zip::MAX_BYTES {
                        return Err(invalid());
                    }
                    projected.extend(bytes);
                    projected.push(b'\n');
                    events += 1;
                    first = Some(first.map_or(timestamp, |t| t.min(timestamp)));
                    last = Some(last.map_or(timestamp, |t| t.max(timestamp)));
                }
                entries.push((format!("{name}/{filename}"), projected));
            }
        }
    }
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    let manifest = json!({"schemaVersion":1,"product":"Tuari","version":env!("CARGO_PKG_VERSION"),"os":std::env::consts::OS,"build":option_env!("GIT_SHA").unwrap_or("unknown"),"createdAt":chrono::Local::now().to_rfc3339(),"firstEventAt":first,"lastEventAt":last,"eventCount":events,"chunkCount":entries.len(),"projection":"allowlisted-metadata","complete":true});
    entries.push(("manifest.json".into(), serde_json::to_vec(&manifest)?));
    entries.push((
        "config.json".into(),
        br#"{"localLogging":true,"telemetry":false}"#.to_vec(),
    ));
    crate::support_zip::encode(&entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retained_chunks_not_recent_view() {
        let root = std::env::temp_dir().join(format!("tuari-support-{}", rand::random::<u128>()));
        for day in ["2026-01-01", "2026-01-02"] {
            fs::create_dir_all(root.join(day)).unwrap();
            for chunk in ["desktop.log", "api.1.log"] {
                let line = "{\"timestamp\":\"2026-01-01T12:00:00Z\",\"severity\":\"error\",\"message\":\"SECRET\",\"attributes\":{\"token\":\"SECRET\",\"errorId\":42}}\n";
                fs::write(root.join(day).join(chunk), line.repeat(60)).unwrap();
            }
            fs::write(root.join(day).join("database.sqlite"), "SECRET_DATABASE").unwrap();
        }
        let zip = encode(&root).unwrap();
        assert!(!zip.windows(6).any(|w| w == b"SECRET"));
        if let Some(path) = std::env::var_os("TUARI_RETAINED_ZIP_FIXTURE") {
            fs::write(path, zip).unwrap();
        }
        let saved = root.join("export.zip");
        assert!(!save(&root, None).unwrap());
        assert!(!saved.exists());
        assert!(save(&root, Some(&saved)).unwrap());
        let before = fs::read(&saved).unwrap();
        assert!(save(&root, Some(&saved)).is_err());
        assert_eq!(fs::read(&saved).unwrap(), before);
        assert!(save(&root, Some(&root.join("missing/export.zip"))).is_err());
        fs::write(root.join("2026-01-01/desktop.log"), "broken\n").unwrap();
        assert!(encode(&root).is_err());
        assert!(save(&root, Some(&root.join("malformed.zip"))).is_err());
        assert!(!root.join("malformed.zip").exists());
    }
    #[test]
    fn rejects_oversized_lines_without_partial_success() {
        let root =
            std::env::temp_dir().join(format!("tuari-support-limit-{}", rand::random::<u128>()));
        fs::create_dir_all(root.join("2026-01-01")).unwrap();
        fs::write(
            root.join("2026-01-01/desktop.log"),
            vec![b'x'; MAX_LINE as usize + 1],
        )
        .unwrap();
        assert!(encode(&root).is_err());
    }
    #[test]
    fn app_chunks_keep_their_source() {
        let root =
            std::env::temp_dir().join(format!("tuari-support-app-{}", rand::random::<u128>()));
        fs::create_dir_all(root.join("2026-01-01")).unwrap();
        fs::write(root.join("2026-01-01/app.log"), b"{\"timestamp\":\"2026-01-01T12:00:00Z\",\"severity\":\"warn\",\"source\":\"untrusted\"}\n").unwrap();
        let zip = encode(&root).unwrap();
        assert!(zip
            .windows(b"\"source\":\"app\"".len())
            .any(|w| w == b"\"source\":\"app\""));
        assert!(!zip.windows(b"untrusted".len()).any(|w| w == b"untrusted"));
    }
    #[test]
    fn explicit_chunk_input_and_output_budgets() {
        let root =
            std::env::temp_dir().join(format!("tuari-support-budgets-{}", rand::random::<u128>()));
        let day = root.join("2026-01-01");
        fs::create_dir_all(&day).unwrap();
        for i in 0..MAX_FILES {
            fs::write(day.join(format!("api.{i}.log")), b"").unwrap();
        }
        assert!(encode(&root).is_ok());
        fs::write(day.join("desktop.log"), b"").unwrap();
        let dest = root.join("over-count.zip");
        assert!(save(&root, Some(&dest)).is_err());
        assert!(!dest.exists());

        let root = root.join("bytes");
        fs::create_dir_all(root.join("2026-01-01")).unwrap();
        let path = root.join("2026-01-01/api.log");
        let line = b"{\"timestamp\":\"2026-01-01T12:00:00Z\",\"severity\":\"error\",\"message\":\"secret\"}\n";
        fs::write(&path, line.repeat(60_000)).unwrap();
        let dest = root.join("over-output.zip");
        assert!(save(&root, Some(&dest)).is_err());
        assert!(!dest.exists());
        use std::io::Write;
        let mut file = File::create(&path).unwrap();
        let padding = "x".repeat(900_000);
        let line = format!("{{\"timestamp\":\"2026-01-01T12:00:00Z\",\"severity\":\"info\",\"ignored\":\"{padding}\"}}\n");
        for _ in 0..(MAX_INPUT / line.len() as u64 + 1) {
            file.write_all(line.as_bytes()).unwrap();
        }
        drop(file);
        let dest = root.join("over-input.zip");
        assert!(save(&root, Some(&dest)).is_err());
        assert!(!dest.exists());
    }
    #[cfg(unix)]
    #[test]
    fn held_directory_survives_replacement_and_rejects_links() {
        use std::os::unix::fs::symlink;
        let root =
            std::env::temp_dir().join(format!("tuari-support-race-{}", rand::random::<u128>()));
        fs::create_dir_all(root.join("2026-01-01")).unwrap();
        let held = trusted_open(&root.join("2026-01-01"), true).unwrap();
        fs::write(root.join("2026-01-01/api.log"), b"original").unwrap();
        fs::rename(root.join("2026-01-01"), root.join("moved")).unwrap();
        fs::create_dir(root.join("outside")).unwrap();
        fs::write(root.join("outside/api.log"), b"outside").unwrap();
        symlink(root.join("outside"), root.join("2026-01-01")).unwrap();
        let anchored = held_directory_path(&held, &root.join("2026-01-01"));
        let mut bytes = Vec::new();
        trusted_open(&anchored.join("api.log"), false)
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        assert_eq!(bytes, b"original");
        assert!(encode(&root).is_err());
        symlink(root.join("outside/api.log"), anchored.join("desktop.log")).unwrap();
        assert!(trusted_open(&anchored.join("desktop.log"), false).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn chunk_reader_allows_retention_but_directory_remains_pinned() {
        let root = std::env::temp_dir().join(format!("tuari-share-{}", rand::random::<u128>()));
        let day = root.join("2026-01-01");
        fs::create_dir_all(&day).unwrap();
        let path = day.join("desktop.log");
        fs::write(&path, b"retained record").unwrap();
        let directory = trusted_open(&day, true).unwrap();
        let mut reader = trusted_open(&path, false).unwrap();
        assert!(fs::rename(&day, root.join("moved")).is_err());
        fs::remove_file(&path).unwrap();
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes).unwrap();
        assert_eq!(bytes, b"retained record");
        let mut sink = crate::event_sink::EventSink::new(root.clone());
        sink.emit(
            "error",
            "new event",
            None,
            chrono::DateTime::parse_from_rfc3339("2026-02-15T12:00:00Z").unwrap(),
        )
        .unwrap();
        assert!(root.join("2026-02-15/desktop.log").exists());
        drop(reader);
        drop(directory);
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn rejects_junction_day() {
        let root =
            std::env::temp_dir().join(format!("tuari-support-link-{}", rand::random::<u128>()));
        fs::create_dir_all(root.join("outside")).unwrap();
        let status = std::process::Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(root.join("2026-01-01"))
            .arg(root.join("outside"))
            .status()
            .unwrap();
        assert!(status.success());
        assert!(encode(&root).is_err());
    }
}
