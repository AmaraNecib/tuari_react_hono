/**
 * UpdateHistoryPort — persistence boundary for update-history records (M4.3).
 *
 * Deep, minimal port: the service depends on this interface instead of a
 * database handle, and all persistence detail (raw SQL, row shape, 0/1
 * boolean normalization, ordering) stays inside the adapter implementation.
 */
import type { RecordUpdateInput, UpdateRecord } from "@tuari/contracts";

export interface UpdateHistoryPort {
  /** Record an applied (or failed) update. Returns the newly created record. */
  recordUpdate(input: RecordUpdateInput): UpdateRecord;

  /**
   * Return update history records, most recent first (tie-broken by
   * descending id). Defaults to the 50 most recent records when `limit`
   * is omitted; `limit` must be a non-negative integer.
   */
  getHistory(limit?: number): UpdateRecord[];

  /** Return the most recent update record, or null if none exist. */
  getLatestUpdate(): UpdateRecord | null;
}
