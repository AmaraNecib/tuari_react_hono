import type { MutationAuditContext } from "../company/company.types"
import { InventoryError } from "./inventory.errors"
import type { InventoryRepository } from "./inventory.repository"
import { resolveItemOffer, type InventoryItemUsage, type InventoryItemDefinitionCreateInput, type InventoryItemDefinitionUpdateInput } from "@tuari/contracts"
import type { InventoryItemDefinitionRecord } from "./inventory.types"
import { normalizePageSize } from "../shared/cursor"
import { StructuredLogger } from "../../infrastructure/observability/logger"
import { createInventoryMutationAudit, type WorkspaceAdminAuthorizer } from "./inventory-mutation-audit"

type CatalogRepository = Pick<InventoryRepository, "listItemDefinitions" | "listItemDefinitionsPaged" | "getItemDefinitionById" | "createItemDefinition" | "updateItemDefinition" | "countEntriesByItemDefinitionId">

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
function successResult<T>(message: string, item: T) { return { success: true as const, message, item } }

export class CatalogService {
  constructor(private readonly repository: CatalogRepository, private readonly workspaceAdminAuthorizer?: WorkspaceAdminAuthorizer) {}
  private createMutationAuditContext(auditContext?: MutationAuditContext) {
    return createInventoryMutationAudit(auditContext, this.workspaceAdminAuthorizer)
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

}
