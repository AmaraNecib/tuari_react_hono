// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { SystemLogEntry } from "@tuari/contracts";

import { SystemLogSection } from "./system-log-section";

/**
 * Regression test for issue #271: the system-log detail tokenizer
 * (parseDetailTokens / getDetailTokenClassName) matches server-emitted
 * Arabic detail lines using i18n.t("systemLog.*"). When those keys were
 * missing from ar.ts, i18n.t returned the raw key string ("systemLog.value")
 * and no server line ever matched — detail lines rendered as one plain
 * blob instead of structured chips.
 *
 * This test renders the real component against the REAL i18n resource
 * (no react-i18next mock), so a missing key would render the raw key and
 * fail the assertions below.
 */
function makeEntry(overrides: Partial<SystemLogEntry>): SystemLogEntry {
  return {
    id: "e1",
    transactionId: "tx-1",
    actorUserId: "u1",
    actorLabel: "أحمد",
    actorCurrentLabel: "أحمد",
    actionType: "DEBT_ENTRY_RECORDED",
    entityType: "DEBT_ENTRY",
    entityId: "d1",
    entityLabel: "سمير بوقرة",
    summary: "تم تسجيل رصيد افتتاحي للطرف سمير بوقرة",
    detail: null,
    createdAt: "2026-01-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("SystemLogSection detail tokenizer", () => {
  it("splits a server-shaped debt detail line into structured chips (no raw keys)", () => {
    const entries = [
      makeEntry({
        id: "e-debt",
        // Exact shape emitted by apps/api/src/modules/company/company.system-log.ts
        // buildDebtEntryDetail: "نوع الحركة X • القيمة Y • الرصيد بعد العملية Z"
        detail: "نوع الحركة رصيد افتتاحي • القيمة +1000 دج • الرصيد بعد العملية 1000 دج",
      }),
    ];

    render(
      <SystemLogSection
        entries={entries}
        filters={{}}
        title="السجل"
        onFiltersChange={vi.fn()}
      />,
    );

    // The two monetary chips split out of the bullet-joined line.
    expect(screen.getByText("القيمة +1000 دج")).toBeTruthy();
    expect(screen.getByText("الرصيد بعد العملية 1000 دج")).toBeTruthy();

    // No raw i18n key text may leak into the rendered detail cell.
    const table = screen.getByRole("table");
    expect(table.textContent).not.toContain("systemLog.");
  });

  it("renders the salary-payment detail line as a chip without raw keys", () => {
    const entries = [
      makeEntry({
        id: "e-salary",
        actionType: "SALARY_PAYMENT_RECORDED",
        entityType: "SALARY_PAYMENT",
        summary: "تم تسجيل دفعة راتب للعامل سمير",
        // buildDebtEntryDetail-style line the server emits for salary payments:
        // `المبلغ المدفوع ${amount} دج`
        detail: "المبلغ المدفوع 25000 دج",
      }),
    ];

    render(
      <SystemLogSection
        entries={entries}
        filters={{}}
        title="السجل"
        onFiltersChange={vi.fn()}
      />,
    );

    expect(screen.getByText("المبلغ المدفوع 25000 دج")).toBeTruthy();
    expect(screen.getByRole("table").textContent).not.toContain("systemLog.");
  });

  it("renders action/entity filter labels from real resources, never raw keys", () => {
    const entries = [makeEntry({})];

    render(
      <SystemLogSection
        entries={entries}
        filters={{}}
        title="السجل"
        onFiltersChange={vi.fn()}
      />,
    );

    // The action select exposes translated labels via getActionTypeLabel.
    const actionOption = screen.getByRole("option", { name: "تسجيل قيد دين" });
    expect(actionOption).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/systemLog\.|appShell\.|workspace\./);
  });
});
