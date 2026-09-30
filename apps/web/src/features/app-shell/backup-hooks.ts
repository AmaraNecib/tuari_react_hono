/**
 * React Query integration for the daily-backup surface (#439, #436).
 *
 * The status read and the folder mutation both go through the authenticated
 * oRPC client. The folder picker is desktop-only: the web build has no native
 * dialog, so it returns null and the caller falls back to the path field.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { isDesktopRuntime } from "@/lib/desktop-auth-session";
import { rpcClient } from "@/lib/orpc-client";

/** Query key for the backup status (single source for the screen). */
export const backupStatusQueryKey = ["backup", "status"] as const;

/** Load the current backup status (root, retention, last success/failure). */
export function useBackupStatusQuery() {
  return useQuery({
    queryKey: backupStatusQueryKey,
    queryFn: () => rpcClient.backupStatus(),
  });
}

/** Save the chosen backup folder and refresh the status. */
export function useSetBackupsRootMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["backup", "set-root"],
    mutationFn: (path: string) => rpcClient.setBackupsRoot({ path }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: backupStatusQueryKey });
    },
  });
}

/**
 * Open the native folder picker on desktop and return the chosen directory
 * (or null when cancelled / running in the browser). Uses the same Tauri
 * dialog plugin the update flow uses — no new IPC command.
 */
export async function pickBackupFolder(): Promise<string | null> {
  if (!isDesktopRuntime()) {
    return null;
  }

  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
  } catch {
    return null;
  }
}
