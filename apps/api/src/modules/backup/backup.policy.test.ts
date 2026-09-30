import { describe, expect, it } from "vitest";

import {
  BACKUP_RETENTION,
  formatBackupDate,
  isBackupDue,
  previousDay,
  selectBackupsToPrune,
} from "./backup.policy";

describe("backup date helpers", () => {
  it("formats and rolls back a local calendar day", () => {
    expect(formatBackupDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
    expect(formatBackupDate(previousDay(new Date(2026, 0, 1)))).toBe(
      "2025-12-31",
    );
    // Month rollover; 2026 is not a leap year.
    expect(formatBackupDate(previousDay(new Date(2026, 2, 1)))).toBe(
      "2026-02-28",
    );
  });
});

describe("isBackupDue", () => {
  const now = new Date(2026, 0, 15, 8, 0, 0);

  it("is due on a first run", () => {
    expect(isBackupDue(null, now)).toBe(true);
  });

  it("is not due when the newest backup is yesterday", () => {
    expect(isBackupDue("2026-01-14", now)).toBe(false);
  });

  it("is due when the newest backup is older than yesterday", () => {
    expect(isBackupDue("2026-01-13", now)).toBe(true);
  });

  it("is not due when the newest backup is newer than yesterday", () => {
    expect(isBackupDue("2026-01-15", now)).toBe(false);
  });

  it("is due when the newest backup is dated in the future", () => {
    // A clock accidentally set years ahead wrote a folder in the future; it
    // must not suppress the backup until that date arrives.
    expect(isBackupDue("2099-01-01", now)).toBe(true);
    expect(isBackupDue("2026-01-16", now)).toBe(true);
  });
});

describe("selectBackupsToPrune", () => {
  it("prunes nothing when there are no backups", () => {
    expect(selectBackupsToPrune([])).toEqual([]);
  });

  it("prunes nothing when the policy covers every backup", () => {
    expect(
      selectBackupsToPrune(["2026-01-08", "2026-01-09", "2026-01-10"]),
    ).toEqual([]);
  });

  it("keeps daily, then weekly and monthly representatives, oldest-first prune", () => {
    const dates = [
      "2026-01-10",
      "2026-01-03",
      "2026-01-01",
      "2026-01-08",
      "2026-01-05",
      "2026-01-02",
      "2026-01-09",
      "2026-01-06",
      "2026-01-04",
      "2026-01-07",
    ];
    const pruned = selectBackupsToPrune(dates, {
      daily: 2,
      weekly: 1,
      monthly: 1,
    });
    // daily: 09,10; weekly (newest ISO week in the older set): 08;
    // monthly (newest month after that): 07.
    expect(pruned).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
      "2026-01-06",
    ]);
  });

  it("never prunes the newest backup even with a zero-size policy", () => {
    expect(
      selectBackupsToPrune(["2026-01-01", "2026-01-02"], {
        daily: 0,
        weekly: 0,
        monthly: 0,
      }),
    ).toEqual(["2026-01-01"]);
  });

  it("keeps 14 daily + 8 weekly + 6 monthly for the default policy", () => {
    const dates: string[] = [];
    const cursor = new Date(2025, 5, 1); // 2025-06-01
    for (let index = 0; index < 200; index += 1) {
      dates.push(formatBackupDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    const pruned = selectBackupsToPrune(dates);
    const newest = dates[dates.length - 1]!;
    const kept = dates.filter((date) => !pruned.includes(date));

    expect(pruned).not.toContain(newest);
    expect(pruned).toEqual([...pruned].sort());
    expect(kept).toHaveLength(
      BACKUP_RETENTION.daily + BACKUP_RETENTION.weekly + BACKUP_RETENTION.monthly,
    );
    expect(kept).toContain(newest);
  });
});
