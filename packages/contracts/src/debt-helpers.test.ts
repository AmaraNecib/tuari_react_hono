import { describe, expect, it } from "vitest";

import { getDebtAccountNetContribution, getNetDebtBalance } from "./debt-helpers";

/**
 * Locks the debt sign convention (issue #22, single source since #277):
 *   - PAYABLE: +balance means "we owe them" → contributes negatively to net
 *   - RECEIVABLE: +balance means "they owe us" → contributes positively to net
 * A flipped sign here is a silent accounting bug — both the API finance
 * service and the web debt UI must agree on this exact mapping.
 */
describe("debt sign convention (PAYABLE-negates)", () => {
  describe("getDebtAccountNetContribution", () => {
    it("keeps RECEIVABLE balances positive", () => {
      expect(getDebtAccountNetContribution({ currentBalance: 100, direction: "RECEIVABLE" })).toBe(100);
    });

    it("negates PAYABLE balances", () => {
      expect(getDebtAccountNetContribution({ currentBalance: 100, direction: "PAYABLE" })).toBe(-100);
    });

    it("zero is zero regardless of direction", () => {
      expect(getDebtAccountNetContribution({ currentBalance: 0, direction: "PAYABLE" })).toBe(0);
      expect(getDebtAccountNetContribution({ currentBalance: 0, direction: "RECEIVABLE" })).toBe(0);
    });
  });

  describe("getNetDebtBalance", () => {
    it("returns 0 for an empty account list", () => {
      expect(getNetDebtBalance([])).toBe(0);
    });

    it("returns the PAYABLE balance negated when only PAYABLE accounts exist", () => {
      // +2000 PAYABLE = we owe them = net -2000.
      expect(getNetDebtBalance([{ currentBalance: 2000, direction: "PAYABLE" }])).toBe(-2000);
    });

    it("returns the RECEIVABLE balance when only RECEIVABLE accounts exist", () => {
      expect(getNetDebtBalance([{ currentBalance: 500, direction: "RECEIVABLE" }])).toBe(500);
    });

    it("subtracts PAYABLE and adds RECEIVABLE so they cancel out (canonical example)", () => {
      // Counterparty: we owe them 2000 (PAYABLE +2000) and they owe us 500
      // (RECEIVABLE +500). Net = 500 - 2000 = -1500 (we still owe them 1500).
      expect(
        getNetDebtBalance([
          { currentBalance: 2000, direction: "PAYABLE" },
          { currentBalance: 500, direction: "RECEIVABLE" },
        ]),
      ).toBe(-1500);
    });

    it("returns a positive net when RECEIVABLE outweighs PAYABLE", () => {
      // They owe us 3000 and we owe them 500. Net = +2500 (they owe us).
      expect(
        getNetDebtBalance([
          { currentBalance: 500, direction: "PAYABLE" },
          { currentBalance: 3000, direction: "RECEIVABLE" },
        ]),
      ).toBe(2500);
    });

    it("returns 0 when a party's accounts fully offset", () => {
      expect(
        getNetDebtBalance([
          { currentBalance: 1000, direction: "PAYABLE" },
          { currentBalance: 1000, direction: "RECEIVABLE" },
        ]),
      ).toBe(0);
    });
  });
});
