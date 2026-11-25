import type { InventoryInvoiceAttachmentCreateData, InventoryInvoiceAttachmentRecord } from "../inventory/inventory.types";

export interface AttachmentRepository {
  invoiceGroupExists(id: string): boolean;
  withTransaction<T>(callback: () => T): T;
  createAttachment(data: InventoryInvoiceAttachmentCreateData): InventoryInvoiceAttachmentRecord;
  getAttachmentById(id: string): InventoryInvoiceAttachmentRecord | null;
}
