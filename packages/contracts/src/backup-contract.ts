import { oc } from "@orpc/contract";

import { backupStatusSchema } from "./backup";

export const backupContract = {
  /** Read the daily backup status (last success, path, last failure reason). */
  backupStatus: oc.output(backupStatusSchema),
} as const;

export type BackupContract = typeof backupContract;
