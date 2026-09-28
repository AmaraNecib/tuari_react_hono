/**
 * Daily backup status handler (#430).
 *
 * Read-only: reports the last successful backup (time + path) and the reason
 * for the most recent failed attempt so the UI can surface a non-fatal backup
 * problem. Gated by the same `m.queryAuth` admin middleware every other read
 * uses.
 */
import { implement } from "@orpc/server";

import type { BackupService } from "../../modules/backup/backup.types";

import type { RpcMiddleware } from "../rpc-middleware";

export function createBackupHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  backupService: BackupService,
) {
  return {
    backupStatus: os.backupStatus.handler(
      m.queryAuth(async () => backupService.getStatus()),
    ),
  };
}
