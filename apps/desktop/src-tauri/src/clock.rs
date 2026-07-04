// Rust Core — monotonic clock tamper detection and grace period
//
// Uses wall clock timestamp tracking to detect system clock tampering.
// On each startup, stores the current wall clock time. On subsequent runs,
// if the wall clock has gone backward by more than 24 hours, the clock
// is considered suspicious.
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

/// Persisted clock state for tamper detection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClockTracker {
    /// Wall clock Unix timestamp at last save.
    pub last_seen_wall: i64,
    /// Wall clock Unix timestamp at first-ever install.
    pub install_wall: i64,
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

/// Check clock consistency against the persisted tracker.
///
/// Returns `ClockStatus::Trusted` if the wall clock hasn't jumped backward
/// past the tolerance, or `ClockStatus::Suspicious` if tampering is detected.
///
/// On first run, creates a `clock-tracker.json` with the current time.
/// On subsequent runs, compares the current wall time to the last seen time.
/// If the clock went backward by more than 24 hours, returns Suspicious.
/// Always updates the tracker on disk so the app can recover on next launch.
pub fn check_clock_consistency(state_dir: &Path) -> Result<ClockStatus, RustCoreError> {
    let now_wall = Utc::now().timestamp();

    let tracker_path = state_dir.join("clock-tracker.json");

    let tracker: ClockTracker = if tracker_path.exists() {
        let content = fs::read_to_string(&tracker_path)
            .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
        serde_json::from_str(&content)
            .map_err(|_| RustCoreError::InvalidFormat)?
    } else {
        // First run — create tracker and return trusted
        let tracker = ClockTracker {
            last_seen_wall: now_wall,
            install_wall: now_wall,
        };
        let json = serde_json::to_string(&tracker)
            .map_err(|_| RustCoreError::Internal("clock tracker serialization failed".to_string()))?;
        if let Some(parent) = tracker_path.parent() {
            fs::create_dir_all(parent).map_err(|e| RustCoreError::IoError(Box::new(e)))?;
        }
        fs::write(&tracker_path, &json)
            .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
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

    // Always update the tracker so the clock can recover on next launch
    let updated_tracker = ClockTracker {
        last_seen_wall: now_wall,
        install_wall: tracker.install_wall,
    };
    let json = serde_json::to_string(&updated_tracker)
        .map_err(|_| RustCoreError::Internal("clock tracker serialization failed".to_string()))?;
    fs::write(&tracker_path, &json)
        .map_err(|e| RustCoreError::IoError(Box::new(e)))?;

    Ok(status)
}

/// Estimate a trustworthy time when the clock is suspicious.
/// Uses the last known good timestamp + a conservative estimate.
fn estimate_time(last_seen_wall: i64, _now_wall: i64) -> DateTime<Utc> {
    // When the clock is suspicious, we conservatively use last_seen_wall
    DateTime::from_timestamp(last_seen_wall, 0).unwrap_or_else(Utc::now)
}

/// Returns the number of days remaining in the grace period.
/// Returns `None` if no install timestamp exists (pre-first-run).
/// Always clamps to [0, GRACE_PERIOD_DAYS] to prevent inflation via clock rollback.
pub fn grace_days_remaining(state_dir: &Path) -> Result<Option<i64>, RustCoreError> {
    let tracker_path = state_dir.join("clock-tracker.json");
    if !tracker_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&tracker_path)
        .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
    let tracker: ClockTracker = serde_json::from_str(&content)
        .map_err(|_| RustCoreError::InvalidFormat)?;

    let now = Utc::now().timestamp();
    let elapsed_days = (now - tracker.install_wall) / 86400;
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
    fn tracker_updated_on_suspicious_path() {
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

        // But the tracker should still be updated, so a subsequent call
        // with a consistent clock should recover
        let status2 = check_clock_consistency(&dir).unwrap();
        assert_eq!(
            status2,
            ClockStatus::Trusted,
            "should recover after suspicious path updates tracker"
        );

        fs::remove_dir_all(&dir).unwrap();
    }
}
