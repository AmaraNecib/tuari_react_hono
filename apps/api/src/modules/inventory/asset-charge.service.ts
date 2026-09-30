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

    // Normalize a rogue `undefined` from an adapter to `null`, so the source
    // label and the `??` fallback below always agree (#413 round 3 debate F8).
    const lastAmount = this.repository.getLastChargeAmount(asset.id) ?? null
    // Validate the RESOLVED AMOUNT against the same money bound the charge
    // contract uses. A purchase price (or, defensively, a stored last amount)
    // above `MAX_MONEY_DZD` must fail here instead of being USED as a charge.
    // The echoed `purchasePriceDzd` uses the permissive stored shape, so a
    // legacy above-bound price still reads back whenever the amount itself
    // comes from a valid last charge (#413 round 3).
    // Round at the boundary so the default the dialog prefills is EXACTLY the
    // amount that will be stored: a sub-cent source (a legacy price) must not
    // show one value and persist another (#422 round 6).
    const resolved = inventoryAssetChargeDefaultSchema.safeParse({
      assetUnitId: asset.id,
      amountDzd: roundMoney(lastAmount ?? asset.purchasePriceDzd),
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

    // The aggregate check and the insert run inside one locked transaction, so
    // two individually valid charges cannot slip past the bound and leave the
    // project in a state whose total can never be read (#422 round 4).
    return this.repository.withTransaction(() => {
      this.assertProjectTotalWithinBound(input.projectId, amountDzd)
      return this.repository.createCharge(data)
    })
  }

  /**
   * createPlacementCharges — the bulk form of {@link createPlacementCharge}.
   *
   * A purchase invoice can place many units on the SAME project at once. The
   * single-placement path re-reads the project's live charges for every unit,
   * so an N-unit purchase costs N scans. This reads them ONCE and advances a
   * running total across the batch, so the cost is one read regardless of N
   * (#422 round 6). Amounts resolve exactly as the single path (an explicit
   * value, else the unit's default) and every charge shares the caller's
   * transaction.
   */
  createPlacementCharges(
    input: {
      projectId: string
      placements: Array<{ assetUnitId: string; movementId?: string | null; amountDzd?: number | null }>
    },
    auditContext?: MutationAuditContext,
  ): InventoryAssetChargeRecord[] {
    const audit = normalizeMutationAuditContext(auditContext)

    if (!this.inventory.projectExists(input.projectId)) {
      throw new InventoryError("VALIDATION", "المشروع المحدد غير موجود.", [
        { field: "projectId", message: "المشروع المحدد غير موجود." },
      ])
    }

    return this.repository.withTransaction(() => {
      // One read for the whole batch. `currentTotalDzd` is what the read-back
      // shows before the batch and what the refusal message reports; the
      // running total advances with each created charge, so an N-unit purchase
      // costs one scan instead of N (#422 round 6).
      const liveAmounts = this.repository
        .listChargesByProject(input.projectId)
        .filter((charge) => charge.status === "LIVE")
        .map((charge) => charge.amountDzd)
      const currentTotalDzd = this.sumLiveCharges(liveAmounts)
      let runningTotalDzd = currentTotalDzd

      return input.placements.map((placement) => {
        // Resolve each default AS the batch is written, so a unit placed twice
        // in one batch defaults to the amount just charged to it, exactly like
        // sequential single placements.
        const amountDzd =
          placement.amountDzd === undefined || placement.amountDzd === null
            ? this.resolveDefault({ assetUnitId: placement.assetUnitId }).amountDzd
            : this.parseAmount(placement.amountDzd, "chargeAmountDzd")

        runningTotalDzd = roundMoney(runningTotalDzd + amountDzd)
        if (runningTotalDzd > MAX_MONEY_DZD) {
          throw this.projectTotalOutOfRange(currentTotalDzd, "amountDzd")
        }

        return this.repository.createCharge({
          assetUnitId: placement.assetUnitId,
          projectId: input.projectId,
          movementId: placement.movementId ?? null,
          amountDzd,
          actorUserId: audit.actorUserId,
          actorLabel: audit.actorLabel,
          transactionId: audit.transactionId,
        })
      })
    })
  }

  /** listByUnit — the unit's charge chain, newest first, with revisions. */
  listByUnit(input: { assetUnitId: string }) {
    // One revisions query for the whole chain instead of one per charge (#422
    // round 5). `toDetail` stays for the single-charge update/void results.
    const charges = this.repository.listChargesByUnit(input.assetUnitId)
    const revisionsByChargeId = this.repository.listRevisionsByChargeIds(charges.map((charge) => charge.id))

    return {
      items: charges.map((charge) => ({
        ...charge,
        revisions: revisionsByChargeId.get(charge.id) ?? [],
      })),
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
    const totalDzd = this.sumLiveCharges(charges.map((charge) => charge.amountDzd))
    if (totalDzd > MAX_MONEY_DZD) {
      throw this.projectTotalOutOfRange(totalDzd)
    }

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
    const reason = normalizeText(parsed.data.reason)
    // Round at the write boundary with the same helper the read uses, so the
    // stored amount and the summed total can never disagree (#422 round 6).
    const amountDzd = this.parseAmount(parsed.data.amountDzd, "amountDzd")

    // The read, the aggregate check and the write share one locked transaction:
    // a concurrent correction/void can no longer make the revision record a
    // stale "from" amount or land on a row that was just voided. The UPDATE
    // itself also carries `AND status='LIVE'`, so a second process sharing the
    // database cannot resurrect a voided charge (#422 round 4).
    const updated = this.repository.withTransaction(() => {
      const charge = this.requireLiveCharge(parsed.data.chargeId, "update")
      this.assertProjectTotalWithinBound(charge.projectId, amountDzd, charge.id)

      const result = this.repository.updateCharge(
        charge.id,
        { amountDzd, updatedAt: createAlgeriaTimestamp() },
        {
          chargeId: charge.id,
          previousAmountDzd: charge.amountDzd,
          newAmountDzd: amountDzd,
          reason,
          actorUserId: audit.actorUserId,
          actorLabel: audit.actorLabel,
          transactionId: audit.transactionId,
        },
      )
      if (!result) {
        throw new InventoryError("BUSINESS_RULE", "لا يمكن تعديل احتساب ملغى.")
      }

      return result
    })

    return successResult("تم تصحيح الاحتساب بنجاح.", this.toDetail(updated))
  }

  /** voidCharge — void a live charge, recording from → 0 + reason. */
  voidCharge(input: InventoryAssetChargeVoidInput, auditContext?: MutationAuditContext) {
    const parsed = inventoryAssetChargeVoidInputSchema.safeParse(input)
    if (!parsed.success) {
      throw new InventoryError("VALIDATION", "طلب غير صالح لإلغاء الاحتساب.")
    }

    const audit = normalizeMutationAuditContext(auditContext)
    const reason = normalizeText(parsed.data.reason)
    const now = createAlgeriaTimestamp()

    // Read-check-write under the connection lock, with `AND status='LIVE'` in
    // the UPDATE: a concurrent void cannot be overwritten from a stale read.
    const updated = this.repository.withTransaction(() => {
      const charge = this.requireLiveCharge(parsed.data.chargeId, "void")
      const result = this.repository.updateCharge(
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
      )
      if (!result) {
        throw new InventoryError("BUSINESS_RULE", "لا يمكن إلغاء احتساب ملغى.")
      }

      return result
    })

    return successResult("تم إلغاء الاحتساب بنجاح.", this.toDetail(updated))
  }

  private toDetail(charge: InventoryAssetChargeRecord): InventoryAssetChargeDetailRecord {
    return { ...charge, revisions: this.repository.listRevisions(charge.id) }
  }

  /**
   * Sum LIVE amounts in the order given. This is the ONE summation every
   * project total uses: the read (`listByProject`) and the write gate
   * (`assertProjectTotalWithinBound`) both pass the read's newest-first order.
   *
   * Floating-point addition is order-dependent, so a different accumulator —
   * the old SQLite `sum()` ran in rowid order — could accept a write that the
   * read then refuses, leaving a project whose total can never be read
   * (#422 round 5). Round at the money boundary with the shared report helper
   * so float noise such as `0.1 + 0.2` never leaks into the project total.
   *
   * The bound is enforced by the CALLER (`> MAX_MONEY_DZD`), because the write
   * gate needs the current total for its refusal message rather than the
   * running value at the point of overflow.
   */
  private sumLiveCharges(amounts: readonly number[]) {
    let totalDzd = 0

    for (const amountDzd of amounts) {
      totalDzd += amountDzd
    }

    return roundMoney(totalDzd)
  }

  /**
   * One refusal for one problem, whatever the path: names the shared limit and
   * the current total. The read backstop reports it on `totalDzd`; the write
   * gate reports it on `amountDzd`, the field the caller acted on.
   */
  private projectTotalOutOfRange(currentTotalDzd: number, field = "totalDzd") {
    const message = `إجمالي احتسابات المشروع يتجاوز الحد الأقصى المسموح به (${MAX_MONEY_DZD}). الإجمالي الحالي: ${currentTotalDzd}.`
    return new InventoryError("BUSINESS_RULE", message, [{ field, message }])
  }

  /**
   * Refuse a write that would push the project's LIVE total over the shared
   * money bound. Enforced at WRITE time so a project can never be left in a
   * state whose total cannot be read (#422 round 4).
   *
   * The projected list is built in the SAME newest-first order the read uses, so
   * `sumLiveCharges` computes exactly the total the read will compute after the
   * write commits (#422 round 5). `replaceChargeId` is the charge a correction
   * overwrites (it keeps the row's position); a placement passes nothing and
   * the new charge — the newest row — is prepended. The reported current total
   * is the project view's total (all LIVE charges), so the operator can
   * reconcile the message with the screen.
   */
  private assertProjectTotalWithinBound(projectId: string, nextAmountDzd: number, replaceChargeId?: string) {
    const liveAmounts = this.repository
      .listChargesByProject(projectId)
      .filter((charge) => charge.status === "LIVE")
      .map((charge) => ({ id: charge.id, amountDzd: charge.amountDzd }))

    const currentTotalDzd = this.sumLiveCharges(liveAmounts.map((charge) => charge.amountDzd))
    const projectedAmounts = replaceChargeId === undefined
      ? [nextAmountDzd, ...liveAmounts.map((charge) => charge.amountDzd)]
      : liveAmounts.map((charge) => (charge.id === replaceChargeId ? nextAmountDzd : charge.amountDzd))
    const attemptedTotalDzd = this.sumLiveCharges(projectedAmounts)

    if (attemptedTotalDzd > MAX_MONEY_DZD) {
      throw this.projectTotalOutOfRange(currentTotalDzd, "amountDzd")
    }
  }

  private requireLiveCharge(chargeId: string, action: "update" | "void" = "update") {
    const charge = this.repository.getChargeById(chargeId)
    if (!charge) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على الاحتساب المطلوب.")
    }

    if (charge.status !== "LIVE") {
      const message = action === "void" ? "لا يمكن إلغاء احتساب ملغى." : "لا يمكن تعديل احتساب ملغى."
      throw new InventoryError("BUSINESS_RULE", message)
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

    // Every persisted charge amount goes through this ONE boundary, so a
    // sub-cent input is stored as the amount the project total will sum
    // (#422 round 6).
    return roundMoney(parsed.data)
  }
}
