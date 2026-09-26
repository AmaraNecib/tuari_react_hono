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
use std::path::Path;

const CLOCK_TOLERANCE_SECS: i64 = 86400; // 24 hours
const GRACE_PERIOD_DAYS: i64 = 30;
const TRACKER_FILE: &str = "clock-tracker.json";
const ANCHOR_FILE: &str = "install-anchor.json";

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

fn write_tracker(state_dir: &Path, tracker: &ClockTracker) -> Result<(), RustCoreError> {
    let path = state_dir.join(TRACKER_FILE);
    let json = serde_json::to_string(tracker)
        .map_err(|_| RustCoreError::Internal("clock tracker serialization failed".to_string()))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| RustCoreError::IoError(Box::new(e)))?;
    }
    fs::write(&path, &json).map_err(|e| RustCoreError::IoError(Box::new(e)))
}

fn write_anchor(state_dir: &Path, install_wall: i64) -> Result<(), RustCoreError> {
    let path = state_dir.join(ANCHOR_FILE);
    let json = serde_json::to_string(&InstallAnchor { install_wall })
        .map_err(|_| RustCoreError::Internal("install anchor serialization failed".to_string()))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| RustCoreError::IoError(Box::new(e)))?;
    }
    fs::write(&path, &json).map_err(|e| RustCoreError::IoError(Box::new(e)))
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
    use std::time::{SystemTime, UNIX_EPOCH};
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

    fn read_anchor(dir: &Path) -> InstallAnchor {
        let content = fs::read_to_string(dir.join(ANCHOR_FILE)).unwrap();
        serde_json::from_str(&content).unwrap()
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
}
