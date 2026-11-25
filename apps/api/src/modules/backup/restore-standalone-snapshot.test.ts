import { beforeEach, expect, it, vi } from "vitest";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(), cp: vi.fn(), createDatabaseConnection: vi.fn(),
  storage: vi.fn(), verify: vi.fn(), db: { pragma: vi.fn(), close: vi.fn() },
}));
vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdir, cp: mocks.cp }));
vi.mock("../../infrastructure/database/factory", () => ({ createDatabaseConnection: mocks.createDatabaseConnection }));
vi.mock("../inventory/inventory.storage", () => ({ InventoryAttachmentStorage: mocks.storage }));
vi.mock("./verify-restored-attachments", () => ({ verifyRestoredAttachments: mocks.verify }));
import { restoreStandaloneSnapshot } from "./restore-standalone-snapshot";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.pragma.mockReturnValue([{ integrity_check: "ok" }]);
  mocks.createDatabaseConnection.mockReturnValue(mocks.db);
  mocks.verify.mockResolvedValue({ verified: 2 });
  mocks.cp.mockResolvedValue(undefined);
});

it("allows an absent attachment directory and returns verified restore paths", async () => {
  const missing = Object.assign(new Error("missing attachments"), { code: "ENOENT" });
  mocks.cp.mockResolvedValueOnce(undefined).mockRejectedValueOnce(missing);
  const result = await restoreStandaloneSnapshot("snapshot", "destination", "key");
  expect(mocks.cp).toHaveBeenNthCalledWith(1, join("snapshot", "tuari.sqlite"), join("destination", "tuari.sqlite"), { errorOnExist: true, force: false });
  expect(mocks.cp).toHaveBeenNthCalledWith(2, join("snapshot", "attachments"), join("destination", "attachments"), { recursive: true, errorOnExist: true, force: false });
  expect(result).toMatchObject({ databasePath: join("destination", "tuari.sqlite"), attachmentsRootPath: join("destination", "attachments"), verified: 2 });
  expect(mocks.db.close).toHaveBeenCalledOnce();
});

it("rethrows non-ENOENT attachment copy failures by identity", async () => {
  const failure = new Error("permission denied");
  mocks.cp.mockResolvedValueOnce(undefined).mockRejectedValueOnce(failure);
  await expect(restoreStandaloneSnapshot("s", "d")).rejects.toBe(failure);
  expect(mocks.createDatabaseConnection).not.toHaveBeenCalled();
});

it.each([[[]], [[{ integrity_check: "corrupt" }]]])("rejects integrity result %j and closes the database", async result => {
  mocks.db.pragma.mockReturnValue(result);
  await expect(restoreStandaloneSnapshot("s", "d")).rejects.toThrow("Restored database integrity check failed");
  expect(mocks.db.close).toHaveBeenCalledOnce();
  expect(mocks.verify).not.toHaveBeenCalled();
});

it("propagates verifier rejection and closes the database", async () => {
  const failure = new Error("attachment verification failed");
  mocks.verify.mockRejectedValue(failure);
  await expect(restoreStandaloneSnapshot("s", "d")).rejects.toBe(failure);
  expect(mocks.db.close).toHaveBeenCalledOnce();
});
