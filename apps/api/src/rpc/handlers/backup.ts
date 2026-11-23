/**
 * Daily backup status + folder setting handlers (#430, #436).
 *
 * `backupStatus` is read-only. `setBackupsRoot` is the one mutation: it
 * validates the chosen path, persists it to the user-editable config, and
 * repoints the running service. Gated by the same auth middleware every other
 * read/write uses.
 */
import { implement } from "@orpc/server";

import { validateBackupsRootPath } from "../../modules/backup/backup.settings";
import type { BackupService } from "../../modules/backup/backup.types";
import type { BackupFolderPersister } from "../../infrastructure/config/backup-folder-persister";

import type { RpcMiddleware } from "../rpc-middleware";

/** Map an unexpected throw onto the documented failure envelope. */
const toBackupsRootFailure = (error: unknown) => ({
  success: false as const,
  error: error instanceof Error ? error.message : String(error),
});

export function createBackupHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  backupService: BackupService,
  backupFolderPersister: BackupFolderPersister,
) {
  return {
    backupStatus: os.backupStatus.handler(
      m.queryAuth(async () => backupService.getStatus()),
    ),
    setBackupsRoot: os.setBackupsRoot.handler(
      m.mutationAuditRateLimited(
        async ({ input }) => {
          const { path } = input as { path: string };
          const validation = validateBackupsRootPath(path);
          if (!validation.success) {
            return { success: false as const, error: validation.error };
          }

          const persisted =
            backupFolderPersister.persistBackupsRoot(validation.path);
          if (!persisted.success) {
            return { success: false as const, error: persisted.error };
          }

          // Persistence succeeded (or there is nothing to persist to): apply
          // the validated root to the running service so the status and the
          // next run use it immediately.
          backupService.setBackupsRoot(validation.path);
          return {
            success: true as const,
            path: validation.path,
            persisted: persisted.persisted,
          };
        },
        toBackupsRootFailure,
      ),
    ),
  };
}
