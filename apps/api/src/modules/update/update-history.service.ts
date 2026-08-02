/**
 * UpdateHistoryService — records applied application updates (M4.3).
 *
 * The Rust Updater Engine calls into this service after each update
 * attempt to persist the result. All persistence detail lives behind
 * the UpdateHistoryPort; this service is a thin facade over it.
 */
import type { UpdateRecord, RecordUpdateInput } from "@tuari/contracts";
import type { UpdateHistoryPort } from "./update-history.types";

export class UpdateHistoryService {
  constructor(private readonly port: UpdateHistoryPort) {}

  /**
   * Record an applied (or failed) update in the history table.
   * Returns the newly created record.
   */
  recordUpdate(input: RecordUpdateInput): UpdateRecord {
    return this.port.recordUpdate(input);
  }

  /**
   * Return all update history records, most recent first.
   */
  getHistory(limit?: number): UpdateRecord[] {
    return this.port.getHistory(limit);
  }

  /**
   * Return the most recent update record, or null if none exist.
   */
  getLatestUpdate(): UpdateRecord | null {
    return this.port.getLatestUpdate();
  }
}
