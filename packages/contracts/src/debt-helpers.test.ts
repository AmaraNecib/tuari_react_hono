import { describe, expect, it } from "vitest";

import {
  DEBT_BALANCE_STATE_PHRASE,
  debtBalanceLabelSchema,
  getDebtAccountNetContribution,
  getDebtBalanceAmount,
  getDebtBalancePhrase,
  getDebtBalanceState,
  getNetDebtBalance,
} from "./debt-helpers";

/**
 * Locks the debt sign convention (issue #22, single source since #277):
 *   - PAYABLE: +balance means "we owe them" → contributes negatively to net
 *   - RECEIVABLE: +balance means "they owe us" → contributes positively to net
 * The flip is total — a NEGATIVE balance (an overpayment) inverts the
 * meaning: -300 PAYABLE means the supplier owes us (contribution +300),
 * and -200 RECEIVABLE means we owe the customer (contribution -200).
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

    it("flips a negative PAYABLE balance to a positive contribution (overpaid supplier now owes us)", () => {
      // Overpayment inverts the meaning: -300 PAYABLE means we already paid
      // the supplier 300 more than we owed, so the contribution to the net
      // is +300 — the sign flip must run for negative balances too.
      expect(getDebtAccountNetContribution({ currentBalance: -300, direction: "PAYABLE" })).toBe(300);
    });

    it("keeps a negative RECEIVABLE balance negative (customer overpaid us)", () => {
      // Overpayment inverts the meaning: -200 RECEIVABLE means the customer
      // paid us 200 more than they owed, so we owe them — contribution -200.
      expect(getDebtAccountNetContribution({ currentBalance: -200, direction: "RECEIVABLE" })).toBe(-200);
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

    it("nets a negative PAYABLE balance to positive when only PAYABLE accounts exist", () => {
      // -300 PAYABLE = we overpaid the supplier = net +300 (they owe us).
      expect(getNetDebtBalance([{ currentBalance: -300, direction: "PAYABLE" }])).toBe(300);
    });

    it("nets a negative RECEIVABLE balance to negative when only RECEIVABLE accounts exist", () => {
      // -200 RECEIVABLE = the customer overpaid us = net -200 (we owe them).
      expect(getNetDebtBalance([{ currentBalance: -200, direction: "RECEIVABLE" }])).toBe(-200);
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

    it("adds an overpaid PAYABLE to a positive RECEIVABLE (both sides they owe us)", () => {
      // Supplier overpayment -300 (→ +300) plus RECEIVABLE +500 → net +800.
      expect(
        getNetDebtBalance([
          { currentBalance: -300, direction: "PAYABLE" },
          { currentBalance: 500, direction: "RECEIVABLE" },
        ]),
      ).toBe(800);
    });

    it("adds an overpaid RECEIVABLE to a positive PAYABLE (both sides we owe them)", () => {
      // Customer overpayment -400 (→ -400) plus PAYABLE +1000 → net -1400.
      expect(
        getNetDebtBalance([
          { currentBalance: 1000, direction: "PAYABLE" },
          { currentBalance: -400, direction: "RECEIVABLE" },
        ]),
      ).toBe(-1400);
    });

    it("nets overpaid PAYABLE and overpaid RECEIVABLE to their signed total", () => {
      // Supplier overpayment -200 (→ +200) minus customer overpayment -500
      // (→ -500) → net -300 (we still owe them 300 on balance).
      expect(
        getNetDebtBalance([
          { currentBalance: -200, direction: "PAYABLE" },
          { currentBalance: -500, direction: "RECEIVABLE" },
        ]),
      ).toBe(-300);
    });
  });
});

/**
 * The display state machine is the single source of the new debt wording:
 * a signed balance never reaches the UI alone, it is always paired with the
 * phrase that states the direction (issue: unambiguous debt terminology).
 */
describe("getDebtBalanceState (direction + signed balance -> phrase state)", () => {
  it("maps a positive PAYABLE balance to owedByUs (we owe them, unpaid)", () => {
    expect(getDebtBalanceState({ currentBalance: 600, direction: "PAYABLE" })).toBe("owedByUs");
  });

  it("maps a negative PAYABLE balance to creditWithUs (we paid them too much)", () => {
    expect(getDebtBalanceState({ currentBalance: -50_000, direction: "PAYABLE" })).toBe("creditWithUs");
  });

  it("maps a positive RECEIVABLE balance to owedToUs (they owe us, unpaid)", () => {
    expect(getDebtBalanceState({ currentBalance: 600, direction: "RECEIVABLE" })).toBe("owedToUs");
  });

  it("maps a negative RECEIVABLE balance to creditWithThem (they paid us too much)", () => {
    expect(getDebtBalanceState({ currentBalance: -600, direction: "RECEIVABLE" })).toBe("creditWithThem");
  });

  it("maps zero to settled for every direction", () => {
    expect(getDebtBalanceState({ currentBalance: 0, direction: "PAYABLE" })).toBe("settled");
    expect(getDebtBalanceState({ currentBalance: 0, direction: "RECEIVABLE" })).toBe("settled");
    expect(getDebtBalanceState({ currentBalance: 0 })).toBe("settled");
  });

  it("maps a direction-less net figure by sign", () => {
    expect(getDebtBalanceState({ currentBalance: 2500 })).toBe("owedToUs");
    expect(getDebtBalanceState({ currentBalance: -1500 })).toBe("owedByUs");
  });
});

describe("getDebtBalanceAmount", () => {
  it("returns the magnitude so a signed balance is never rendered negative", () => {
    expect(getDebtBalanceAmount(-50_000)).toBe(50_000);
    expect(getDebtBalanceAmount(50_000)).toBe(50_000);
    expect(getDebtBalanceAmount(0)).toBe(0);
  });
});

describe("getDebtBalancePhrase", () => {
  it("uses the authoritative Arabic phrase for each of the five states", () => {
    expect(getDebtBalancePhrase({ currentBalance: 600, direction: "PAYABLE" })).toBe("مستحق علينا");
    expect(getDebtBalancePhrase({ currentBalance: 600, direction: "RECEIVABLE" })).toBe("مستحق لنا");
    expect(getDebtBalancePhrase({ currentBalance: -600, direction: "PAYABLE" })).toBe("رصيد مستحق لنا");
    expect(getDebtBalancePhrase({ currentBalance: -600, direction: "RECEIVABLE" })).toBe("رصيد مستحق لهم");
    expect(getDebtBalancePhrase({ currentBalance: 0, direction: "PAYABLE" })).toBe("مسوّى");
  });
});

describe("debtBalanceLabelSchema", () => {
  it("accepts exactly the five phrases and rejects the retired labels", () => {
    for (const phrase of Object.values(DEBT_BALANCE_STATE_PHRASE)) {
      expect(debtBalanceLabelSchema.safeParse(phrase).success).toBe(true);
    }
    expect(debtBalanceLabelSchema.safeParse("لنا عنده").success).toBe(false);
    expect(debtBalanceLabelSchema.safeParse("علينا له").success).toBe(false);
    expect(debtBalanceLabelSchema.safeParse("مغلق").success).toBe(false);
  });
});
