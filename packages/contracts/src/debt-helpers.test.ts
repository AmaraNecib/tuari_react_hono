import { describe, expect, it } from "vitest";

import {
  DEBT_ACCOUNT_DIRECTION_REQUIRED_MESSAGE,
  DEBT_BALANCE_STATE_PHRASE,
  debtBalanceLabelSchema,
  getDebtAccountBalancePhrase,
  getDebtAccountBalanceState,
  getDebtAccountNetContribution,
  getDebtBalanceAmount,
  getNetDebtBalance,
  getNetDebtBalancePhrase,
  getNetDebtBalanceState,
  type DebtBalanceAccount,
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

    it("refuses an account with no ledger direction (no implicit PAYABLE)", () => {
      // The net contribution interprets the sign by the direction, so the same
      // no-silent-fallback rule as getDebtAccountBalanceState applies here.
      expect(() =>
        getDebtAccountNetContribution({ currentBalance: 100 } as unknown as DebtBalanceAccount),
      ).toThrowError(DEBT_ACCOUNT_DIRECTION_REQUIRED_MESSAGE);
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
 *
 * The split (issue #458) removes the optional-direction overload: the
 * account-aware half requires a direction, the net half is sign-only.
 */
describe("getDebtAccountBalanceState (direction + signed balance -> phrase state)", () => {
  it("maps a positive PAYABLE balance to owedByUs (we owe them, unpaid)", () => {
    expect(getDebtAccountBalanceState({ currentBalance: 600, direction: "PAYABLE" })).toBe("owedByUs");
  });

  it("maps a negative PAYABLE balance to creditWithUs (we paid them too much)", () => {
    expect(getDebtAccountBalanceState({ currentBalance: -50_000, direction: "PAYABLE" })).toBe("creditWithUs");
  });

  it("maps a positive RECEIVABLE balance to owedToUs (they owe us, unpaid)", () => {
    expect(getDebtAccountBalanceState({ currentBalance: 600, direction: "RECEIVABLE" })).toBe("owedToUs");
  });

  it("maps a negative RECEIVABLE balance to creditWithThem (they paid us too much)", () => {
    expect(getDebtAccountBalanceState({ currentBalance: -600, direction: "RECEIVABLE" })).toBe("creditWithThem");
  });

  it("maps zero to settled for every direction", () => {
    expect(getDebtAccountBalanceState({ currentBalance: 0, direction: "PAYABLE" })).toBe("settled");
    expect(getDebtAccountBalanceState({ currentBalance: 0, direction: "RECEIVABLE" })).toBe("settled");
  });

  it("refuses a direction-less figure instead of falling back to the sign (removed overload)", () => {
    // Before #458 the overload silently returned "owedToUs" here. The
    // direction-aware half must never phrase a figure that has no direction.
    expect(() =>
      getDebtAccountBalanceState({ currentBalance: 600 } as unknown as DebtBalanceAccount),
    ).toThrowError(DEBT_ACCOUNT_DIRECTION_REQUIRED_MESSAGE);
  });

  it("refuses a null direction too", () => {
    expect(() =>
      getDebtAccountBalanceState({ currentBalance: 600, direction: null } as unknown as DebtBalanceAccount),
    ).toThrowError(DEBT_ACCOUNT_DIRECTION_REQUIRED_MESSAGE);
  });
});

describe("getNetDebtBalanceState (sign-only net figure -> phrase state)", () => {
  it("maps a positive net to owedToUs", () => {
    expect(getNetDebtBalanceState(2500)).toBe("owedToUs");
  });

  it("maps a negative net to owedByUs", () => {
    expect(getNetDebtBalanceState(-1500)).toBe("owedByUs");
  });

  it("maps zero to settled", () => {
    expect(getNetDebtBalanceState(0)).toBe("settled");
  });
});

describe("getDebtBalanceAmount", () => {
  it("returns the magnitude so a signed balance is never rendered negative", () => {
    expect(getDebtBalanceAmount(-50_000)).toBe(50_000);
    expect(getDebtBalanceAmount(50_000)).toBe(50_000);
    expect(getDebtBalanceAmount(0)).toBe(0);
  });
});

describe("getDebtAccountBalancePhrase", () => {
  it("uses the authoritative Arabic phrase for each of the five states", () => {
    expect(getDebtAccountBalancePhrase({ currentBalance: 600, direction: "PAYABLE" })).toBe("مستحق علينا");
    expect(getDebtAccountBalancePhrase({ currentBalance: 600, direction: "RECEIVABLE" })).toBe("مستحق لنا");
    expect(getDebtAccountBalancePhrase({ currentBalance: -600, direction: "PAYABLE" })).toBe("رصيد مستحق لنا");
    expect(getDebtAccountBalancePhrase({ currentBalance: -600, direction: "RECEIVABLE" })).toBe("رصيد مستحق لهم");
    expect(getDebtAccountBalancePhrase({ currentBalance: 0, direction: "PAYABLE" })).toBe("مسوّى");
  });
});

describe("getNetDebtBalancePhrase", () => {
  it("phrases a net by sign without a direction", () => {
    expect(getNetDebtBalancePhrase(600)).toBe("مستحق لنا");
    expect(getNetDebtBalancePhrase(-600)).toBe("مستحق علينا");
    expect(getNetDebtBalancePhrase(0)).toBe("مسوّى");
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
