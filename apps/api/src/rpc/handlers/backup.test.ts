import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRouterClient, implement } from "@orpc/server";
import { appContract, setBackupsRootResultSchema, type SetBackupsRootResult } from "@tuari/contracts";
import { describe, expect, it, vi } from "vitest";
import { createBackupHandlers } from "./backup";
import type { RpcMiddleware } from "../rpc-middleware";
import type { BackupService } from "../../modules/backup/backup.types";

// Exercise handler + output validation without booting an unrelated SQLite store.
// Auth/rate/audit guards remain covered by router.test.ts, not this adapter.
type BackupClient = { setBackupsRoot(input: { path: string }): Promise<SetBackupsRootResult> };
const middleware = {
  queryAuth: (handler: unknown) => handler,
  mutationAuditRateLimited: (handler: unknown) => handler,
} as unknown as RpcMiddleware;

describe("backup folder reason propagation", () => {
  it("preserves typed file rejection across the RPC output and never persists it", async () => {
    const root = mkdtempSync(join(tmpdir(), "tuari-folder-reason-"));
    try {
      const file = join(root, "file.txt");
      writeFileSync(file, "not a directory");
      const persistBackupsRoot = vi.fn();
      const setBackupsRoot = vi.fn();
      const router = createBackupHandlers(implement(appContract), middleware,
        { setBackupsRoot } as unknown as BackupService, { persistBackupsRoot });
      const client = createRouterClient(router) as BackupClient;
      await expect(client.setBackupsRoot({ path: file })).resolves.toMatchObject({ success: false, reason: "not_directory" });
      expect(persistBackupsRoot).not.toHaveBeenCalled();
      expect(setBackupsRoot).not.toHaveBeenCalled();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("does not label settings persistence failure as a bad folder", async () => {
    const persistBackupsRoot = vi.fn(() => ({ success: false as const, error: "private config exception" }));
    const setBackupsRoot = vi.fn();
    const router = createBackupHandlers(implement(appContract), middleware,
      { setBackupsRoot } as unknown as BackupService, { persistBackupsRoot });
    const client = createRouterClient(router) as BackupClient;
    const result = await client.setBackupsRoot({ path: tmpdir() });
    expect(result).toEqual({ success: false, error: "private config exception" });
    expect(setBackupsRoot).not.toHaveBeenCalled();
    expect(setBackupsRootResultSchema.parse({ success: false, error: "legacy server" })).toEqual({ success: false, error: "legacy server" });
  });
});
