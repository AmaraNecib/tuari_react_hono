// Rust Core — monotonic clock tamper detection and grace period
//
// Uses wall clock timestamp tracking to detect system clock tampering.
// On each startup, stores the current wall clock time. On subsequent runs,
// if the wall clock has gone backward by more than 24 hours, the clock
// is considered suspicious.
//
// Two files live in the state dir:
//   clock-tracker.json  — the clock high-water mark. The documented tamper
//                         recovery deletes this file, so it is resettable.
//   install-anchor.json — the durable install time the trial is derived from.
//                         The recovery does not touch it, and it is only ever
//                         moved earlier, so resetting the clock cannot restart
//                         the trial.
//
// Note: Cross-session monotonic comparison is not possible with
// std::time::Instant because Instant values are not comparable across
// process restarts. Instead, we detect backward wall-clock jumps.

use crate::error::RustCoreError;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

const CLOCK_TOLERANCE_SECS: i64 = 86400; // 24 hours
const GRACE_PERIOD_DAYS: i64 = 30;
const TRACKER_FILE: &str = "clock-tracker.json";
const ANCHOR_FILE: &str = "install-anchor.json";

/// How many times the atomic write retries the final rename before giving up.
///
/// On Windows, replacing the target while another process (a second app
/// instance, an antivirus scanner, a search indexer) holds it open for reading
/// fails with a sharing violation instead of succeeding. That lock is
/// transient, so the write retries a few times rather than letting a
/// momentary reader defeat the trial anchor.
const RENAME_MAX_ATTEMPTS: u32 = 5;

/// Base delay for the rename backoff, doubled on each retry.
///
/// With five attempts the sleep schedule is 20/40/80/160 ms: a 300 ms
/// worst-case window — long enough to outlast a transient reader, short enough
/// not to stall startup. Deliberately bounded; the write never retries
/// forever.
const RENAME_BACKOFF_BASE_MS: u64 = 20;

/// Monotonic counter that makes each staging file name unique within a
/// process, so two concurrent writers never share one.
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// Persisted clock state for tamper detection.
///
/// This file is deliberately resettable: deleting it clears the clock
/// high-water mark so a user can recover from a false tamper warning. It must
/// not be the only record of the install time, because the post-install trial
/// is derived from `install_wall`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClockTracker {
    /// Wall clock Unix timestamp at last save.
    pub last_seen_wall: i64,
    /// Wall clock Unix timestamp at first-ever install.
    pub install_wall: i64,
}

/// Durable install-time anchor.
///
/// Stored in a second file that the clock-tamper recovery does not delete, so
/// removing `clock-tracker.json` cannot restart the post-install trial. The
/// value only ever moves earlier; it is never advanced.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct InstallAnchor {
    install_wall: i64,
}

/// Result of a clock consistency check.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClockStatus {
    Trusted,
    Suspicious {
        estimated_time: DateTime<Utc>,
        reason: String,
    },
}

fn read_tracker(state_dir: &Path) -> Result<Option<ClockTracker>, RustCoreError> {
    match fs::read_to_string(state_dir.join(TRACKER_FILE)) {
        Ok(content) => serde_json::from_str(&content)
            .map(Some)
            .map_err(|_| RustCoreError::InvalidFormat),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(RustCoreError::IoError(Box::new(e))),
    }
}

fn read_anchor(state_dir: &Path) -> Result<Option<InstallAnchor>, RustCoreError> {
    match fs::read_to_string(state_dir.join(ANCHOR_FILE)) {
        Ok(content) => serde_json::from_str(&content)
            .map(Some)
            .map_err(|_| RustCoreError::InvalidFormat),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(RustCoreError::IoError(Box::new(e))),
    }
}

/// Temporary sibling path used as the staging file for an atomic write.
///
/// Kept in the same directory as the target (so the rename cannot cross a
/// volume) and tagged with the process id plus a per-write sequence (so two
/// concurrent writers do not clobber each other's staging file).
fn atomic_temp_path(path: &Path) -> Result<PathBuf, RustCoreError> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| RustCoreError::Internal("clock state path has no file name".to_string()))?;
    let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    Ok(path.with_file_name(format!(
        "{file_name}.{}.{sequence}.tmp",
        std::process::id()
    )))
}

/// Backoff delay before retry `attempt` (1-indexed): 20, 40, 80, 160 ms.
fn rename_retry_delay(attempt: u32) -> Duration {
    let factor = 1u64
        .checked_shl(attempt.saturating_sub(1))
        .unwrap_or(u64::MAX);
    Duration::from_millis(RENAME_BACKOFF_BASE_MS.saturating_mul(factor))
}

/// Retry `rename` up to `max_attempts` times with exponential backoff.
///
/// The rename operation and the sleep function are injected so the retry
/// policy can be exercised in unit tests without touching the OS or waiting on
/// the wall clock. `sleep` is only called between attempts, never after the
/// final failure.
///
/// Every error is retried, not an enumerated set of Windows sharing codes: the
/// code a transient reader produces varies (access denied 5, sharing violation
/// 32, lock violation 33, user-mapped file 1224) and a missed code would
/// silently reintroduce the defeat this exists to prevent. The attempt bound
/// keeps even a permanently un-writable target to a 300 ms delay before the
/// error surfaces.
fn rename_with_retry<R, S>(
    from: &Path,
    to: &Path,
    max_attempts: u32,
    mut rename: R,
    mut sleep: S,
) -> io::Result<()>
where
    R: FnMut(&Path, &Path) -> io::Result<()>,
    S: FnMut(Duration),
{
    debug_assert!(max_attempts >= 1, "a rename must be attempted at least once");
    let mut attempt: u32 = 1;
    loop {
        match rename(from, to) {
            Ok(()) => return Ok(()),
            Err(err) if attempt >= max_attempts => return Err(err),
            Err(_) => {
                sleep(rename_retry_delay(attempt));
                attempt += 1;
            }
        }
    }
}

/// Write `contents` to `path` crash-safely.
///
/// The data is staged in a temporary sibling file, flushed to disk, and then
/// renamed over the target. A rename within the same directory is atomic on
/// every supported platform, so a crash mid-write or a concurrent reader sees
/// either the old complete file or the new complete file — never a truncated
/// one.
///
/// The rename is retried with exponential backoff: another process holding the
/// target open for reading makes the replace fail on Windows until it lets go,
/// and a transient reader must not be able to block the write. The staging file
/// survives every retry and is only removed once the write is given up, with an
/// error naming the target path and the underlying OS error.
fn write_atomic(path: &Path, contents: &str) -> Result<(), RustCoreError> {
    write_atomic_with(path, contents, |from, to| fs::rename(from, to), thread::sleep)
}

/// `write_atomic`, with the rename operation and sleep function injected so the
/// staging/retry/cleanup behaviour is unit-testable without the OS.
fn write_atomic_with<R, S>(
    path: &Path,
    contents: &str,
    rename: R,
    sleep: S,
) -> Result<(), RustCoreError>
where
    R: FnMut(&Path, &Path) -> io::Result<()>,
    S: FnMut(Duration),
{
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| RustCoreError::IoError(Box::new(e)))?;
    }

    let temp_path = atomic_temp_path(path)?;
    let staged = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&temp_path)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        Ok(())
    })();

    if let Err(e) = staged {
        let _ = fs::remove_file(&temp_path);
        return Err(RustCoreError::IoError(Box::new(e)));
    }

    // Keep the staging file across every retry: a transient reader holding the
    // target open is exactly what a later attempt is meant to outlast.
    rename_with_retry(&temp_path, path, RENAME_MAX_ATTEMPTS, rename, sleep).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        RustCoreError::IoError(Box::new(io::Error::new(
            e.kind(),
            format!(
                "failed to replace {} after {RENAME_MAX_ATTEMPTS} rename attempts: {e}",
                path.display()
            ),
        )))
    })
}

fn write_tracker(state_dir: &Path, tracker: &ClockTracker) -> Result<(), RustCoreError> {
    let path = state_dir.join(TRACKER_FILE);
    let json = serde_json::to_string(tracker)
        .map_err(|_| RustCoreError::Internal("clock tracker serialization failed".to_string()))?;
    write_atomic(&path, &json)
}

fn write_anchor(state_dir: &Path, install_wall: i64) -> Result<(), RustCoreError> {
    let path = state_dir.join(ANCHOR_FILE);
    let json = serde_json::to_string(&InstallAnchor { install_wall })
        .map_err(|_| RustCoreError::Internal("install anchor serialization failed".to_string()))?;
    write_atomic(&path, &json)
}

/// Resolve the earliest credible install timestamp from the durable anchor and
/// the resettable tracker. Returns `None` only when neither file exists, which
/// means this is a genuinely fresh install.
fn resolve_install_wall(state_dir: &Path) -> Result<Option<i64>, RustCoreError> {
    let from_tracker = read_tracker(state_dir)?.map(|t| t.install_wall);
    let from_anchor = read_anchor(state_dir)?.map(|a| a.install_wall);
    Ok(match (from_tracker, from_anchor) {
        (Some(tracker), Some(anchor)) => Some(tracker.min(anchor)),
        (Some(tracker), None) => Some(tracker),
        (None, Some(anchor)) => Some(anchor),
        (None, None) => None,
    })
}

/// Check clock consistency against the persisted tracker.
///
/// Returns `ClockStatus::Trusted` if the wall clock hasn't jumped backward
/// past the tolerance, or `ClockStatus::Suspicious` if tampering is detected.
///
/// On first run, creates `clock-tracker.json` and `install-anchor.json` with
/// the current time. On subsequent runs, compares the current wall time to the
/// last seen time. If the clock went backward by more than 24 hours, returns
/// Suspicious. Always updates the tracker on disk so the app can recover on
/// next launch. The install anchor is written once and only ever moved
/// earlier, so deleting the resettable tracker cannot restart the trial.
pub fn check_clock_consistency(state_dir: &Path) -> Result<ClockStatus, RustCoreError> {
    let now_wall = Utc::now().timestamp();

    let tracker = read_tracker(state_dir)?;
    let anchor = read_anchor(state_dir)?;

    // Earliest credible evidence wins. A pre-anchor install only has a tracker,
    // so its install time seeds the anchor rather than being lost.
    let install_wall = match (
        tracker.as_ref().map(|t| t.install_wall),
        anchor.as_ref().map(|a| a.install_wall),
    ) {
        (Some(from_tracker), Some(from_anchor)) => from_tracker.min(from_anchor),
        (Some(from_tracker), None) => from_tracker,
        (None, Some(from_anchor)) => from_anchor,
        (None, None) => now_wall,
    };

    // Persist the anchor when it is missing or can be moved earlier. Never move
    // it forward: that is what restarted the trial.
    if anchor.as_ref().map(|a| a.install_wall) != Some(install_wall) {
        write_anchor(state_dir, install_wall)?;
    }

    let Some(tracker) = tracker else {
        // First run, or the tracker was deleted by the clock-tamper recovery.
        // Recreate it with the durable install time, never the current time.
        let tracker = ClockTracker {
            last_seen_wall: now_wall,
            install_wall,
        };
        write_tracker(state_dir, &tracker)?;
        return Ok(ClockStatus::Trusted);
    };

    // Detect clock going backward (beyond tolerance)
    let wall_drift = now_wall - tracker.last_seen_wall;
    let status = if tracker.last_seen_wall > now_wall && wall_drift.abs() > CLOCK_TOLERANCE_SECS {
        let estimated = estimate_time(tracker.last_seen_wall, now_wall);
        ClockStatus::Suspicious {
            estimated_time: estimated,
            reason: "System clock was set backward".to_string(),
        }
    } else {
        ClockStatus::Trusted
    };

    // Always update the tracker so the clock can recover on next launch.
    // Never advance last_seen_wall to a known-rollback time; keep the earliest
    // install evidence so a hand-edited tracker cannot inflate the trial.
    let updated_tracker = ClockTracker {
        last_seen_wall: tracker.last_seen_wall.max(now_wall),
        install_wall,
    };
    write_tracker(state_dir, &updated_tracker)?;

    Ok(status)
}

/// Estimate a trustworthy time when the clock is suspicious.
/// Uses the last known good timestamp + a conservative estimate.
fn estimate_time(last_seen_wall: i64, _now_wall: i64) -> DateTime<Utc> {
    // When the clock is suspicious, we conservatively use last_seen_wall
    DateTime::from_timestamp(last_seen_wall, 0).unwrap_or_else(Utc::now)
}

/// Returns the number of days remaining in the grace period.
/// Returns `None` if no install evidence exists (pre-first-run).
/// Always clamps to [0, GRACE_PERIOD_DAYS] to prevent inflation via clock rollback.
pub fn grace_days_remaining(state_dir: &Path) -> Result<Option<i64>, RustCoreError> {
    let Some(install_wall) = resolve_install_wall(state_dir)? else {
        return Ok(None);
    };

    let now = Utc::now().timestamp();
    let elapsed_days = (now - install_wall) / 86400;
    let remaining = GRACE_PERIOD_DAYS - elapsed_days;
    // Clamp to [0, GRACE_PERIOD_DAYS] to prevent clock rollback from
    // inflating the remaining grace period indefinitely, and to prevent
    // negative values from a clock set far into the future.
    Ok(Some(remaining.clamp(0, GRACE_PERIOD_DAYS)))
}

/// Returns true if the app is within the post-install grace period (no license needed).
pub fn is_within_grace_period(state_dir: &Path) -> Result<bool, RustCoreError> {
    grace_days_remaining(state_dir).map(|days| days.map_or(true, |d| d > 0))
}

/// Returns the reliable current time, accounting for clock tampering.
/// If the clock is trusted, returns Utc::now().
/// If suspicious, returns the last known good timestamp.
pub fn reliable_now(state_dir: &Path) -> Result<DateTime<Utc>, RustCoreError> {
    let status = check_clock_consistency(state_dir)?;
    match status {
        ClockStatus::Trusted => Ok(Utc::now()),
        ClockStatus::Suspicious { estimated_time, .. } => Ok(estimated_time),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use std::path::PathBuf;

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("tuari-clock-test-{nanos}"))
    }

    fn seed_tracker(dir: &Path, last_seen_wall: i64, install_wall: i64) {
        let tracker = ClockTracker {
            last_seen_wall,
            install_wall,
        };
        fs::write(
            dir.join(TRACKER_FILE),
            serde_json::to_string(&tracker).unwrap(),
        )
        .unwrap();
    }

    fn seed_anchor(dir: &Path, install_wall: i64) {
        fs::write(
            dir.join(ANCHOR_FILE),
            serde_json::to_string(&InstallAnchor { install_wall }).unwrap(),
        )
        .unwrap();
    }

    /// Write arbitrary (possibly corrupt) bytes to a state file.
    fn seed_raw(dir: &Path, file_name: &str, content: &str) {
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join(file_name), content).unwrap();
    }

    fn read_anchor(dir: &Path) -> InstallAnchor {
        let content = fs::read_to_string(dir.join(ANCHOR_FILE)).unwrap();
        serde_json::from_str(&content).unwrap()
    }

    /// Names of every staging file still present in `dir`.
    fn staging_files(dir: &Path) -> Vec<String> {
        fs::read_dir(dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect()
    }

    /// An error shaped like the Windows sharing violation a transient reader
    /// (second instance, antivirus, indexer) produces. Kept portable so the
    /// retry policy is tested on every OS, not just Windows.
    fn sharing_violation() -> io::Error {
        io::Error::new(io::ErrorKind::PermissionDenied, "sharing violation")
    }

    #[test]
    fn first_run_returns_trusted() {
        let dir = temp_dir();
        let status = check_clock_consistency(&dir).unwrap();
        assert_eq!(status, ClockStatus::Trusted);
        assert!(dir.join("clock-tracker.json").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn second_run_with_consistent_clock_returns_trusted() {
        let dir = temp_dir();
        let _ = check_clock_consistency(&dir).unwrap();
        let status = check_clock_consistency(&dir).unwrap();
        assert_eq!(status, ClockStatus::Trusted);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn grace_days_returns_none_before_first_run() {
        let dir = temp_dir();
        let result = grace_days_remaining(&dir);
        assert!(result.is_ok(), "expected Ok, got: {result:?}");
        let days = result.unwrap();
        assert!(days.is_none());
    }

    #[test]
    fn grace_days_returns_positive_after_first_run() {
        let dir = temp_dir();
        let _ = check_clock_consistency(&dir).unwrap();
        let days = grace_days_remaining(&dir).unwrap();
        assert!(days.is_some());
        assert!(days.unwrap() > 0);
        assert!(days.unwrap() <= GRACE_PERIOD_DAYS);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn is_within_grace_period_returns_true_after_first_run() {
        let dir = temp_dir();
        let _ = check_clock_consistency(&dir).unwrap();
        assert!(is_within_grace_period(&dir).unwrap());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn clock_tracker_is_serializable() {
        let tracker = ClockTracker {
            last_seen_wall: 1000000,
            install_wall: 1000000,
        };
        let json = serde_json::to_string(&tracker).unwrap();
        let deserialized: ClockTracker = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.last_seen_wall, 1000000);
        assert_eq!(deserialized.install_wall, 1000000);
    }

    #[test]
    fn send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<ClockTracker>();
        assert_send_sync::<ClockStatus>();
    }

    #[test]
    fn grace_days_clamped_to_grace_period() {
        let dir = temp_dir();
        let _ = check_clock_consistency(&dir).unwrap();

        // Overwrite tracker with an old install timestamp to simulate
        // a clock that was set backward
        let tracker = ClockTracker {
            last_seen_wall: Utc::now().timestamp(),
            install_wall: Utc::now().timestamp() - 100 * 86400, // 100 days ago
        };
        let json = serde_json::to_string(&tracker).unwrap();
        fs::write(dir.join("clock-tracker.json"), &json).unwrap();

        let days = grace_days_remaining(&dir).unwrap().unwrap();
        assert_eq!(days, 0, "grace should be 0 when install was 100 days ago");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn grace_days_does_not_exceed_grace_period() {
        let dir = temp_dir();
        let _ = check_clock_consistency(&dir).unwrap();

        // Overwrite tracker with a future install timestamp
        let tracker = ClockTracker {
            last_seen_wall: Utc::now().timestamp(),
            install_wall: Utc::now().timestamp() + 100 * 86400, // 100 days in the future
        };
        let json = serde_json::to_string(&tracker).unwrap();
        fs::write(dir.join("clock-tracker.json"), &json).unwrap();

        let days = grace_days_remaining(&dir).unwrap().unwrap();
        assert_eq!(days, GRACE_PERIOD_DAYS, "grace should cap at GRACE_PERIOD_DAYS even with future install clock");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn tracker_preserves_high_water_mark_on_suspicious_path() {
        let dir = temp_dir();
        let _ = check_clock_consistency(&dir).unwrap();

        // Read the tracker to get the last_seen_wall
        let content = fs::read_to_string(dir.join("clock-tracker.json")).unwrap();
        let tracker: ClockTracker = serde_json::from_str(&content).unwrap();
        let saved_wall = tracker.last_seen_wall;

        // Write a tracker with a future last_seen_wall to simulate a
        // clock going backward on next call
        let future_tracker = ClockTracker {
            last_seen_wall: saved_wall + 100 * 86400, // 100 days in the future
            install_wall: tracker.install_wall,
        };
        let json = serde_json::to_string(&future_tracker).unwrap();
        fs::write(dir.join("clock-tracker.json"), &json).unwrap();

        // This call should detect the backward jump
        let status = check_clock_consistency(&dir).unwrap();
        assert!(
            matches!(status, ClockStatus::Suspicious { .. }),
            "expected Suspicious for backward clock jump, got: {status:?}"
        );

        // The tracker should have preserved the high-water mark
        // (last_seen_wall should not have been lowered)
        let updated_content = fs::read_to_string(dir.join("clock-tracker.json")).unwrap();
        let updated_tracker: ClockTracker = serde_json::from_str(&updated_content).unwrap();
        assert!(
            updated_tracker.last_seen_wall >= saved_wall,
            "high-water mark should not decrease: {} < {}",
            updated_tracker.last_seen_wall,
            saved_wall
        );

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn fresh_install_gets_full_window() {
        let dir = temp_dir();
        assert_eq!(check_clock_consistency(&dir).unwrap(), ClockStatus::Trusted);
        assert!(dir.join(TRACKER_FILE).exists());
        assert!(dir.join(ANCHOR_FILE).exists(), "anchor must be created on first run");
        assert_eq!(grace_days_remaining(&dir).unwrap(), Some(GRACE_PERIOD_DAYS));
        assert!(is_within_grace_period(&dir).unwrap());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn deleting_tracker_on_aged_install_does_not_restart_trial() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let now = Utc::now().timestamp();
        let aged = now - 100 * 86400;
        seed_tracker(&dir, now, aged);
        seed_anchor(&dir, aged);

        // Clock-tamper recovery: delete the resettable tracker.
        fs::remove_file(dir.join(TRACKER_FILE)).unwrap();
        assert!(!is_within_grace_period(&dir).unwrap());
        assert_eq!(grace_days_remaining(&dir).unwrap(), Some(0));

        // The next launch recreates the tracker from the anchor, still expired.
        assert_eq!(check_clock_consistency(&dir).unwrap(), ClockStatus::Trusted);
        let content = fs::read_to_string(dir.join(TRACKER_FILE)).unwrap();
        let recreated: ClockTracker = serde_json::from_str(&content).unwrap();
        assert_eq!(recreated.install_wall, aged);
        assert!(!is_within_grace_period(&dir).unwrap());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn tamper_recovery_clears_tamper_state_without_extending_trial() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let now = Utc::now().timestamp();
        let aged = now - 100 * 86400;
        // A high-water mark 100 days ahead makes the current clock look rolled back.
        seed_tracker(&dir, now + 100 * 86400, aged);
        seed_anchor(&dir, aged);

        let status = check_clock_consistency(&dir).unwrap();
        assert!(
            matches!(status, ClockStatus::Suspicious { .. }),
            "expected Suspicious, got: {status:?}"
        );

        // The user clears the warning by deleting the tracker.
        fs::remove_file(dir.join(TRACKER_FILE)).unwrap();
        assert_eq!(check_clock_consistency(&dir).unwrap(), ClockStatus::Trusted);
        // ...and the trial window did not move.
        assert_eq!(grace_days_remaining(&dir).unwrap(), Some(0));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn missing_anchor_is_seeded_from_older_tracker() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let now = Utc::now().timestamp();
        let aged = now - 100 * 86400;
        // An install that predates the anchor file: only the tracker exists.
        seed_tracker(&dir, now, aged);

        assert_eq!(check_clock_consistency(&dir).unwrap(), ClockStatus::Trusted);
        assert_eq!(
            read_anchor(&dir).install_wall,
            aged,
            "anchor must inherit the pre-existing install time, not the current time"
        );

        // Even after the upgrade, deleting the tracker cannot restart the trial.
        fs::remove_file(dir.join(TRACKER_FILE)).unwrap();
        assert_eq!(grace_days_remaining(&dir).unwrap(), Some(0));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn future_tracker_install_cannot_inflate_window_past_anchor() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let now = Utc::now().timestamp();
        let aged = now - 100 * 86400;
        seed_anchor(&dir, aged);
        // A hand-edited tracker claims a fresh install far in the future.
        seed_tracker(&dir, now, now + 100 * 86400);

        assert_eq!(grace_days_remaining(&dir).unwrap(), Some(0));
        assert_eq!(check_clock_consistency(&dir).unwrap(), ClockStatus::Trusted);
        assert_eq!(
            read_anchor(&dir).install_wall,
            aged,
            "the anchor must never be moved forward"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn corrupt_anchor_fails_closed_and_does_not_restart_trial() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let now = Utc::now().timestamp();
        let aged = now - 100 * 86400;
        // A legitimate aged install: the resettable tracker still holds the
        // true install time. The anchor is truncated, as a crash mid-write
        // would have left it before atomic writes.
        seed_tracker(&dir, now, aged);
        let corrupt = "{ \"install_wall\": ";
        seed_raw(&dir, ANCHOR_FILE, corrupt);

        let status = check_clock_consistency(&dir);
        assert!(
            matches!(status, Err(RustCoreError::InvalidFormat)),
            "corrupt anchor must fail closed, got: {status:?}"
        );
        // Fail closed: no grace window and no silent trial restart.
        assert!(grace_days_remaining(&dir).is_err());
        assert!(!is_within_grace_period(&dir).unwrap_or(false));

        // The corrupt file is left untouched — never silently rewritten with
        // `now`, which is exactly what would restart the trial.
        assert_eq!(fs::read_to_string(dir.join(ANCHOR_FILE)).unwrap(), corrupt);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn corrupt_tracker_fails_closed_as_before() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let now = Utc::now().timestamp();
        let aged = now - 100 * 86400;
        seed_anchor(&dir, aged);
        seed_raw(&dir, TRACKER_FILE, "not json at all");

        assert!(matches!(
            check_clock_consistency(&dir),
            Err(RustCoreError::InvalidFormat)
        ));
        assert!(grace_days_remaining(&dir).is_err());
        assert!(!is_within_grace_period(&dir).unwrap_or(false));

        // The valid anchor is preserved and still readable.
        assert_eq!(read_anchor(&dir).install_wall, aged);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn atomic_temp_path_is_unique_and_a_sibling_of_the_target() {
        let dir = temp_dir();
        let path = dir.join(ANCHOR_FILE);

        let first = atomic_temp_path(&path).unwrap();
        let second = atomic_temp_path(&path).unwrap();

        assert_ne!(first, second, "concurrent writers must not share a staging file");
        assert_eq!(first.parent(), path.parent(), "staging file must stay on the target volume");
        assert_eq!(second.parent(), path.parent());
        assert!(first.to_string_lossy().ends_with(".tmp"));
    }

    #[test]
    fn atomic_write_replaces_target_and_leaves_no_staging_file() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("state.json");
        write_atomic(&path, "old-and-longer-content").unwrap();
        write_atomic(&path, "new").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        let leftovers = staging_files(&dir);
        assert!(leftovers.is_empty(), "staging files left behind: {leftovers:?}");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn atomic_write_creates_missing_parent_directories() {
        let base = temp_dir();
        let path = base.join("nested").join("state").join(ANCHOR_FILE);

        write_atomic(&path, "{\"install_wall\":0}").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"install_wall\":0}");
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn atomic_write_reports_failure_without_replacing_target_and_cleans_up() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        // A directory can never be replaced by a file rename, so the final
        // rename fails. The helper must surface the error and remove its
        // staging file rather than leaving debris behind.
        let path = dir.join("state.json");
        fs::create_dir(&path).unwrap();

        assert!(write_atomic(&path, "replacement").is_err());
        assert!(path.is_dir(), "a failed write must not replace the target");

        let leftovers = staging_files(&dir);
        assert!(leftovers.is_empty(), "staging files left behind: {leftovers:?}");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn rename_retry_succeeds_after_a_transient_failure() {
        // A reader holding the target open makes the first attempts fail; the
        // retry must outlast it rather than failing the write.
        let mut attempts = 0u32;
        let mut delays = Vec::new();

        rename_with_retry(
            Path::new("staging.tmp"),
            Path::new("target.json"),
            RENAME_MAX_ATTEMPTS,
            |_, _| {
                attempts += 1;
                if attempts < 3 {
                    Err(sharing_violation())
                } else {
                    Ok(())
                }
            },
            |delay| delays.push(delay),
        )
        .expect("a later attempt must succeed");

        assert_eq!(attempts, 3, "must stop retrying after the first success");
        assert_eq!(
            delays,
            vec![Duration::from_millis(20), Duration::from_millis(40)],
            "only the failed attempts are followed by a backoff sleep"
        );
    }

    #[test]
    fn rename_retry_gives_up_after_the_attempt_bound() {
        let mut attempts = 0u32;
        let mut sleeps = 0u32;

        let err = rename_with_retry(
            Path::new("staging.tmp"),
            Path::new("target.json"),
            4,
            |_, _| {
                attempts += 1;
                Err(sharing_violation())
            },
            |_| sleeps += 1,
        )
        .expect_err("a permanently held target must surface an error");

        assert_eq!(attempts, 4, "must stop at the attempt bound, not retry forever");
        assert_eq!(sleeps, 3, "one fewer sleep than attempts");
        assert_eq!(err.kind(), io::ErrorKind::PermissionDenied);
    }

    #[test]
    fn rename_retry_backoff_doubles_within_a_bounded_window() {
        let delays: Vec<Duration> = (1..RENAME_MAX_ATTEMPTS).map(rename_retry_delay).collect();
        assert_eq!(
            delays,
            vec![
                Duration::from_millis(20),
                Duration::from_millis(40),
                Duration::from_millis(80),
                Duration::from_millis(160),
            ]
        );
        let total_ms: u128 = delays.iter().map(Duration::as_millis).sum();
        assert_eq!(total_ms, 300, "worst-case retry window must stay short");
    }

    #[test]
    fn atomic_write_retries_past_a_transient_rename_failure() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("state.json");
        fs::write(&path, "old").unwrap();

        let mut attempts = 0u32;
        write_atomic_with(
            &path,
            "new",
            |from, to| {
                attempts += 1;
                if attempts == 1 {
                    Err(sharing_violation())
                } else {
                    fs::rename(from, to)
                }
            },
            |_| {},
        )
        .expect("the write must survive a transient rename failure");

        assert_eq!(attempts, 2);
        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        assert!(staging_files(&dir).is_empty(), "staging file must be consumed by the rename");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn atomic_write_removes_staging_file_after_exhausting_rename_retries() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("state.json");
        fs::write(&path, "old").unwrap();

        let mut attempts = 0u32;
        let err = write_atomic_with(
            &path,
            "replacement",
            |_, _| {
                attempts += 1;
                Err(sharing_violation())
            },
            |_| {},
        )
        .expect_err("an exhausted retry must fail");

        assert_eq!(attempts, RENAME_MAX_ATTEMPTS);
        let message = err.to_string();
        assert!(
            message.contains("state.json"),
            "the error must name the target path: {message}"
        );
        assert!(
            message.contains("sharing violation"),
            "the error must carry the underlying OS error: {message}"
        );
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "old",
            "a failed write must leave the previous state intact"
        );
        let leftovers = staging_files(&dir);
        assert!(
            leftovers.is_empty(),
            "staging file must be cleaned up on final failure: {leftovers:?}"
        );
        fs::remove_dir_all(&dir).unwrap();
    }
}
