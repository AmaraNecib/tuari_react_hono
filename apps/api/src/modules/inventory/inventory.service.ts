import type {
  DebtAccountCreateInput,
  DebtEntryCreateInput,
  InventoryInvoiceGroupCreateInput,
  InventoryItemDefinitionCreateInput,
  InventoryItemDefinitionUpdateInput,
} from "@tuari/contracts"

import { InventoryError } from "./inventory.errors"
import { CompanyError } from "../company/company.errors"
import type { MutationAuditContext } from "../company/company.types"
import type {
  InventoryAssetUnitCreateData,
  InventoryUploadFile,
  InventoryStoredUpload,
} from "./inventory.types"
import type { InventoryRepository } from "./inventory.repository"
import { InventoryAttachmentStorage } from "./inventory.storage"

type DebtService = {
  createDebtAccount(input: DebtAccountCreateInput, auditContext?: MutationAuditContext): { success: true; item: { id: string } }
  createDebtEntry(input: DebtEntryCreateInput, auditContext?: MutationAuditContext): { success: true; item: { id: string } }
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

function generateNextInvoiceNumber(latestInvoiceNumber: string | null) {
  const match = latestInvoiceNumber?.match(/^IN-(\d+)$/)
  const nextNumber = match ? Number.parseInt(match[1] ?? "0", 10) + 1 : 1
  return `IN-${String(nextNumber).padStart(5, "0")}`
}

function resolveOccurredAt(value?: string | null) {
  return value ?? new Date().toISOString()
}

export class InventoryService {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly storage: InventoryAttachmentStorage,
    private readonly debtService?: DebtService,
  ) {}

  listItemDefinitions(filters?: { itemType?: "CONSUMABLE" | "ASSET"; isActive?: boolean }) {
    return { items: this.repository.listItemDefinitions(filters) }
  }

  getItemDefinition(id: string) {
    const item = this.repository.getItemDefinitionById(id)
    if (!item) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على تعريف العنصر المطلوب.")
    }

    return successResult("تم تحميل تعريف العنصر بنجاح.", item)
  }

  createItemDefinition(input: InventoryItemDefinitionCreateInput, auditContext?: MutationAuditContext) {
    const item = this.repository.createItemDefinition({
      name: input.name.trim(),
      itemType: input.itemType,
      unit: input.itemType === "CONSUMABLE" ? normalizeText(input.unit) : null,
      description: normalizeText(input.description),
    }, auditContext)

    return successResult("تم إنشاء تعريف العنصر بنجاح.", item)
  }

  updateItemDefinition(input: InventoryItemDefinitionUpdateInput, auditContext?: MutationAuditContext) {
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

    const item = this.repository.updateItemDefinition({
      id: input.id,
      name: input.name?.trim(),
      itemType: nextItemType,
      unit: nextUnit,
      description: input.description !== undefined ? normalizeText(input.description) : undefined,
      isActive: input.isActive,
    }, auditContext)

    return successResult("تم تحديث تعريف العنصر بنجاح.", item!)
  }

  listInvoiceGroups(filters?: { warehouseId?: string; projectId?: string }) {
    return { items: this.repository.listInvoiceGroups(filters) }
  }

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

  createInvoiceGroup(input: InventoryInvoiceGroupCreateInput, auditContext?: MutationAuditContext) {
    validateSingleDestination(input.warehouseId ?? null, input.projectId ?? null, "warehouseId")
    validateWarehouse(this.repository, input.warehouseId ?? null, "warehouseId")
    validateProject(this.repository, input.projectId ?? null, "projectId")
    validateExternalCounterparty(this.repository, input.externalCounterpartyId ?? null, "externalCounterpartyId")

    const detail = (() => {
      const resolvedInvoiceNumber = normalizeText(input.invoiceNumber) ?? generateNextInvoiceNumber(this.repository.getLatestInvoiceNumber())
      const resolvedInvoiceDate = resolveOccurredAt(input.invoiceDate ?? null)
      const preparedEntries: Array<
        | {
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
        | {
            kind: "ASSET"
            definitionId: string
            definitionName: string
            warehouseId: string | null
            projectId: string | null
            totalPriceDzd: number
            note: string | null
            assets: InventoryAssetUnitCreateData[]
          }
      > = []

      let grossTotalDzd = 0

      for (const [index, entry] of input.entries.entries()) {
        const definition = this.repository.getItemDefinitionById(entry.itemDefinitionId)
        if (!definition) {
          throw new InventoryError("VALIDATION", "العنصر المحدد غير موجود.", [{ field: `entries.${index}.itemDefinitionId`, message: "العنصر المحدد غير موجود." }])
        }

        const effectiveWarehouseId = entry.warehouseId ?? input.warehouseId ?? null
        const effectiveProjectId = entry.projectId ?? input.projectId ?? null
        validateSingleDestination(effectiveWarehouseId, effectiveProjectId, `entries.${index}.warehouseId`)
        validateWarehouse(this.repository, effectiveWarehouseId, `entries.${index}.warehouseId`)
        validateProject(this.repository, effectiveProjectId, `entries.${index}.projectId`)

        if (entry.kind === "CONSUMABLE") {
          if (definition.itemType !== "CONSUMABLE") {
            throw new InventoryError("VALIDATION", "تعريف العنصر لا يطابق نوع إدخال المواد الاستهلاكية.", [{ field: `entries.${index}.itemDefinitionId`, message: "تعريف العنصر لا يطابق نوع إدخال المواد الاستهلاكية." }])
          }

          const quantity = normalizePositive(entry.quantity, `entries.${index}.quantity`)
          const unitPriceDzd = normalizeMoney(entry.unitPriceDzd, `entries.${index}.unitPriceDzd`)
          const totalPriceDzd = normalizeMoney(entry.totalPriceDzd, `entries.${index}.totalPriceDzd`)
          grossTotalDzd += totalPriceDzd
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

        if (definition.itemType !== "ASSET") {
          throw new InventoryError("VALIDATION", "تعريف العنصر لا يطابق نوع إدخال الأصول.", [{ field: `entries.${index}.itemDefinitionId`, message: "تعريف العنصر لا يطابق نوع إدخال الأصول." }])
        }

        const assets: InventoryAssetUnitCreateData[] = entry.assets.map((asset, assetIndex) => ({
          inventoryEntryId: "",
          assetName: asset.assetName.trim(),
          assetTag: normalizeText(asset.assetTag),
          serialNumber: normalizeText(asset.serialNumber),
          condition: asset.condition ?? null,
          purchaseDate: asset.purchaseDate ?? null,
          purchasePriceDzd: normalizeMoney(asset.purchasePriceDzd, `entries.${index}.assets.${assetIndex}.purchasePriceDzd`),
          currentWarehouseId: effectiveWarehouseId,
          currentProjectId: effectiveProjectId,
          note: normalizeText(asset.note),
        }))

        const totalPriceDzd = assets.reduce((sum, asset) => sum + asset.purchasePriceDzd, 0)
        grossTotalDzd += totalPriceDzd
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

      const paidAmountDzd = input.createDebt
        ? input.paymentInputType === "PERCENT"
          ? normalizeMoney((grossTotalDzd * (input.paidPercent ?? 0)) / 100, "paidPercent")
          : normalizeMoney(input.paidAmountDzd ?? 0, "paidAmountDzd")
        : grossTotalDzd
      const remainingDebtDzd = input.createDebt ? Math.max(0, grossTotalDzd - paidAmountDzd) : 0

      let debtAccountId: string | null = null
      if (input.createDebt && input.externalCounterpartyId && grossTotalDzd > 0) {
        try {
          if (!this.debtService) {
            throw new InventoryError("BUSINESS_RULE", "خدمة الديون غير متاحة الآن.")
          }

          const debtResult = this.debtService.createDebtAccount({
            partyType: "EXTERNAL_COUNTERPARTY",
            externalCounterpartyId: input.externalCounterpartyId,
            openingBalanceDzd: -grossTotalDzd,
            openingEntryDate: resolvedInvoiceDate,
            openingEntryNote: `إجمالي فاتورة شراء ${resolvedInvoiceNumber}`,
            note: normalizeText(input.note),
          }, auditContext)

          debtAccountId = debtResult.item.id

          if (paidAmountDzd > 0) {
            this.debtService.createDebtEntry({
              debtAccountId,
              entryType: "PAYMENT",
              signedAmountDzd: paidAmountDzd,
              entryDate: resolvedInvoiceDate,
              note: `دفعة عند تسجيل الفاتورة ${resolvedInvoiceNumber}`,
            }, auditContext)
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
          this.repository.createMovement({
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
        }
      }

      return {
        group,
        entries: this.repository.listEntriesByInvoiceGroupId(group.id),
        attachments: this.repository.listAttachmentsByInvoiceGroupId(group.id),
        movements: this.repository.listMovementsByInvoiceGroupId(group.id),
        consumableBalances: this.repository.listConsumableBalancesByInvoiceGroupId(group.id),
      }
    })()

    return successResult("تم إنشاء الفاتورة والعناصر المرتبطة بها بنجاح.", detail)
  }

  getLocationContents(input: { warehouseId?: string | null; projectId?: string | null }) {
    validateSingleDestination(input.warehouseId ?? null, input.projectId ?? null, "warehouseId")

    return successResult("تم تحميل محتويات الموقع بنجاح.", {
      assets: this.repository.listAssetUnitsByLocation({ warehouseId: input.warehouseId ?? undefined, projectId: input.projectId ?? undefined }),
      consumables: this.repository.listConsumableBalancesByLocation({ warehouseId: input.warehouseId ?? undefined, projectId: input.projectId ?? undefined }),
    })
  }

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
    })
  }

  transferAsset(input: { assetUnitId: string; toWarehouseId?: string | null; toProjectId?: string | null; note?: string | null; occurredAt?: string }) {
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
      this.repository.createMovement({
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
    })

    return this.getAsset(asset.id)
  }

  transferConsumable(input: { inventoryEntryId: string; quantity: number; fromWarehouseId?: string | null; fromProjectId?: string | null; toWarehouseId?: string | null; toProjectId?: string | null; note?: string | null; occurredAt?: string }) {
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
      this.repository.updateConsumableBalanceQuantity(sourceBalance.id, sourceBalance.quantity - input.quantity)

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

  async addInvoiceAttachments(invoiceGroupId: string, files: InventoryUploadFile[]) {
    const group = this.repository.getInvoiceGroupById(invoiceGroupId)
    if (!group) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على الفاتورة المطلوبة.")
    }

    if (files.length === 0) {
      throw new InventoryError("VALIDATION", "يجب اختيار ملف واحد على الأقل.")
    }

    const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"])
    const maxFileSize = 10 * 1024 * 1024
    const savedFiles: Array<InventoryStoredUpload> = []

    try {
      for (const file of files) {
        if (!allowedMimeTypes.has(file.type)) {
          throw new InventoryError("VALIDATION", `نوع الملف غير مدعوم: ${file.name}`)
        }

        if (file.size > maxFileSize) {
          throw new InventoryError("VALIDATION", `حجم الملف كبير جدًا: ${file.name}`)
        }

        const saved = await this.storage.saveInvoiceAttachment({
          invoiceGroupId,
          originalName: file.name,
          bytes: file.bytes,
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
}
