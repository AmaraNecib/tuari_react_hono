import {
  MAX_MONEY_DZD,
  inventoryAssetChargeDefaultSchema,
  inventoryAssetChargeUpdateInputSchema,
  inventoryAssetChargeVoidInputSchema,
  nonNegativePaymentAmountSchema,
  type InventoryAssetChargeDefaultInput,
  type InventoryAssetChargeDefault,
  type InventoryAssetChargeUpdateInput,
  type InventoryAssetChargeVoidInput,
} from "@tuari/contracts"

import { createAlgeriaTimestamp } from "../company/company-time"
import { roundMoney } from "../company/report.helpers"
import type { MutationAuditContext } from "../company/company.types"
import { InventoryError } from "./inventory.errors"
import type { InventoryAssetChargeRepository } from "./asset-charge.repository"
import type {
  InventoryAssetChargeAssetLookup,
  InventoryAssetChargeCreateData,
  InventoryAssetChargeDetailRecord,
  InventoryAssetChargeRecord,
} from "./asset-charge.types"

function normalizeMutationAuditContext(auditContext?: MutationAuditContext): Required<MutationAuditContext> {
  return {
    actorUserId: auditContext?.actorUserId ?? null,
    actorLabel: auditContext?.actorLabel ?? null,
    transactionId: auditContext?.transactionId ?? crypto.randomUUID(),
  }
}

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function successResult<T>(message: string, item: T) {
  return { success: true as const, message, item }
}

/**
 * AssetChargeService — the project-charge rules for asset placements (#413).
 *
 * A charge belongs to ONE placement (the transfer movement). Moving a unit to a
 * project asks for an amount; moving it to a warehouse asks nothing. The default
 * amount is the unit's last live charge, else its purchase price. Corrections
 * keep a from → to revision so the chain stays auditable.
 */
export class AssetChargeService {
  constructor(
    private readonly repository: InventoryAssetChargeRepository,
    private readonly inventory: InventoryAssetChargeAssetLookup,
  ) {}

  /** resolveDefault — the amount a new placement should prefill. */
  resolveDefault(input: InventoryAssetChargeDefaultInput): InventoryAssetChargeDefault {
    const asset = this.inventory.getAssetUnitById(input.assetUnitId)
    if (!asset) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على الأصل المطلوب.")
    }

    const lastAmount = this.repository.getLastChargeAmount(asset.id)
    // Validate the RESOLVED default against the same money bound the wire
    // contract uses. A purchase price (or, defensively, a stored last amount)
    // above `MAX_MONEY_DZD` must fail here with a clear error instead of
    // reaching the response schema and breaking the payload.
    const resolved = inventoryAssetChargeDefaultSchema.safeParse({
      assetUnitId: asset.id,
      amountDzd: lastAmount ?? asset.purchasePriceDzd,
      purchasePriceDzd: asset.purchasePriceDzd,
      source: lastAmount === null ? "PURCHASE_PRICE" : "LAST_CHARGE",
    })
    if (!resolved.success) {
      throw new InventoryError("VALIDATION", "المبلغ الافتراضي للاحتساب خارج النطاق المسموح به.", [
        { field: "amountDzd", message: "المبلغ الافتراضي للاحتساب خارج النطاق المسموح به." },
      ])
    }

    return resolved.data
  }

  /** getDefault — entity result wrapper for the prefill procedure. */
  getDefault(input: InventoryAssetChargeDefaultInput) {
    return successResult("تم تحميل المبلغ الافتراضي بنجاح.", this.resolveDefault(input))
  }

  /**
   * createPlacementCharge — write the charge for a placement. Called by the
   * transfer flow INSIDE its own transaction, so the movement and its charge
   * commit or roll back together. `amountDzd` omitted/null resolves the
   * default; an explicit `0` is a free placement.
   */
  createPlacementCharge(
    input: {
      assetUnitId: string
      projectId: string
      movementId?: string | null
      amountDzd?: number | null
    },
    auditContext?: MutationAuditContext,
  ): InventoryAssetChargeRecord {
    const audit = normalizeMutationAuditContext(auditContext)

    if (!this.inventory.projectExists(input.projectId)) {
      throw new InventoryError("VALIDATION", "المشروع المحدد غير موجود.", [
        { field: "projectId", message: "المشروع المحدد غير موجود." },
      ])
    }

    const amountDzd =
      input.amountDzd === undefined || input.amountDzd === null
        ? this.resolveDefault({ assetUnitId: input.assetUnitId }).amountDzd
        : this.parseAmount(input.amountDzd, "chargeAmountDzd")

    const data: InventoryAssetChargeCreateData = {
      assetUnitId: input.assetUnitId,
      projectId: input.projectId,
      movementId: input.movementId ?? null,
      amountDzd,
      actorUserId: audit.actorUserId,
      actorLabel: audit.actorLabel,
      transactionId: audit.transactionId,
    }

    return this.repository.createCharge(data)
  }

  /** listByUnit — the unit's charge chain, newest first, with revisions. */
  listByUnit(input: { assetUnitId: string }) {
    return {
      items: this.repository
        .listChargesByUnit(input.assetUnitId)
        .map((charge) => this.toDetail(charge)),
    }
  }

  /** listByProject — the project's live charges plus their total. */
  listByProject(input: { projectId: string }): { projectId: string; totalDzd: number; charges: InventoryAssetChargeRecord[] } {
    if (!this.inventory.projectExists(input.projectId)) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على المشروع المطلوب.")
    }

    const charges = this.repository
      .listChargesByProject(input.projectId)
      .filter((charge) => charge.status === "LIVE")
    const totalDzd = this.sumLiveCharges(charges)

    return { projectId: input.projectId, totalDzd, charges }
  }

  /** getProjectCharges — entity result wrapper for the project cost view. */
  getProjectCharges(input: { projectId: string }) {
    return successResult("تم تحميل احتسابات المشروع بنجاح.", this.listByProject(input))
  }

  /** updateCharge — correct a live charge, recording from → to + reason. */
  updateCharge(input: InventoryAssetChargeUpdateInput, auditContext?: MutationAuditContext) {
    const parsed = inventoryAssetChargeUpdateInputSchema.safeParse(input)
    if (!parsed.success) {
      throw new InventoryError("VALIDATION", "يجب إدخال مبلغ صحيح.", [
        { field: "amountDzd", message: "يجب إدخال مبلغ صحيح." },
      ])
    }

    const audit = normalizeMutationAuditContext(auditContext)
    const charge = this.requireLiveCharge(parsed.data.chargeId)
    const reason = normalizeText(parsed.data.reason)

    const updated = this.repository.withTransaction(() =>
      this.repository.updateCharge(
        charge.id,
        { amountDzd: parsed.data.amountDzd, updatedAt: createAlgeriaTimestamp() },
        {
          chargeId: charge.id,
          previousAmountDzd: charge.amountDzd,
          newAmountDzd: parsed.data.amountDzd,
          reason,
          actorUserId: audit.actorUserId,
          actorLabel: audit.actorLabel,
          transactionId: audit.transactionId,
        },
      ),
    )

    /* v8 ignore start -- the charge was just read under the same transaction; a null here is unreachable */
    if (!updated) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على الاحتساب المطلوب.")
    }
    /* v8 ignore stop */

    return successResult("تم تصحيح الاحتساب بنجاح.", this.toDetail(updated))
  }

  /** voidCharge — void a live charge, recording from → 0 + reason. */
  voidCharge(input: InventoryAssetChargeVoidInput, auditContext?: MutationAuditContext) {
    const parsed = inventoryAssetChargeVoidInputSchema.safeParse(input)
    if (!parsed.success) {
      throw new InventoryError("VALIDATION", "طلب غير صالح لإلغاء الاحتساب.")
    }

    const audit = normalizeMutationAuditContext(auditContext)
    const charge = this.requireLiveCharge(parsed.data.chargeId)
    const reason = normalizeText(parsed.data.reason)
    const now = createAlgeriaTimestamp()

    const updated = this.repository.withTransaction(() =>
      this.repository.updateCharge(
        charge.id,
        {
          status: "VOID",
          voidedAt: now,
          voidedBy: audit.actorLabel,
          voidReason: reason,
          updatedAt: now,
        },
        {
          chargeId: charge.id,
          previousAmountDzd: charge.amountDzd,
          newAmountDzd: null,
          reason,
          actorUserId: audit.actorUserId,
          actorLabel: audit.actorLabel,
          transactionId: audit.transactionId,
        },
      ),
    )

    /* v8 ignore start -- the charge was just read under the same transaction; a null here is unreachable */
    if (!updated) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على الاحتساب المطلوب.")
    }
    /* v8 ignore stop */

    return successResult("تم إلغاء الاحتساب بنجاح.", this.toDetail(updated))
  }

  private toDetail(charge: InventoryAssetChargeRecord): InventoryAssetChargeDetailRecord {
    return { ...charge, revisions: this.repository.listRevisions(charge.id) }
  }

  /**
   * Sum the live charges of a project.
   *
   * Each charge may legally reach `MAX_MONEY_DZD`, but `totalDzd` in
   * `inventoryProjectChargesSchema` shares the same bound, so an overflowing
   * sum would emit a payload the contract forbids. Amounts are non-negative,
   * so the running total only grows: checking after each addition catches the
   * overflow before it can silently lose precision or reach `Infinity`. Round
   * at the money boundary with the shared report helper so float noise such as
   * `0.1 + 0.2` never leaks into the project total.
   */
  private sumLiveCharges(charges: InventoryAssetChargeRecord[]) {
    let totalDzd = 0

    for (const charge of charges) {
      totalDzd += charge.amountDzd
      if (totalDzd > MAX_MONEY_DZD) {
        throw this.projectTotalOutOfRange()
      }
    }

    return roundMoney(totalDzd)
  }

  private projectTotalOutOfRange() {
    const message = "إجمالي احتسابات المشروع يتجاوز الحد الأقصى المسموح به."
    return new InventoryError("BUSINESS_RULE", message, [{ field: "totalDzd", message }])
  }

  private requireLiveCharge(chargeId: string) {
    const charge = this.repository.getChargeById(chargeId)
    if (!charge) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على الاحتساب المطلوب.")
    }

    if (charge.status !== "LIVE") {
      throw new InventoryError("BUSINESS_RULE", "لا يمكن تعديل احتساب ملغى.")
    }

    return charge
  }

  private parseAmount(value: number, field: string) {
    const parsed = nonNegativePaymentAmountSchema.safeParse(value)
    if (!parsed.success) {
      throw new InventoryError("VALIDATION", "يجب إدخال مبلغ صالح.", [
        { field, message: "يجب إدخال مبلغ صالح." },
      ])
    }

    return parsed.data
  }
}
