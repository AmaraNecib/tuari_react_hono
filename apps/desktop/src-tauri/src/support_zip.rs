//! Store-only ZIP output for sanitized support records. No extraction or arbitrary names.
use std::io::{self, Write};

pub const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_ENTRIES: usize = 1024;

fn valid_name(name: &str) -> bool {
    if matches!(name, "manifest.json" | "config.json") {
        return true;
    }
    let Some((day, file)) = name.split_once('/') else {
        return false;
    };
    day.len() == 10
        && day.bytes().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 {
                c == b'-'
            } else {
                c.is_ascii_digit()
            }
        })
        && crate::support_bundle::chunk_name(file)
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = !0u32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = (crc >> 1) ^ (0xedb88320 & 0u32.wrapping_sub(crc & 1));
        }
    }
    !crc
}
fn u16le(out: &mut Vec<u8>, n: u16) {
    out.extend(n.to_le_bytes());
}
fn u32le(out: &mut Vec<u8>, n: u32) {
    out.extend(n.to_le_bytes());
}

/// Callers supply projected JSON only, never raw log bytes or filesystem paths.
pub fn encode(entries: &[(String, Vec<u8>)]) -> io::Result<Vec<u8>> {
    let invalid = || io::Error::new(io::ErrorKind::InvalidInput, "invalid support entries");
    if entries.is_empty() || entries.len() > MAX_ENTRIES {
        return Err(invalid());
    }
    let mut total = 0usize;
    let mut names = std::collections::HashSet::new();
    for (name, bytes) in entries {
        total = total.checked_add(bytes.len()).ok_or_else(invalid)?;
        if !valid_name(name) || !names.insert(name) || total > MAX_BYTES {
            return Err(invalid());
        }
    }
    let mut out = Vec::new();
    let mut central = Vec::new();
    for (name, bytes) in entries {
        let offset = out.len() as u32;
        let crc = crc32(bytes);
        u32le(&mut out, 0x04034b50);
        for value in [20, 0, 0, 0, 33] {
            u16le(&mut out, value);
        }
        u32le(&mut out, crc);
        u32le(&mut out, bytes.len() as u32);
        u32le(&mut out, bytes.len() as u32);
        u16le(&mut out, name.len() as u16);
        u16le(&mut out, 0);
        out.write_all(name.as_bytes())?;
        out.write_all(bytes)?;
        u32le(&mut central, 0x02014b50);
        for value in [20, 20, 0, 0, 0, 33] {
            u16le(&mut central, value);
        }
        u32le(&mut central, crc);
        u32le(&mut central, bytes.len() as u32);
        u32le(&mut central, bytes.len() as u32);
        u16le(&mut central, name.len() as u16);
        for _ in 0..4 {
            u16le(&mut central, 0);
        }
        u32le(&mut central, 0);
        u32le(&mut central, offset);
        central.extend(name.as_bytes());
    }
    let offset = out.len() as u32;
    let size = central.len() as u32;
    out.extend(central);
    u32le(&mut out, 0x06054b50);
    u16le(&mut out, 0);
    u16le(&mut out, 0);
    u16le(&mut out, entries.len() as u16);
    u16le(&mut out, entries.len() as u16);
    u32le(&mut out, size);
    u32le(&mut out, offset);
    u16le(&mut out, 0);
    if out.len() > MAX_BYTES {
        return Err(invalid());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_paths_duplicates_and_capacity_overflow() {
        for name in [
            "../database.sqlite",
            "database.sqlite",
            "2026-01-01/secret.log",
            "/manifest.json",
        ] {
            assert!(encode(&[(name.into(), vec![])]).is_err());
        }
        assert!(encode(&[
            ("manifest.json".into(), vec![]),
            ("manifest.json".into(), vec![])
        ])
        .is_err());
        assert!(encode(&[("manifest.json".into(), vec![0; MAX_BYTES + 1])]).is_err());
        // Payload fits exactly, but ZIP headers make the final archive too large.
        assert!(encode(&[("manifest.json".into(), vec![0; MAX_BYTES])]).is_err());
        assert!(encode(
            &(0..1025)
                .map(|_| ("config.json".into(), vec![]))
                .collect::<Vec<_>>()
        )
        .is_err());
    }
    #[test]
    fn independent_reader_fixture() {
        let path =
            std::env::temp_dir().join(format!("tuari-zip-reader-{}.zip", rand::random::<u128>()));
        let bytes = encode(&[
            ("manifest.json".into(), b"{\"product\":\"Tuari\"}".to_vec()),
            (
                "2026-01-02/desktop.log".into(),
                b"{\"errorId\":42}\n".to_vec(),
            ),
        ])
        .unwrap();
        std::fs::write(&path, bytes).unwrap();
        // Python's standard-library reader independently validates the central
        // directory, local headers, payloads and CRCs. No third-party package.
        let reader = if cfg!(windows) { "python" } else { "python3" };
        let output = std::process::Command::new(reader)
            .args([
                "-c",
                r#"
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    assert archive.namelist() == ['manifest.json', '2026-01-02/desktop.log']
    assert archive.read('manifest.json') == b'{"product":"Tuari"}'
    assert archive.read('2026-01-02/desktop.log') == b'{"errorId":42}\n'
    assert archive.testzip() is None
"#,
            ])
            .arg(&path)
            .output()
            .expect("Python 3 is required for independent ZIP compatibility proof");
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        std::fs::remove_file(path).unwrap();
    }
}
