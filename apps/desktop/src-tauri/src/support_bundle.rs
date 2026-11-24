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

// Windows denies rename/delete while these handles are alive and opens reparse points themselves.
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
    #[cfg(windows)]
    {
        use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(invalid());
        }
        options
            .share_mode(3)
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
    if root.try_exists()? {
        let _root_handle = trusted_open(root, true)?;
        for day in fs::read_dir(root)? {
            scanned += 1;
            if scanned > 4096 {
                return Err(invalid());
            }
            let day = day?;
            let name = day.file_name().to_string_lossy().into_owned();
            if name.len() != 10 || chrono::NaiveDate::parse_from_str(&name, "%Y-%m-%d").is_err() {
                continue;
            }
            let _day_handle = trusted_open(&day.path(), true)?;
            let mut chunks = 0;
            for chunk in fs::read_dir(day.path())? {
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
