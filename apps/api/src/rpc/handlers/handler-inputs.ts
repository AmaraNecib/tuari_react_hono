/**
 * Handler-layer input types.
 *
 * The RPC middleware functions (`rpc-middleware.ts`) are generic over the
 * handler's input (`TInput`), but the handler callbacks are passed
 * unannotated, so `TInput` has no inference site at the call site and
 * infers to `unknown`. Handlers therefore cast `input` to the procedure's
 * contract input at the use site.
 *
 * The shapes below are the ones reused across procedures. They derive from
 * the contract Zod schemas so they can never drift from the wire contract;
 * create/update procedures use the contract's named input types
 * (`RoleCreateInput`, `EmployeeCreateInput`, …) directly, and list
 * procedures use the API filter types in
 * `modules/company/company.types.ts` (structurally identical to the
 * contract list schemas, which are `.optional()`).
 */
import type { z } from "zod";
import {
  employeePagedListInputSchema,
  idInputSchema,
  inventoryAssetTransferInputSchema,
  inventoryConsumableTransferInputSchema,
  inventoryInvoiceGroupListInputSchema,
  inventoryItemDefinitionListInputSchema,
  inventoryLocationContentsInputSchema,
} from "@tuari/contracts";
import type { ReportType } from "@tuari/contracts";

/** Input for procedures that take a single `{ id }` payload (get/delete/end). */
export type IdInput = z.infer<typeof idInputSchema>;

/**
 * Input for `employeesListPaged` — cursor pagination composed with the
 * employee list filters.
 */
export type EmployeePagedListInput = NonNullable<z.infer<typeof employeePagedListInputSchema>>;

/** Input for `inventoryItemDefinitionsList` — optional item-type/active filters. */
export type InventoryItemDefinitionListInput = z.infer<typeof inventoryItemDefinitionListInputSchema>;

/** Input for `inventoryInvoiceGroupsList` — optional warehouse/project filters. */
export type InventoryInvoiceGroupListInput = z.infer<typeof inventoryInvoiceGroupListInputSchema>;

/** Input for `inventoryAssetsTransfer`. */
export type InventoryAssetTransferInput = z.infer<typeof inventoryAssetTransferInputSchema>;

/** Input for `inventoryConsumablesTransfer`. */
export type InventoryConsumableTransferInput = z.infer<typeof inventoryConsumableTransferInputSchema>;

/** Input for `inventoryLocationContentsGet`. */
export type InventoryLocationContentsInput = z.infer<typeof inventoryLocationContentsInputSchema>;

/**
 * Input for `consumeRecoveryKey`.
 *
 * Mirrors `consumeRecoveryKeyInputSchema`, which lives in the contracts'
 * `security.ts` module — not re-exported from the package index.
 */
export type ConsumeRecoveryKeyInput = { key: string };

/**
 * Input for `revokeRecoveryKey`.
 *
 * Mirrors `revokeRecoveryKeyInputSchema` (see `ConsumeRecoveryKeyInput`).
 */
export type RevokeRecoveryKeyInput = { keyId: string };

/**
 * Input for `changeDbEncryptionKey`.
 *
 * Mirrors `changeDbKeyInputSchema` (see `ConsumeRecoveryKeyInput`).
 */
export type ChangeDbKeyInput = { currentKey: string; newKey: string };

/**
 * Input for `reportsGenerate`.
 *
 * The `reportFilterInputSchema` lives locally in the contract file and is
 * not exported; this mirrors its shape via the exported `ReportType`.
 */
export type ReportFilterInput = {
  type: ReportType;
  startDate?: string;
  endDate?: string;
};
