import { describe, it, expect } from "vitest";
import { Paginator } from "./pagination";

describe("Paginator", () => {
  describe("normalize", () => {
    it("applies defaults", () => {
      const result = Paginator.normalize();
      expect(result.limit).toBe(Paginator.DEFAULT_LIMIT);
      expect(result.offset).toBe(0);
    });

    it("enforces maximum limit", () => {
      const result = Paginator.normalize({ limit: 1000 });
      expect(result.limit).toBe(Paginator.MAX_LIMIT);
    });

    it("enforces minimum limit of 1", () => {
      const result = Paginator.normalize({ limit: 0 });
      expect(result.limit).toBe(1);
    });

    it("enforces non-negative offset", () => {
      const result = Paginator.normalize({ offset: -10 });
      expect(result.offset).toBe(0);
    });
  });

  describe("paginate", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));

    it("returns correct page of items", () => {
      const result = Paginator.paginate(items, { limit: 10, offset: 0 });
      expect(result.items).toHaveLength(10);
      expect(result.items[0]?.id).toBe(1);
      expect(result.items[9]?.id).toBe(10);
    });

    it("calculates total correctly", () => {
      const result = Paginator.paginate(items, { limit: 10, offset: 0 });
      expect(result.total).toBe(100);
    });

    it("indicates if more items available", () => {
      const result1 = Paginator.paginate(items, { limit: 10, offset: 0 });
      expect(result1.hasMore).toBe(true);

      const result2 = Paginator.paginate(items, { limit: 10, offset: 95 });
      expect(result2.hasMore).toBe(false);
    });

    it("handles offset beyond total", () => {
      const result = Paginator.paginate(items, { limit: 10, offset: 200 });
      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });
});
