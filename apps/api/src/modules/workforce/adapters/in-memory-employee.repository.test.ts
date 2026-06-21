import { describe, it, expect, beforeEach } from "vitest"

import { InMemoryEmployeeRepository } from "./in-memory-employee.repository"
import { InMemoryRoleRepository } from "./in-memory-role.repository"

/**
 * Tests for the InMemoryEmployeeRepository's paginated query.
 *
 * The repository's paginated query must:
 * - Return the first N items sorted by createdAt DESC, id DESC
 * - Support cursor-based pagination (no skipping)
 * - Apply filters before pagination
 * - Return total count
 * - Return a nextCursor only when more items exist
 */
describe("InMemoryEmployeeRepository.findPaged", () => {
  let repository: InMemoryEmployeeRepository

  beforeEach(() => {
    repository = new InMemoryEmployeeRepository()
  })

  // Use a fixed timestamp base to make ordering deterministic.
  const baseTime = new Date("2024-01-01T00:00:00.000Z").getTime()

  function buildEmployee(id: string, createdAtMs: number) {
    return {
      id,
      firstName: "First",
      lastName: "Last",
      phone: `0555${id.padStart(6, "0")}`,
      roleId: "role-worker",
      status: "ACTIVE" as const,
      salaryAmountDzd: null,
      salaryPeriod: null,
      notes: null,
      createdAt: new Date(createdAtMs).toISOString(),
      updatedAt: new Date(createdAtMs).toISOString(),
    }
  }

  describe("empty repository", () => {
    it("returns empty items and total 0", async () => {
      const result = await repository.findPaged({ limit: 10 })

      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
      expect(result.nextCursor).toBeNull()
    })
  })

  describe("single page (fewer items than limit)", () => {
    beforeEach(async () => {
      await repository.save(buildEmployee("a", baseTime + 1000))
      await repository.save(buildEmployee("b", baseTime + 2000))
      await repository.save(buildEmployee("c", baseTime + 3000))
    })

    it("returns all items when limit is large enough", async () => {
      const result = await repository.findPaged({ limit: 10 })

      expect(result.items.map((r) => r.id)).toEqual(["c", "b", "a"])
      expect(result.total).toBe(3)
      expect(result.nextCursor).toBeNull()
    })

    it("returns items sorted by createdAt DESC", async () => {
      const result = await repository.findPaged({ limit: 2 })

      expect(result.items.map((r) => r.id)).toEqual(["c", "b"])
      expect(result.total).toBe(3)
    })
  })

  describe("multiple pages", () => {
    beforeEach(async () => {
      // 5 employees with strictly increasing createdAt
      await repository.save(buildEmployee("a", baseTime + 1000))
      await repository.save(buildEmployee("b", baseTime + 2000))
      await repository.save(buildEmployee("c", baseTime + 3000))
      await repository.save(buildEmployee("d", baseTime + 4000))
      await repository.save(buildEmployee("e", baseTime + 5000))
    })

    it("returns the first page when no cursor", async () => {
      const result = await repository.findPaged({ limit: 2 })

      expect(result.items.map((r) => r.id)).toEqual(["e", "d"])
      expect(result.total).toBe(5)
      expect(result.nextCursor).not.toBeNull()
    })

    it("returns the second page when cursor is given", async () => {
      const first = await repository.findPaged({ limit: 2 })

      const second = await repository.findPaged({ limit: 2, cursor: first.nextCursor! })

      expect(second.items.map((r) => r.id)).toEqual(["c", "b"])
      expect(second.total).toBe(5)
      expect(second.nextCursor).not.toBeNull()
    })

    it("returns the last page with nextCursor null", async () => {
      const first = await repository.findPaged({ limit: 2 })
      const second = await repository.findPaged({ limit: 2, cursor: first.nextCursor! })

      const third = await repository.findPaged({ limit: 2, cursor: second.nextCursor! })

      expect(third.items.map((r) => r.id)).toEqual(["a"])
      expect(third.total).toBe(5)
      expect(third.nextCursor).toBeNull()
    })

    it("walks all pages and returns each item exactly once", async () => {
      const seen: string[] = []
      let cursor: string | null = null
      let pages = 0
      do {
        const result = await repository.findPaged({ limit: 2, cursor: cursor ?? undefined })
        seen.push(...result.items.map((r) => r.id))
        cursor = result.nextCursor
        pages++
      } while (cursor !== null)

      expect(seen).toEqual(["e", "d", "c", "b", "a"])
      expect(pages).toBe(3)
    })
  })

  describe("filters applied before pagination", () => {
    beforeEach(async () => {
      // Need a second role for the filter test.
      const roleRepo = new InMemoryRoleRepository()
      roleRepo.seed({
        id: "role-manager",
        key: "manager",
        name: "Manager",
        description: null,
        isSystem: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      await repository.save({ ...buildEmployee("a", baseTime + 1000), roleId: "role-worker" })
      await repository.save({ ...buildEmployee("b", baseTime + 2000), roleId: "role-manager" })
      await repository.save({ ...buildEmployee("c", baseTime + 3000), roleId: "role-worker" })
      await repository.save({ ...buildEmployee("d", baseTime + 4000), roleId: "role-manager" })
    })

    it("filters by status", async () => {
      await repository.save({ ...buildEmployee("e", baseTime + 5000), status: "INACTIVE" })

      const result = await repository.findPaged({
        limit: 10,
        filters: { status: "ACTIVE" },
      })

      expect(result.items.map((r) => r.id)).toEqual(["d", "c", "b", "a"])
      expect(result.total).toBe(4)
    })

    it("filters by roleId", async () => {
      const result = await repository.findPaged({
        limit: 10,
        filters: { roleId: "role-manager" },
      })

      expect(result.items.map((r) => r.id)).toEqual(["d", "b"])
      expect(result.total).toBe(2)
    })

    it("paginates filtered results", async () => {
      const result = await repository.findPaged({
        limit: 1,
        filters: { roleId: "role-manager" },
      })

      expect(result.items.map((r) => r.id)).toEqual(["d"])
      expect(result.total).toBe(2)
      expect(result.nextCursor).not.toBeNull()

      const second = await repository.findPaged({
        limit: 1,
        filters: { roleId: "role-manager" },
        cursor: result.nextCursor!,
      })

      expect(second.items.map((r) => r.id)).toEqual(["b"])
      expect(second.total).toBe(2)
      expect(second.nextCursor).toBeNull()
    })
  })

  describe("tie-breaking on identical createdAt", () => {
    beforeEach(async () => {
      // Same timestamp for both — must order by id for stability.
      await repository.save(buildEmployee("b", baseTime + 1000))
      await repository.save(buildEmployee("a", baseTime + 1000))
      await repository.save(buildEmployee("c", baseTime + 1000))
    })

    it("orders ties by id DESC for stable pagination", async () => {
      const result = await repository.findPaged({ limit: 2 })

      // All three share the same createdAt; tie-broken by id DESC.
      expect(result.items.map((r) => r.id)).toEqual(["c", "b"])
    })
  })
})
