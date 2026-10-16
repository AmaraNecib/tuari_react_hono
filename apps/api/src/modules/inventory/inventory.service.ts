import {
  MAX_MONEY_DZD,
  invoiceLineUsage,
  matchesItemOfferFilter,
  nonNegativePaymentAmountSchema,
  resolveItemOffer,
} from "@tuari/contracts"
import type {
  DebtAccountCreateInput,
  DebtEntryCreateInput,
  InventoryAssetChargeDefaultInput,
  InventoryAssetChargeUpdateInput,
  InventoryAssetChargeVoidInput,
  InventoryAssetChargesListByProjectInput,
  InventoryAssetChargesListByUnitInput,
  InventoryInvoiceGroupCreateInput,
  InventoryItemDefinitionCreateInput,
  InventoryItemDefinitionUpdateInput,
  InventoryOutboundTransferCreateInput,
  InventoryItemUsage,
  InventoryReport,
  MovementReport,
} from "@tuari/contracts"

import { InventoryError } from "./inventory.errors"
import { normalizePageSize } from "../shared/cursor"
import { StructuredLogger } from "../../infrastructure/observability/logger"
import { CompanyError } from "../company/company.errors"
import { createAlgeriaTimestamp } from "../company/company-time"
import { ageInDays, resolveReportWindow, roundMoney } from "../company/report.helpers"
import type { MutationAuditContext } from "../company/company.types"
import type {
  InventoryAssetUnitCreateData,
  InventoryItemDefinitionRecord,
  InventoryUploadFile,
  InventoryStoredUpload,
} from "./inventory.types"
import type { InventoryRepository } from "./inventory.repository"
import { InventoryAttachmentStorage } from "./inventory.storage"
import type { AssetChargeService } from "./asset-charge.service"

type DebtService = {
  createDebtAccount(input: DebtAccountCreateInput, auditContext?: MutationAuditContext): { success: true; item: { id: string } }
  createDebtEntry(input: DebtEntryCreateInput, auditContext?: MutationAuditContext): { success: true; item: { id: string } }
}

type WorkspaceAdminAuthorizer = {
  isBootstrapOwner(userId: string): boolean
}

function normalizeMutationAuditContext(auditContext?: MutationAuditContext): Required<MutationAuditContext> {
  return {
    actorUserId: auditContext?.actorUserId ?? null,
    actorLabel: auditContext?.actorLabel ?? null,
    transactionId: auditContext?.transactionId ?? crypto.randomUUID(),
  }
}

function successResult<T>(message: string, item: T) {
  return {
    success: true as const,
    message,
    item,
  }
}

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeMoney(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new InventoryError("VALIDATION", "يجب إدخال مبلغ صالح.", [{ field, message: "يجب إدخال مبلغ صالح." }])
  }

  return value
}

/**
 * The module seam for money that must also respect the wire contract's
 * magnitude bound (`MAX_MONEY_DZD`). The wire gate and this seam parse the SAME
 * schema, so a direct caller cannot store an amount the contract rejects
 * (issue #289 defense-in-depth). Used for the asset purchase price (#413) and
 * the invoice line/payment inputs (#429).
 */
function normalizeMoneyWithinBound(value: number, field: string, message: string) {
  const parsed = nonNegativePaymentAmountSchema.safeParse(value)
  if (!parsed.success) {
    throw new InventoryError("VALIDATION", message, [{ field, message }])
  }

  return parsed.data
}

/**
 * Accumulate the invoice's running gross total and refuse a total that leaves
 * `MAX_MONEY_DZD`. Each line is bounded individually, but a batch of legal
 * lines can still sum past the safe-integer range (#429): a `quantity ×
 * unitPrice` or a per-line sum above the bound is no longer exactly
 * representable, so the write is refused with a typed BUSINESS_RULE before
 * anything is persisted rather than storing a silently wrong financial
 * number. Mirrors `AssetChargeService.sumLiveCharges` / `project-cost.service`.
 */
function accumulateGrossTotal(currentTotalDzd: number, lineTotalDzd: number) {
  const nextTotalDzd = currentTotalDzd + lineTotalDzd
  if (!Number.isFinite(nextTotalDzd) || nextTotalDzd > MAX_MONEY_DZD) {
    throw new InventoryError(
      "BUSINESS_RULE",
      `إجمالي الفاتورة يتجاوز الحد الأقصى المسموح به (${MAX_MONEY_DZD}).`,
    )
  }

  return nextTotalDzd
}

function normalizePositive(value: number, field: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new InventoryError("VALIDATION", "يجب إدخال قيمة أكبر من صفر.", [{ field, message: "يجب إدخال قيمة أكبر من صفر." }])
  }

  return value
}

function validateWarehouse(repository: InventoryRepository, warehouseId: string | null | undefined, field: string) {
  if (warehouseId && !repository.warehouseExists(warehouseId)) {
    throw new InventoryError("VALIDATION", "المستودع المحدد غير موجود.", [{ field, message: "المستودع المحدد غير موجود." }])
  }
}

function validateProject(repository: InventoryRepository, projectId: string | null | undefined, field: string) {
  if (projectId && !repository.projectExists(projectId)) {
    throw new InventoryError("VALIDATION", "المشروع المحدد غير موجود.", [{ field, message: "المشروع المحدد غير موجود." }])
  }
}

function validateExternalCounterparty(repository: InventoryRepository, externalCounterpartyId: string | null | undefined, field: string) {
  if (externalCounterpartyId && !repository.externalCounterpartyExists(externalCounterpartyId)) {
    throw new InventoryError("VALIDATION", "الطرف الخارجي المحدد غير موجود.", [{ field, message: "الطرف الخارجي المحدد غير موجود." }])
  }
}

function validateSingleDestination(warehouseId: string | null | undefined, projectId: string | null | undefined, field: string) {
  if (warehouseId && projectId) {
    throw new InventoryError("VALIDATION", "اختر مستودعًا أو مشروعًا واحدًا فقط.", [{ field, message: "اختر مستودعًا أو مشروعًا واحدًا فقط." }])
  }
}

function requireOneDestination(warehouseId: string | null | undefined, projectId: string | null | undefined, field: string) {
  if (!warehouseId && !projectId) {
    throw new InventoryError("VALIDATION", "يجب تحديد مستودع أو مشروع.", [{ field, message: "يجب تحديد مستودع أو مشروع." }])
  }
}

function generateNextInvoiceNumber(latestInvoiceNumber: string | null) {
  const match = latestInvoiceNumber?.match(/^IN-(\d+)$/)
  const nextNumber = match ? Number.parseInt(match[1] ?? "0", 10) + 1 : 1
  return `IN-${String(nextNumber).padStart(5, "0")}`
}

function resolveOccurredAt(value?: string | null) {
  return value ?? createAlgeriaTimestamp()
}

const ALLOWED_INVOICE_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
])
const MAX_INVOICE_ATTACHMENT_COUNT = 10
const MAX_INVOICE_ATTACHMENT_SIZE = 5 * 1024 * 1024
const MAX_INVOICE_ATTACHMENT_TOTAL_SIZE = 15 * 1024 * 1024

// ---------------------------------------------------------------------------
// Report aggregation helpers (shared with FinanceService — see
// ../company/report.helpers.ts)
// ---------------------------------------------------------------------------


/**
 * Inventory service handling item definitions, movements, invoices, transfers, and location contents.
 */
export class InventoryService {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly storage: InventoryAttachmentStorage,
    private readonly debtService?: DebtService,
    private readonly workspaceAdminAuthorizer?: WorkspaceAdminAuthorizer,
    /**
     * Project-charge rules for asset placements (#413). Optional so
     * existing wiring/tests that never place a unit on a project keep
     * working, but ANY path that can place a unit on a project calls
     * `requireAssetChargeService()` and fails loudly when it is absent: a
     * silently uncharged placement is exactly the failure this feature
     * exists to prevent (#422 round 5).
     */
    private readonly assetChargeService?: AssetChargeService,
  ) {}

  /** createMutationAuditContext. */
  private createMutationAuditContext(auditContext?: MutationAuditContext): Required<MutationAuditContext> {
    const audit = normalizeMutationAuditContext(auditContext)

    if (!this.workspaceAdminAuthorizer) {
      return audit
    }

    if (!audit.actorUserId || !this.workspaceAdminAuthorizer.isBootstrapOwner(audit.actorUserId)) {
      throw new InventoryError("UNAUTHORIZED", "هذا الإجراء متاح فقط لحساب الإدارة الرئيسي.")
    }

    return audit
  }

/** List item definitions with optional filters. */
  listItemDefinitions(filters?: { itemType?: "CONSUMABLE" | "ASSET"; isActive?: boolean }) {
    return { items: this.repository.listItemDefinitions(filters) }
  }

  /**
   * Usage-scoped, paged item options for a picker.
   *
   * The offer rule is resolved once here and handed to the repository as data,
   * so the read and the write gate (`createInvoiceGroup`) cannot drift.
   */
  listItemDefinitionOptions(input: {
    usage: InventoryItemUsage
    search?: string
    cursor?: string
    limit?: number
  }): { items: InventoryItemDefinitionRecord[]; total: number; nextCursor: string | null; hasMore: boolean } {
    const page = this.repository.listItemDefinitionsPaged({
      filter: resolveItemOffer(input.usage),
      search: input.search,
      cursor: input.cursor,
      limit: normalizePageSize(input.limit),
    })

    if (page.cursorReset) {
      // A cursor from a different filter/search is not an error the picker can
      // act on; restart at the first page and leave a trace for operators.
      StructuredLogger.warn("Item-options cursor reset", {
        surface: input.usage.surface,
        search: input.search ?? null,
      })
    }

    return {
      items: page.items,
      total: page.total,
      nextCursor: page.nextCursor,
      hasMore: page.nextCursor !== null,
    }
  }

  /** getItemDefinition. */
  getItemDefinition(id: string) {
    const item = this.repository.getItemDefinitionById(id)
    if (!item) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على تعريف العنصر المطلوب.")
    }

    return successResult("تم تحميل تعريف العنصر بنجاح.", item)
  }

/** Create a new item definition. */
  createItemDefinition(input: InventoryItemDefinitionCreateInput, auditContext?: MutationAuditContext) {
    const audit = this.createMutationAuditContext(auditContext)

    const item = this.repository.createItemDefinition({
      name: input.name.trim(),
      itemType: input.itemType,
      unit: input.itemType === "CONSUMABLE" ? normalizeText(input.unit) : null,
      description: normalizeText(input.description),
    }, audit)

    return successResult("تم إنشاء تعريف العنصر بنجاح.", item)
  }

/** Update an existing item definition. */
  updateItemDefinition(input: InventoryItemDefinitionUpdateInput, auditContext?: MutationAuditContext) {
    const audit = this.createMutationAuditContext(auditContext)

    const current = this.repository.getItemDefinitionById(input.id)
    if (!current) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على تعريف العنصر المطلوب.")
    }

    const nextItemType = input.itemType ?? current.itemType
    const nextUnit = nextItemType === "CONSUMABLE"
      ? input.unit !== undefined
        ? normalizeText(input.unit)
        : current.unit
      : null

    if (nextItemType === "CONSUMABLE" && !nextUnit) {
      throw new InventoryError("VALIDATION", "يجب إدخال وحدة قياس للمواد الاستهلاكية.", [{ field: "unit", message: "يجب إدخال وحدة قياس للمواد الاستهلاكية." }])
    }

    // Close the retroactive bypass: a definition's type is a fact the offer
    // rule reads, so flipping it while entries reference it would make the rule
    // a lie for existing rows. This is a behaviour change to an admin action.
    if (nextItemType !== current.itemType && this.repository.countEntriesByItemDefinitionId(input.id) > 0) {
      throw new InventoryError("CONFLICT", "لا يمكن تغيير نوع عنصر مستخدم في فواتير قائمة.", [
        { field: "itemType", message: "لا يمكن تغيير نوع عنصر مستخدم في فواتير قائمة." },
      ])
    }

    const item = this.repository.updateItemDefinition({
      id: input.id,
      name: input.name?.trim(),
      itemType: nextItemType,
      unit: nextUnit,
      description: input.description !== undefined ? normalizeText(input.description) : undefined,
      isActive: input.isActive,
    }, audit)

    return successResult("تم تحديث تعريف العنصر بنجاح.", item!)
  }

/** List invoice groups with optional filters. */
  listInvoiceGroups(filters?: { warehouseId?: string; projectId?: string }) {
    return { items: this.repository.listInvoiceGroups(filters) }
  }

/** Get a single invoice group by ID. */
  getInvoiceGroup(id: string) {
    const group = this.repository.getInvoiceGroupById(id)
    if (!group) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على الفاتورة المطلوبة.")
    }

    return successResult("تم تحميل الفاتورة بنجاح.", {
      group,
      entries: this.repository.listEntriesByInvoiceGroupId(id),
      attachments: this.repository.listAttachmentsByInvoiceGroupId(id),
      movements: this.repository.listMovementsByInvoiceGroupId(id),
      consumableBalances: this.repository.listConsumableBalancesByInvoiceGroupId(id),
    })
  }

/** Create a new invoice group. */
  createInvoiceGroup(input: InventoryInvoiceGroupCreateInput, auditContext?: MutationAuditContext) {
    const audit = this.createMutationAuditContext(auditContext)

    // Group-level destination validation
    validateSingleDestination(input.warehouseId ?? null, input.projectId ?? null, "warehouseId")
    validateWarehouse(this.repository, input.warehouseId ?? null, "warehouseId")
    validateProject(this.repository, input.projectId ?? null, "projectId")
    validateExternalCounterparty(this.repository, input.externalCounterpartyId ?? null, "externalCounterpartyId")

    const resolvedInvoiceNumber = normalizeText(input.invoiceNumber) ?? generateNextInvoiceNumber(this.repository.getLatestInvoiceNumber())
    const resolvedInvoiceDate = resolveOccurredAt(input.invoiceDate ?? null)

    // Phase 1: validate and prepare entries (reads only, safe before the write transaction)
    type PreparedConsumable = {
      kind: "CONSUMABLE"
      definitionId: string
      definitionName: string
      unit: string | null
      warehouseId: string | null
      projectId: string | null
      quantity: number
      unitPriceDzd: number
      totalPriceDzd: number
      note: string | null
    }
    type PreparedAsset = {
      kind: "ASSET"
      definitionId: string
      definitionName: string
      warehouseId: string | null
      projectId: string | null
      totalPriceDzd: number
      note: string | null
      assets: InventoryAssetUnitCreateData[]
    }
    const preparedEntries: Array<PreparedConsumable | PreparedAsset> = []
    let grossTotalDzd = 0

    for (const [index, entry] of input.entries.entries()) {
      const definition = this.repository.getItemDefinitionById(entry.itemDefinitionId)
      if (!definition) {
        throw new InventoryError("VALIDATION", "العنصر المحدد غير موجود.", [{ field: `entries.${index}.itemDefinitionId`, message: "العنصر المحدد غير موجود." }])
      }

      if (!definition.isActive) {
        throw new InventoryError("VALIDATION", "لا يمكن إضافة عنصر غير نشط.", [{ field: `entries.${index}.itemDefinitionId`, message: "لا يمكن إضافة عنصر غير نشط." }])
      }

      // Destination inheritance is XOR-aware: an entry that explicitly picks
      // one side must NOT inherit the header default for the other side
      // (a null here means "inherit the header default", so sending null for
      // the opposite destination of an explicit pick would resurrect both
      // destinations and violate the per-entry warehouse XOR project rule).
      const effectiveWarehouseId =
        entry.warehouseId ?? (entry.projectId ? null : input.warehouseId ?? null)
      const effectiveProjectId =
        entry.projectId ?? (entry.warehouseId ? null : input.projectId ?? null)

      validateSingleDestination(effectiveWarehouseId, effectiveProjectId, `entries.${index}.warehouseId`)
      requireOneDestination(effectiveWarehouseId, effectiveProjectId, `entries.${index}.warehouseId`)
      validateWarehouse(this.repository, effectiveWarehouseId, `entries.${index}.warehouseId`)
      validateProject(this.repository, effectiveProjectId, `entries.${index}.projectId`)

      if (entry.kind === "CONSUMABLE") {
        // The same rule that offered the option accepts it here; the module
        // owns both so they cannot drift.
        if (!matchesItemOfferFilter(resolveItemOffer(invoiceLineUsage("CONSUMABLE")), definition)) {
          throw new InventoryError("VALIDATION", "تعريف العنصر لا يطابق نوع إدخال المواد الاستهلاكية.", [{ field: `entries.${index}.itemDefinitionId`, message: "تعريف العنصر لا يطابق نوع إدخال المواد الاستهلاكية." }])
        }

        const quantity = normalizePositive(entry.quantity, `entries.${index}.quantity`)
        const unitPriceDzd = normalizeMoneyWithinBound(
          entry.unitPriceDzd,
          `entries.${index}.unitPriceDzd`,
          "سعر الوحدة خارج النطاق المسموح به.",
        )
        // Server derives total to prevent client-submitted inconsistencies
        const totalPriceDzd = quantity * unitPriceDzd
        grossTotalDzd = accumulateGrossTotal(grossTotalDzd, totalPriceDzd)
        preparedEntries.push({
          kind: "CONSUMABLE",
          definitionId: definition.id,
          definitionName: definition.name,
          unit: definition.unit,
          warehouseId: effectiveWarehouseId,
          projectId: effectiveProjectId,
          quantity,
          unitPriceDzd,
          totalPriceDzd,
          note: normalizeText(entry.note),
        })
        continue
      }

      if (!matchesItemOfferFilter(resolveItemOffer(invoiceLineUsage("ASSET")), definition)) {
        throw new InventoryError("VALIDATION", "تعريف العنصر لا يطابق نوع إدخال الأصول.", [{ field: `entries.${index}.itemDefinitionId`, message: "تعريف العنصر لا يطابق نوع إدخال الأصول." }])
      }

      const assets: InventoryAssetUnitCreateData[] = entry.assets.map((asset, assetIndex) => ({
        inventoryEntryId: "",
        assetName: asset.assetName.trim(),
        assetTag: normalizeText(asset.assetTag),
        serialNumber: normalizeText(asset.serialNumber),
        condition: asset.condition ?? null,
        purchaseDate: asset.purchaseDate ?? null,
        purchasePriceDzd: normalizeMoneyWithinBound(
          asset.purchasePriceDzd,
          `entries.${index}.assets.${assetIndex}.purchasePriceDzd`,
          "سعر الشراء خارج النطاق المسموح به.",
        ),
        currentWarehouseId: effectiveWarehouseId,
        currentProjectId: effectiveProjectId,
        note: normalizeText(asset.note),
      }))

      const totalPriceDzd = assets.reduce((sum, asset) => sum + asset.purchasePriceDzd, 0)
      grossTotalDzd = accumulateGrossTotal(grossTotalDzd, totalPriceDzd)
      preparedEntries.push({
        kind: "ASSET",
        definitionId: definition.id,
        definitionName: definition.name,
        warehouseId: effectiveWarehouseId,
        projectId: effectiveProjectId,
        totalPriceDzd,
        note: normalizeText(entry.note),
        assets,
      })
    }

    // Phase 2: calculate and validate payment amounts
    const paidAmountDzd = input.createDebt
      ? input.paymentInputType === "PERCENT"
        ? normalizeMoney((grossTotalDzd * (input.paidPercent ?? 0)) / 100, "paidPercent")
        : normalizeMoneyWithinBound(
            input.paidAmountDzd ?? 0,
            "paidAmountDzd",
            "المبلغ المدفوع خارج النطاق المسموح به.",
          )
      : grossTotalDzd

    if (input.createDebt && paidAmountDzd > grossTotalDzd) {
      const overpaymentField = input.paymentInputType === "PERCENT" ? "paidPercent" : "paidAmountDzd"
      throw new InventoryError("VALIDATION", "لا يمكن أن يتجاوز المبلغ المدفوع إجمالي الفاتورة.", [
        { field: overpaymentField, message: "لا يمكن أن يتجاوز المبلغ المدفوع إجمالي الفاتورة." },
      ])
    }

    const remainingDebtDzd = input.createDebt ? Math.max(0, grossTotalDzd - paidAmountDzd) : 0

    // Phase 3: persist everything in a single atomic transaction.
    // Both company and inventory repositories share the same database connection,
    // so nested withTransaction calls become savepoints automatically.
    const detail = this.repository.withTransaction(() => {
      let debtAccountId: string | null = null

      if (input.createDebt && input.externalCounterpartyId && grossTotalDzd > 0) {
        try {
          if (!this.debtService) {
            throw new InventoryError("BUSINESS_RULE", "خدمة الديون غير متاحة الآن.")
          }

          const debtResult = this.debtService.createDebtAccount({
            partyType: "EXTERNAL_COUNTERPARTY",
            externalCounterpartyId: input.externalCounterpartyId,
            direction: "PAYABLE",
            openingBalanceDzd: grossTotalDzd,
            openingEntryDate: resolvedInvoiceDate,
            openingEntryNote: `إجمالي فاتورة شراء ${resolvedInvoiceNumber}`,
            note: normalizeText(input.note),
          }, audit)

          debtAccountId = debtResult.item.id

          if (paidAmountDzd > 0) {
            this.debtService.createDebtEntry({
              debtAccountId,
              entryType: "PAYMENT",
              signedAmountDzd: -paidAmountDzd,
              entryDate: resolvedInvoiceDate,
              note: `دفعة عند تسجيل الفاتورة ${resolvedInvoiceNumber}`,
            }, audit)
          }
        } catch (error) {
          if (error instanceof CompanyError) {
            throw new InventoryError(error.appError.code, error.appError.message, error.appError.fieldErrors)
          }

          throw error
        }
      }

      const group = this.repository.createInvoiceGroup({
        invoiceNumber: resolvedInvoiceNumber,
        supplierName: normalizeText(input.supplierName),
        invoiceDate: resolvedInvoiceDate,
        warehouseId: input.warehouseId ?? null,
        projectId: input.projectId ?? null,
        externalCounterpartyId: input.externalCounterpartyId ?? null,
        grossTotalDzd,
        paidAmountDzd,
        remainingDebtDzd,
        debtAccountId,
        note: normalizeText(input.note),
      })

      // Placements are charged AFTER the entry loop, grouped per project, so a
      // bulk purchase reads the project's live charges once instead of once per
      // unit (#422 round 6). The charges still commit with the invoice: this
      // runs inside the same transaction.
      const pendingPlacements = new Map<string, Array<{ assetUnitId: string; movementId: string }>>()

      for (const entry of preparedEntries) {
        if (entry.kind === "CONSUMABLE") {
          const createdEntry = this.repository.createEntry({
            invoiceGroupId: group.id,
            itemDefinitionId: entry.definitionId,
            warehouseId: entry.warehouseId,
            projectId: entry.projectId,
            itemType: "CONSUMABLE",
            itemName: entry.definitionName,
            unit: entry.unit,
            quantity: entry.quantity,
            unitPriceDzd: entry.unitPriceDzd,
            totalPriceDzd: entry.totalPriceDzd,
            note: entry.note,
          })
          this.repository.createConsumableBalance({
            inventoryEntryId: createdEntry.id,
            itemDefinitionId: entry.definitionId,
            warehouseId: entry.warehouseId,
            projectId: entry.projectId,
            quantity: entry.quantity,
          })
          this.repository.createMovement({
            movementType: "PURCHASE",
            itemType: "CONSUMABLE",
            inventoryEntryId: createdEntry.id,
            quantity: entry.quantity,
            toWarehouseId: entry.warehouseId,
            toProjectId: entry.projectId,
            note: entry.note,
            occurredAt: resolvedInvoiceDate,
          })
          continue
        }

        const quantity = entry.assets.length
        const totalPriceDzd = entry.totalPriceDzd
        const averageUnitPrice = quantity > 0 ? totalPriceDzd / quantity : 0
        const createdEntry = this.repository.createEntry({
          invoiceGroupId: group.id,
          itemDefinitionId: entry.definitionId,
          warehouseId: entry.warehouseId,
          projectId: entry.projectId,
          itemType: "ASSET",
          itemName: entry.definitionName,
          unit: null,
          quantity,
          unitPriceDzd: averageUnitPrice,
          totalPriceDzd,
          note: entry.note,
        })

        for (const asset of entry.assets) {
          const createdAsset = this.repository.createAssetUnit({
            ...asset,
            inventoryEntryId: createdEntry.id,
          })
          const movement = this.repository.createMovement({
            movementType: "PURCHASE",
            itemType: "ASSET",
            inventoryEntryId: createdEntry.id,
            assetUnitId: createdAsset.id,
            quantity: 1,
            toWarehouseId: entry.warehouseId,
            toProjectId: entry.projectId,
            note: entry.note,
            occurredAt: resolvedInvoiceDate,
          })

          // A unit created directly on a project is a placement too: the same
          // rule as a transfer charges it in the SAME transaction (its default
          // is the purchase price, as it has no prior charge). A warehouse
          // purchase writes no charge. A missing charge service is a wiring
          // fault: fail loudly rather than book an uncharged placement (#422
          // round 5).
          if (entry.projectId) {
            const placements = pendingPlacements.get(entry.projectId) ?? []
            placements.push({ assetUnitId: createdAsset.id, movementId: movement.id })
            pendingPlacements.set(entry.projectId, placements)
          }
        }
      }

      for (const [projectId, placements] of pendingPlacements) {
        this.requireAssetChargeService().createPlacementCharges({ projectId, placements }, audit)
      }

      return {
        group,
        entries: this.repository.listEntriesByInvoiceGroupId(group.id),
        attachments: this.repository.listAttachmentsByInvoiceGroupId(group.id),
        movements: this.repository.listMovementsByInvoiceGroupId(group.id),
        consumableBalances: this.repository.listConsumableBalancesByInvoiceGroupId(group.id),
      }
    })

    return successResult("تم إنشاء الفاتورة والعناصر المرتبطة بها بنجاح.", detail)
  }

  /** receiveInventory. */
  receiveInventory(input: InventoryInvoiceGroupCreateInput, auditContext?: MutationAuditContext) {
    return this.createInvoiceGroup(input, auditContext)
  }

/** Get inventory contents at a specific warehouse or project location. */
  getLocationContents(input: { warehouseId?: string | null; projectId?: string | null }) {
    validateSingleDestination(input.warehouseId ?? null, input.projectId ?? null, "warehouseId")

    return successResult("تم تحميل محتويات الموقع بنجاح.", {
      assets: this.repository.listAssetUnitsByLocation({ warehouseId: input.warehouseId ?? undefined, projectId: input.projectId ?? undefined }),
      consumables: this.repository.listConsumableBalancesByLocation({ warehouseId: input.warehouseId ?? undefined, projectId: input.projectId ?? undefined }),
    })
  }

  /** getAsset. */
  getAsset(id: string) {
    const asset = this.repository.getAssetUnitById(id)
    if (!asset) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على الأصل المطلوب.")
    }

    const entry = this.repository.getEntryById(asset.inventoryEntryId)
    const group = entry ? this.repository.getInvoiceGroupById(entry.invoiceGroupId) : null
    if (!entry || !group) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على بيانات فاتورة الأصل.")
    }

    return successResult("تم تحميل الأصل بنجاح.", {
      asset,
      invoiceGroup: group,
      movements: this.repository.listMovementsByAssetUnitId(asset.id),
      charges: this.assetChargeService?.listByUnit({ assetUnitId: asset.id }).items ?? [],
    })
  }

  /** transferAsset. */
  transferAsset(input: { assetUnitId: string; toWarehouseId?: string | null; toProjectId?: string | null; chargeAmountDzd?: number | null; note?: string | null; occurredAt?: string }, auditContext?: MutationAuditContext) {
    const audit = this.createMutationAuditContext(auditContext)

    validateSingleDestination(input.toWarehouseId ?? null, input.toProjectId ?? null, "toWarehouseId")
    validateWarehouse(this.repository, input.toWarehouseId ?? null, "toWarehouseId")
    validateProject(this.repository, input.toProjectId ?? null, "toProjectId")

    const asset = this.repository.getAssetUnitById(input.assetUnitId)
    if (!asset) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على الأصل المطلوب.")
    }

    if (asset.currentWarehouseId === (input.toWarehouseId ?? null) && asset.currentProjectId === (input.toProjectId ?? null)) {
      throw new InventoryError("BUSINESS_RULE", "الأصل موجود بالفعل في هذا الموقع.")
    }

    this.repository.withTransaction(() => {
      this.repository.updateAssetUnitLocation(asset.id, {
        currentWarehouseId: input.toWarehouseId ?? null,
        currentProjectId: input.toProjectId ?? null,
      })
      const movement = this.repository.createMovement({
        movementType: "TRANSFER",
        itemType: "ASSET",
        inventoryEntryId: asset.inventoryEntryId,
        assetUnitId: asset.id,
        quantity: 1,
        fromWarehouseId: asset.currentWarehouseId,
        fromProjectId: asset.currentProjectId,
        toWarehouseId: input.toWarehouseId ?? null,
        toProjectId: input.toProjectId ?? null,
        note: normalizeText(input.note),
        occurredAt: resolveOccurredAt(input.occurredAt),
      })

      // A placement on a project books a charge in the SAME transaction; a
      // warehouse destination writes none (the charge belongs to the
      // placement, so a later move starts its own charge). A missing charge
      // service is a wiring fault, not a reason to silently book an uncharged
      // placement (#422 round 5).
      if (input.toProjectId) {
        this.requireAssetChargeService().createPlacementCharge({
          assetUnitId: asset.id,
          projectId: input.toProjectId,
          movementId: movement.id,
          amountDzd: input.chargeAmountDzd,
        }, audit)
      }
    })

    return this.getAsset(asset.id)
  }

  /** getAssetChargeDefault — resolve the prefill for a placement charge (#413). */
  getAssetChargeDefault(input: InventoryAssetChargeDefaultInput) {
    return this.requireAssetChargeService().getDefault(input)
  }

  /** listAssetChargesByUnit — a unit's charge chain, newest first. */
  listAssetChargesByUnit(input: InventoryAssetChargesListByUnitInput) {
    return this.requireAssetChargeService().listByUnit(input)
  }

  /** getProjectCharges — a project's live charges plus their total. */
  getProjectCharges(input: InventoryAssetChargesListByProjectInput) {
    return this.requireAssetChargeService().getProjectCharges(input)
  }

  /** updateAssetCharge — correct a past charge (records from → to + reason). */
  updateAssetCharge(input: InventoryAssetChargeUpdateInput, auditContext?: MutationAuditContext) {
    return this.requireAssetChargeService().updateCharge(input, auditContext)
  }

  /** voidAssetCharge — void a past charge, keeping its history. */
  voidAssetCharge(input: InventoryAssetChargeVoidInput, auditContext?: MutationAuditContext) {
    return this.requireAssetChargeService().voidCharge(input, auditContext)
  }

  private requireAssetChargeService() {
    if (!this.assetChargeService) {
      throw new InventoryError("BUSINESS_RULE", "خدمة احتساب العتاد غير متاحة الآن.")
    }

    return this.assetChargeService
  }

  /** transferConsumable. */
  transferConsumable(input: { inventoryEntryId: string; quantity: number; fromWarehouseId?: string | null; fromProjectId?: string | null; toWarehouseId?: string | null; toProjectId?: string | null; note?: string | null; occurredAt?: string }, auditContext?: MutationAuditContext) {
    this.createMutationAuditContext(auditContext)

    normalizePositive(input.quantity, "quantity")
    validateSingleDestination(input.fromWarehouseId ?? null, input.fromProjectId ?? null, "fromWarehouseId")
    validateSingleDestination(input.toWarehouseId ?? null, input.toProjectId ?? null, "toWarehouseId")
    validateWarehouse(this.repository, input.fromWarehouseId ?? null, "fromWarehouseId")
    validateProject(this.repository, input.fromProjectId ?? null, "fromProjectId")
    validateWarehouse(this.repository, input.toWarehouseId ?? null, "toWarehouseId")
    validateProject(this.repository, input.toProjectId ?? null, "toProjectId")

    const entry = this.repository.getEntryById(input.inventoryEntryId)
    if (!entry || entry.itemType !== "CONSUMABLE") {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على رصيد المادة المطلوب.")
    }

    const sourceBalance = this.repository.getConsumableBalanceByEntryAndLocation({
      inventoryEntryId: entry.id,
      warehouseId: input.fromWarehouseId ?? null,
      projectId: input.fromProjectId ?? null,
    })

    if ((input.fromWarehouseId ?? null) === (input.toWarehouseId ?? null) && (input.fromProjectId ?? null) === (input.toProjectId ?? null)) {
      throw new InventoryError("BUSINESS_RULE", "المصدر والوجهة متطابقان، لا توجد حركة مطلوبة.")
    }

    if (!sourceBalance || sourceBalance.quantity < input.quantity) {
      throw new InventoryError("BUSINESS_RULE", "الكمية المطلوبة غير متوفرة في الموقع الحالي.")
    }

    this.repository.withTransaction(() => {
      const remainingQty = sourceBalance.quantity - input.quantity
      if (remainingQty === 0) {
        // Delete the zero-balance record to satisfy the quantity > 0 DB constraint
        this.repository.deleteConsumableBalance(sourceBalance.id)
      } else {
        this.repository.updateConsumableBalanceQuantity(sourceBalance.id, remainingQty)
      }

      const targetBalance = this.repository.getConsumableBalanceByEntryAndLocation({
        inventoryEntryId: entry.id,
        warehouseId: input.toWarehouseId ?? null,
        projectId: input.toProjectId ?? null,
      })

      if (targetBalance) {
        this.repository.updateConsumableBalanceQuantity(targetBalance.id, targetBalance.quantity + input.quantity)
      } else {
        this.repository.createConsumableBalance({
          inventoryEntryId: entry.id,
          itemDefinitionId: entry.itemDefinitionId,
          warehouseId: input.toWarehouseId ?? null,
          projectId: input.toProjectId ?? null,
          quantity: input.quantity,
        })
      }

      this.repository.createMovement({
        movementType: "TRANSFER",
        itemType: "CONSUMABLE",
        inventoryEntryId: entry.id,
        quantity: input.quantity,
        fromWarehouseId: input.fromWarehouseId ?? null,
        fromProjectId: input.fromProjectId ?? null,
        toWarehouseId: input.toWarehouseId ?? null,
        toProjectId: input.toProjectId ?? null,
        note: normalizeText(input.note),
        occurredAt: resolveOccurredAt(input.occurredAt),
      })
    })

    return this.getLocationContents({ warehouseId: input.toWarehouseId ?? null, projectId: input.toProjectId ?? null })
  }

  /** addInvoiceAttachments. */
  async addInvoiceAttachments(invoiceGroupId: string, files: InventoryUploadFile[], auditContext?: MutationAuditContext) {
    this.createMutationAuditContext(auditContext)

    const group = this.repository.getInvoiceGroupById(invoiceGroupId)
    if (!group) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على الفاتورة المطلوبة.")
    }

    if (files.length === 0) {
      throw new InventoryError("VALIDATION", "يجب اختيار ملف واحد على الأقل.")
    }

    if (files.length > MAX_INVOICE_ATTACHMENT_COUNT) {
      throw new InventoryError("VALIDATION", "عدد الملفات المرفوعة كبير جدًا.", [
        { field: "files", message: `الحد الأقصى هو ${MAX_INVOICE_ATTACHMENT_COUNT} ملفات لكل فاتورة.` },
      ])
    }

    const totalFileSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalFileSize > MAX_INVOICE_ATTACHMENT_TOTAL_SIZE) {
      throw new InventoryError("VALIDATION", "إجمالي حجم الملفات كبير جدًا.", [
        { field: "files", message: "يرجى تقليل إجمالي حجم المرفقات قبل الرفع." },
      ])
    }

    const savedFiles: Array<InventoryStoredUpload> = []

    try {
      for (const file of files) {
        if (!ALLOWED_INVOICE_ATTACHMENT_MIME_TYPES.has(file.type)) {
          throw new InventoryError("VALIDATION", `نوع الملف غير مدعوم: ${file.name}`)
        }

        if (file.size > MAX_INVOICE_ATTACHMENT_SIZE) {
          throw new InventoryError("VALIDATION", `حجم الملف كبير جدًا: ${file.name}`)
        }

        // Read the bytes only after every limit check passes — over-limit
        // requests are rejected before any byte-array copy is allocated
        // (issue #214: lazy bytes owned by the module, not the transport).
        const byteContent = await file.bytes()

        const saved = await this.storage.saveInvoiceAttachment({
          invoiceGroupId,
          originalName: file.name,
          bytes: byteContent,
        })

        savedFiles.push({
          id: saved.attachmentId,
          originalName: file.name,
          mimeType: file.type,
          byteSize: file.size,
          storageKey: saved.storageKey,
          relativePath: saved.relativePath,
          sha256: saved.sha256,
        })
      }

      const attachments = this.repository.withTransaction(() =>
        savedFiles.map((file) =>
          this.repository.createAttachment({
            invoiceGroupId,
            originalName: file.originalName,
            mimeType: file.mimeType,
            byteSize: file.byteSize,
            storageKey: file.storageKey,
            relativePath: file.relativePath,
            sha256: file.sha256,
          }),
        ),
      )

      return attachments
    } catch (error) {
      await Promise.all(savedFiles.map((file) => this.storage.deleteRelativePath(file.relativePath)))
      throw error
    }
  }

  /** getAttachmentDownload. */
  async getAttachmentDownload(id: string) {
    const attachment = this.repository.getAttachmentById(id)
    if (!attachment) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على الملف المطلوب.")
    }

    const body = await this.storage.readRelativePath(attachment.relativePath)

    return {
      attachment,
      body,
    }
  }

/** Record a payment against an invoice group. */
  recordInvoicePayment(input: { invoiceGroupId: string; amountDzd: number; note?: string | null }, auditContext?: MutationAuditContext) {
    if (!this.debtService) {
      throw new InventoryError("BUSINESS_RULE", "خدمة الدين غير متاحة.")
    }

    const invoice = this.repository.getInvoiceGroupById(input.invoiceGroupId)
    if (!invoice) {
      throw new InventoryError("NOT_FOUND", "الفاتورة المحددة غير موجودة.")
    }

    if (!invoice.debtAccountId) {
      throw new InventoryError("BUSINESS_RULE", "الفاتورة لا ترتبط بحساب دين.")
    }

    const amountToRecord = normalizePositive(input.amountDzd, "amountDzd")
    if (amountToRecord > invoice.remainingDebtDzd) {
      throw new InventoryError("VALIDATION", "المبلغ المدفوع يتجاوز الدين المتبقي.", [
        { field: "amountDzd", message: `لا يمكن دفع أكثر من ${invoice.remainingDebtDzd} دزد.` },
      ])
    }

    return this.repository.withTransaction(() => {
      const newPaidAmount = invoice.paidAmountDzd + amountToRecord
      const newRemainingDebt = invoice.remainingDebtDzd - amountToRecord

      this.repository.updateInvoiceGroupPayment(input.invoiceGroupId, newPaidAmount, newRemainingDebt, auditContext)

      const result = this.debtService!.createDebtEntry(
        {
          debtAccountId: invoice.debtAccountId!,
          entryType: "PAYMENT",
          signedAmountDzd: -amountToRecord,
          note: input.note ?? `دفع فاتورة ${invoice.invoiceNumber ?? ""}`,
        },
        auditContext,
      )

      if (!result.success) {
        throw new InventoryError("BUSINESS_RULE", "تعذر تسجيل الدفع في حساب الدين.")
      }

      const updated = this.repository.getInvoiceGroupById(input.invoiceGroupId)
      return updated!
    })
  }

/** Create an outbound transfer. */
  createOutboundTransfer(input: InventoryOutboundTransferCreateInput, auditContext?: MutationAuditContext) {
    if (!this.debtService) {
      throw new InventoryError("BUSINESS_RULE", "خدمة الدين غير متاحة.")
    }

    if (!input.items.length) {
      throw new InventoryError("VALIDATION", "يجب إضافة عناصر للتحويل.")
    }

    if (input.fromType === "WAREHOUSE") {
      validateWarehouse(this.repository, input.fromId, "fromId")
    } else {
      validateProject(this.repository, input.fromId, "fromId")
    }

    validateExternalCounterparty(this.repository, input.counterpartyId, "counterpartyId")

    return this.repository.withTransaction(() => {
      let associatedDebtAccountId: string | undefined
      const debtAmountDzd = input.debtAmountDzd ?? 0
      const firstPaymentAmountDzd = input.firstPaymentAmountDzd ?? 0

      if (firstPaymentAmountDzd > debtAmountDzd) {
        throw new InventoryError("VALIDATION", "الدفعة الأولى تتجاوز مبلغ الدين.", [
          { field: "firstPaymentAmountDzd", message: "لا يمكن أن تتجاوز الدفعة الأولى مبلغ الدين." },
        ])
      }

      if (debtAmountDzd > 0) {
        // D8: the counterparty received goods, so the debt is a receivable
        // (they owe us). `debtAmountDzd` is the full transfer value; the ledger
        // keeps it as the OPENING and posts the collected first payment as a
        // real PAYMENT, so the running balance is the amount still on credit.
        const occurredAt = createAlgeriaTimestamp()
        const debtResult = this.debtService!.createDebtAccount(
          {
            partyType: "EXTERNAL_COUNTERPARTY",
            externalCounterpartyId: input.counterpartyId,
            direction: "RECEIVABLE",
            openingBalanceDzd: debtAmountDzd,
            openingEntryDate: occurredAt,
            openingEntryNote: `دين من تحويل إلى ${input.counterpartyId}`,
          },
          auditContext,
        )
        associatedDebtAccountId = debtResult.item.id

        if (firstPaymentAmountDzd > 0) {
          this.debtService!.createDebtEntry(
            {
              debtAccountId: associatedDebtAccountId,
              entryType: "PAYMENT",
              signedAmountDzd: -firstPaymentAmountDzd,
              entryDate: occurredAt,
              note: `الدفعة الأولى عند التحويل إلى ${input.counterpartyId}`,
            },
            auditContext,
          )
        }
      }

      for (const item of input.items) {
        const itemDef = this.repository.getItemDefinitionById(item.itemId)
        if (!itemDef) {
          throw new InventoryError("NOT_FOUND", `العنصر ${item.itemId} غير موجود.`)
        }

        if (itemDef.itemType === "CONSUMABLE") {
          const balance = this.repository.getConsumableBalanceByEntryAndLocation({
            inventoryEntryId: item.itemId,
            warehouseId: input.fromType === "WAREHOUSE" ? input.fromId : null,
            projectId: input.fromType === "PROJECT" ? input.fromId : null,
          })

          if (!balance || balance.quantity < item.quantity) {
            throw new InventoryError("BUSINESS_RULE", `الكمية المطلوبة من ${itemDef.name} غير متوفرة.`)
          }

          const newQuantity = balance.quantity - item.quantity
          if (newQuantity > 0) {
            this.repository.updateConsumableBalanceQuantity(balance.id, newQuantity)
          } else {
            this.repository.deleteConsumableBalance(balance.id)
          }
        } else {
          const assets = this.repository.listAssetUnitsByLocation({
            warehouseId: input.fromType === "WAREHOUSE" ? input.fromId : undefined,
            projectId: input.fromType === "PROJECT" ? input.fromId : undefined,
          }).slice(0, item.quantity)

          if (assets.length < item.quantity) {
            throw new InventoryError("BUSINESS_RULE", `الكمية المطلوبة من ${itemDef.name} غير متوفرة.`)
          }

          for (const asset of assets) {
            this.repository.updateAssetUnitLocation(asset.id, { currentWarehouseId: null, currentProjectId: null })
          }
        }

        this.repository.createMovement({
          movementType: "OUTBOUND_SALE",
          itemType: itemDef.itemType,
          inventoryEntryId: itemDef.itemType === "CONSUMABLE" ? item.itemId : undefined,
          quantity: item.quantity,
          fromWarehouseId: input.fromType === "WAREHOUSE" ? input.fromId : undefined,
          fromProjectId: input.fromType === "PROJECT" ? input.fromId : undefined,
          note: `تحويل خارجي إلى ${input.counterpartyId}`,
          occurredAt: createAlgeriaTimestamp(),
        })
      }

      const transfer = this.repository.createOutboundTransfer(
        {
          fromType: input.fromType,
          fromId: input.fromId,
          counterpartyId: input.counterpartyId,
          transferType: input.transferType,
          items: input.items,
          associatedDebtAccountId,
          notes: input.notes,
        },
        auditContext,
      )

      return transfer
    })
  }

/** List all outbound transfers. */
  listOutboundTransfers() {
    return this.repository.listOutboundTransfers()
  }

/** List inventory transfer history with optional location and movement type filters. */
  listTransferHistory(input: { warehouseId?: string; projectId?: string; dateFrom?: string; dateTo?: string; movementType?: string; limit?: number }) {
    if (input.warehouseId || input.projectId) {
      // Location-specific transfer history
      return {
        items: this.repository.listMovementsByLocation({
          warehouseId: input.warehouseId,
          projectId: input.projectId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          movementType: input.movementType,
          limit: input.limit,
        })
      }
    }

    // Global transfer history
    return {
      items: this.repository.listAllMovements({
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        movementType: input.movementType,
        limit: input.limit,
      })
    }
  }

/** Get a single outbound transfer by ID. */
  getOutboundTransferById(id: string) {
    const transfer = this.repository.getOutboundTransferById(id)
    if (!transfer) {
      throw new InventoryError("NOT_FOUND", "التحويل المحدد غير موجود.")
    }
    return transfer
  }

  /**
   * Generate the INVENTORY report.
   *
   * Real aggregation over invoice entries (joined with their invoice-group
   * document date) — the dashboard's total-value/assets cards. Semantics:
   * window = [startDate, endDate] applied on the document date
   * (invoice date, falling back to entry creation); unbounded sides are open.
   * Values are the entry total prices split by item type — no fabricated
   * splits or proportions. Empty windows yield an honest all-zero report.
   */
  generateInventoryReport(input: { startDate?: string; endDate?: string }): InventoryReport {
    const { startMs, endMs, reportDateMs } = resolveReportWindow(input)
    const rows = this.repository.listInventoryValuations().filter((row) => {
      const documentMs = Date.parse(row.documentDate)
      return documentMs >= startMs && documentMs <= endMs
    })

    let totalAssetsRaw = 0
    let totalConsumablesRaw = 0
    for (const row of rows) {
      if (row.itemType === "ASSET") {
        totalAssetsRaw += row.totalPriceDzd
      } else {
        totalConsumablesRaw += row.totalPriceDzd
      }
    }
    const totalAssetsDzd = roundMoney(totalAssetsRaw)
    const totalConsumablesDzd = roundMoney(totalConsumablesRaw)
    const totalValueDzd = roundMoney(totalAssetsRaw + totalConsumablesRaw)

    const locations = new Map<string, {
      locationId: string | null
      locationLabel: string
      assetCount: number
      assetValueDzd: number
      consumableCount: number
    }>()
    for (const row of rows) {
      // Warehouse and project ids live in separate namespaces, so a warehouse
      // and a project can share an id string; key by a location-kind-qualified
      // id so they never merge, while still emitting the single nullable id.
      const key = row.locationType === "WAREHOUSE" ? `w:${row.locationId}` : row.locationType === "PROJECT" ? `p:${row.locationId}` : "__unlocated__"
      const current = locations.get(key) ?? {
        locationId: row.locationId,
        locationLabel: row.locationLabel,
        assetCount: 0,
        assetValueDzd: 0,
        consumableCount: 0,
      }
      if (row.itemType === "ASSET") {
        current.assetCount += row.quantity
        current.assetValueDzd += row.totalPriceDzd
      } else {
        current.consumableCount += row.quantity
      }
      locations.set(key, current)
    }
    const byLocation = Array.from(locations.values())
      .map((location) => ({ ...location, assetValueDzd: roundMoney(location.assetValueDzd) }))
      .sort((a, b) => a.locationLabel.localeCompare(b.locationLabel, "ar"))

    const items = new Map<string, {
      itemName: string
      quantity: number
      valueDzd: number
      lastUpdated: string
    }>()
    for (const row of rows) {
      const current = items.get(row.itemName) ?? {
        itemName: row.itemName,
        quantity: 0,
        valueDzd: 0,
        lastUpdated: row.lastUpdated,
      }
      current.quantity += row.quantity
      current.valueDzd += row.totalPriceDzd
      if (row.lastUpdated > current.lastUpdated) {
        current.lastUpdated = row.lastUpdated
      }
      items.set(row.itemName, current)
    }
    const byItemType = Array.from(items.values())
      .map((item) => ({ ...item, valueDzd: roundMoney(item.valueDzd) }))
      .sort((a, b) => b.valueDzd - a.valueDzd || a.itemName.localeCompare(b.itemName, "ar"))

    const agingAccumulators: Record<
      "0-30_DAYS" | "31-90_DAYS" | "90-180_DAYS" | "180+_DAYS",
      { count: number; valueDzd: number }
    > = {
      "0-30_DAYS": { count: 0, valueDzd: 0 },
      "31-90_DAYS": { count: 0, valueDzd: 0 },
      "90-180_DAYS": { count: 0, valueDzd: 0 },
      "180+_DAYS": { count: 0, valueDzd: 0 },
    }
    for (const row of rows) {
      const age = ageInDays(Date.parse(row.documentDate), reportDateMs)
      const category =
        age <= 30 ? "0-30_DAYS" : age <= 89 ? "31-90_DAYS" : age <= 179 ? "90-180_DAYS" : "180+_DAYS"
      agingAccumulators[category].count += 1
      agingAccumulators[category].valueDzd += row.totalPriceDzd
    }
    const agingAnalysis = (["0-30_DAYS", "31-90_DAYS", "90-180_DAYS", "180+_DAYS"] as const).map(
      (ageCategory) => ({
        ageCategory,
        count: agingAccumulators[ageCategory].count,
        valueDzd: roundMoney(agingAccumulators[ageCategory].valueDzd),
      }),
    )

    return {
      type: "INVENTORY",
      generatedAt: createAlgeriaTimestamp(),
      summary: {
        totalAssetsDzd,
        totalConsumablesDzd,
        totalValueDzd,
      },
      byLocation,
      byItemType,
      agingAnalysis,
    }
  }

  /**
   * Generate the MOVEMENT report.
   *
   * Real aggregation over inventory movements in the window (applied on
   * `occurredAt`). Movement value = quantity × the linked entry's unit price;
   * movements without an entry link (e.g. asset outbound sales, which record
   * no entry reference) honestly contribute value 0 — never an estimate.
   */
  generateMovementReport(input: { startDate?: string; endDate?: string }): MovementReport {
    const { startMs, endMs } = resolveReportWindow(input)
    const rows = this.repository.listMovementValuations().filter(({ movement }) => {
      const occurredMs = Date.parse(movement.occurredAt)
      return occurredMs >= startMs && occurredMs <= endMs
    })

    let assetTransfers = 0
    let consumableTransfers = 0
    let outboundSales = 0
    for (const { movement } of rows) {
      if (movement.movementType === "TRANSFER") {
        if (movement.itemType === "ASSET") {
          assetTransfers += 1
        } else {
          consumableTransfers += 1
        }
      } else if (movement.movementType === "OUTBOUND_SALE") {
        outboundSales += 1
      }
    }

    const byType = (["PURCHASE", "TRANSFER", "OUTBOUND_SALE"] as const).map((movementType) => {
      const ofType = rows.filter(({ movement }) => movement.movementType === movementType)
      const valueDzd = ofType.reduce(
        (sum, { movement, unitPriceDzd }) => sum + (unitPriceDzd ?? 0) * movement.quantity,
        0,
      )
      return { movementType, count: ofType.length, valueDzd: roundMoney(valueDzd) }
    })

    const periods = new Map<string, { count: number; valueDzd: number }>()
    for (const { movement, unitPriceDzd } of rows) {
      const period = movement.occurredAt.slice(0, 7)
      const current = periods.get(period) ?? { count: 0, valueDzd: 0 }
      current.count += 1
      current.valueDzd += (unitPriceDzd ?? 0) * movement.quantity
      periods.set(period, current)
    }
    const byPeriod = Array.from(periods.entries())
      .map(([period, { count, valueDzd }]) => ({ period, count, valueDzd: roundMoney(valueDzd) }))
      .sort((a, b) => a.period.localeCompare(b.period))

    const destinations = new Map<string, {
      destinationLabel: string
      receiveCount: number
      valueDzd: number
    }>()
    for (const { movement, unitPriceDzd } of rows) {
      if (!movement.toWarehouseId && !movement.toProjectId) {
        continue
      }
      const key = movement.toWarehouseId ?? movement.toProjectId ?? ""
      const current = destinations.get(key) ?? {
        destinationLabel: this.repository.resolveLocationLabel(movement.toWarehouseId, movement.toProjectId),
        receiveCount: 0,
        valueDzd: 0,
      }
      current.receiveCount += 1
      current.valueDzd += (unitPriceDzd ?? 0) * movement.quantity
      destinations.set(key, current)
    }
    const topDestinations = Array.from(destinations.values())
      .map((destination) => ({ ...destination, valueDzd: roundMoney(destination.valueDzd) }))
      .sort(
        (a, b) =>
          b.receiveCount - a.receiveCount || a.destinationLabel.localeCompare(b.destinationLabel, "ar"),
      )
      .slice(0, 10)

    return {
      type: "MOVEMENT",
      generatedAt: createAlgeriaTimestamp(),
      summary: {
        totalMovements: rows.length,
        assetTransfers,
        consumableTransfers,
        outboundSales,
      },
      byType,
      byPeriod,
      topDestinations,
    }
  }
}
