import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { schemaStatements } from "../../infrastructure/database/schema-definitions"
import { createInventoryRepository } from "./adapters/sqlite-inventory.repository"
import { CatalogService } from "./catalog.service"

const databases: Database.Database[] = []
afterEach(() => { databases.splice(0).forEach(db => db.close()) })
function fixture() {
  const db = new Database(":memory:")
  databases.push(db)
  schemaStatements.forEach(statement => db.exec(statement))
  return new CatalogService(createInventoryRepository(db), { isBootstrapOwner: id => id === "owner" })
}
const audit = { actorUserId: "owner" }

describe("standalone catalog", () => {
  it("creates, lists, reads and updates normalized definitions without financial or storage dependencies", () => {
    const catalog = fixture()
    const created = catalog.createItemDefinition({ name: " Cement ", itemType: "CONSUMABLE", unit: " bag ", description: "  " }, audit)
    expect(created.item).toMatchObject({ name: "Cement", unit: "bag", description: null })
    expect(catalog.listItemDefinitions().items).toEqual([created.item])
    expect(catalog.getItemDefinition(created.item.id).item).toEqual(created.item)
    expect(catalog.updateItemDefinition({ id: created.item.id, name: " Sand ", description: " fine " }, audit).item).toMatchObject({ name: "Sand", description: "fine", unit: "bag" })
  })

  it("preserves authorization, missing-definition and invalid-unit errors", () => {
    const catalog = fixture()
    expect(() => catalog.createItemDefinition({ name: "Drill", itemType: "ASSET" })).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "UNAUTHORIZED" }) }))
    const item = catalog.createItemDefinition({ name: "Drill", itemType: "ASSET" }, audit).item
    expect(() => catalog.updateItemDefinition({ id: item.id, name: "Denied" }, { actorUserId: "regular" })).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "UNAUTHORIZED" }) }))
    expect(() => catalog.updateItemDefinition({ id: item.id, itemType: "CONSUMABLE", unit: " " }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "VALIDATION" }) }))
    expect(() => catalog.getItemDefinition("missing")).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "NOT_FOUND" }) }))
  })

  it("pages the usage-filtered set and resets a cursor when search changes", () => {
    const catalog = fixture()
    for (const name of ["Alpha", "Beta", "Gamma"]) catalog.createItemDefinition({ name, itemType: "CONSUMABLE", unit: "kg" }, audit)
    catalog.createItemDefinition({ name: "Asset", itemType: "ASSET" }, audit)
    const usage = { surface: "INVOICE_LINE" as const, kind: "CONSUMABLE" as const }
    const first = catalog.listItemDefinitionOptions({ usage, limit: 1 })
    expect(first.items.map(item => item.name)).toEqual(["Alpha"])
    expect(first.total).toBe(3)
    expect(first.hasMore).toBe(true)
    const second = catalog.listItemDefinitionOptions({ usage, cursor: first.nextCursor!, limit: 1 })
    expect(second.items.map(item => item.name)).toEqual(["Beta"])
    const reset = catalog.listItemDefinitionOptions({ usage, cursor: first.nextCursor!, search: "Gamma", limit: 1 })
    expect(reset.items.map(item => item.name)).toEqual(["Gamma"])
    expect(reset.total).toBe(1)
    expect(reset.hasMore).toBe(false)
  })
})
