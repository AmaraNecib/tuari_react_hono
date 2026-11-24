import { describe, expect, it, vi } from "vitest";
import { AttachmentService } from "./attachment.service";
import type { AttachmentRepository } from "./attachment.repository";

function fixture() {
  const repository: AttachmentRepository = {
    invoiceGroupExists: vi.fn(() => true),
    withTransaction: callback => callback(),
    createAttachment: vi.fn(() => { throw new Error("database failure"); }),
    getAttachmentById: vi.fn(() => null),
  };
  const storage = {
    saveInvoiceAttachment: vi.fn(async () => ({ attachmentId: "file", storageKey: "key", relativePath: "invoice/file", sha256: "hash" })),
    deleteRelativePath: vi.fn(async () => {}),
    readRelativePath: vi.fn(async () => Buffer.from("pdf")),
  };
  const service = new AttachmentService(repository, storage);
  const bytes = vi.fn(async () => new Uint8Array([1]));
  const file = { name: "invoice.pdf", type: "application/pdf", size: 1, bytes };
  return { service, repository, storage, file, bytes };
}

describe("attachment lifecycle without numeric workflows", () => {
  it.each([
    { name: "count", change: (file: ReturnType<typeof fixture>["file"]) => Array(11).fill(file) },
    { name: "type", change: (file: ReturnType<typeof fixture>["file"]) => [{ ...file, type: "text/html" }] },
    { name: "size", change: (file: ReturnType<typeof fixture>["file"]) => [{ ...file, size: 6 * 1024 * 1024 }] },
    { name: "total", change: (file: ReturnType<typeof fixture>["file"]) => Array(4).fill({ ...file, size: 4 * 1024 * 1024 }) },
  ])("rejects $name before loading bytes", async ({ change }) => {
    const f = fixture();
    await expect(f.service.addInvoiceAttachments("invoice", change(f.file))).rejects.toThrow();
    expect(f.bytes).not.toHaveBeenCalled();
    expect(f.storage.saveInvoiceAttachment).not.toHaveBeenCalled();
  });
  it("rejects missing invoices before loading bytes", async () => {
    const f = fixture();
    vi.mocked(f.repository.invoiceGroupExists).mockReturnValue(false);
    await expect(f.service.addInvoiceAttachments("missing", [f.file])).rejects.toThrow();
    expect(f.bytes).not.toHaveBeenCalled();
  });
  it("removes saved paths after metadata failure", async () => {
    const f = fixture();
    await expect(f.service.addInvoiceAttachments("invoice", [f.file])).rejects.toThrow("database failure");
    expect(f.storage.deleteRelativePath).toHaveBeenCalledExactlyOnceWith("invoice/file");
  });
  it("removes prior saved paths after subsequent storage failure", async () => {
    const f = fixture();
    f.storage.saveInvoiceAttachment.mockResolvedValueOnce({ attachmentId: "first", storageKey: "key", relativePath: "invoice/first", sha256: "hash" }).mockRejectedValueOnce(new Error("storage failure"));
    await expect(f.service.addInvoiceAttachments("invoice", [f.file, f.file])).rejects.toThrow("storage failure");
    expect(f.repository.createAttachment).not.toHaveBeenCalled();
    expect(f.storage.deleteRelativePath).toHaveBeenCalledExactlyOnceWith("invoice/first");
  });
  it("does not read storage for an absent download", async () => {
    const f = fixture();
    await expect(f.service.getAttachmentDownload("missing")).rejects.toThrow();
    expect(f.storage.readRelativePath).not.toHaveBeenCalled();
  });
});
