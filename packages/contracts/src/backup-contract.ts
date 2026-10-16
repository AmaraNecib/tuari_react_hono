import { oc } from "@orpc/contract";

import {
  backupStatusSchema,
  setBackupsRootInputSchema,
  setBackupsRootResultSchema,
} from "./backup";

export const backupContract = {
  /** Read the daily backup status (last success, path, root, retention, failure). */
  backupStatus: oc.output(backupStatusSchema),
  /** Choose the folder daily snapshots are written to (#436). */
  setBackupsRoot: oc
    .input(setBackupsRootInputSchema)
    .output(setBackupsRootResultSchema),
} as const;

export type BackupContract = typeof backupContract;
