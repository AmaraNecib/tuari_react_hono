// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createEmptyEmployeeDraft } from "./employee-batch-schema"
import { EmployeeBatchRowCard } from "./employee-batch-row-card"

/**
 * The notes textarea on the batch card carries a bespoke class list (it does
 * not use the shared `formTextareaClassName`), so its dark-mode placeholder
 * override can drift from the shared control without any other test noticing.
 * This pins the token class, not a colour literal.
 */

const copy = {
  title: "عامل",
  firstNameLabel: "الاسم",
  lastNameLabel: "اللقب",
  phoneLabel: "الهاتف",
  roleLabel: "الصلاحية",
  occupationLabel: "المهنة",
  salaryAmountLabel: "الراتب",
  salaryPeriodLabel: "الدورة",
  salaryAmountPlaceholder: "0",
  salaryPeriodPlaceholder: "اختر",
  salaryPeriodOptions: [{ value: "MONTHLY" as const, label: "شهري" }],
  managerLabel: "المسؤول",
  managerPlaceholder: "بدون",
  managerDisabledHint: "غير متاح",
  projectLabel: "المشروع",
  projectPlaceholder: "بدون",
  projectDisabledHint: "غير متاح",
  notesLabel: "ملاحظات",
  firstNamePlaceholder: "الاسم",
  lastNamePlaceholder: "اللقب",
  phonePlaceholder: "الهاتف",
  rolePlaceholder: "اختر",
  occupationPlaceholder: "المهنة",
  notesPlaceholder: "ملاحظة",
  remove: "حذف",
}

afterEach(cleanup)

describe("EmployeeBatchRowCard dark-mode placeholder", () => {
  it("bumps the bespoke notes placeholder to the full-opacity muted token in dark mode", () => {
    render(
      <EmployeeBatchRowCard
        canRemove={false}
        copy={copy}
        draft={createEmptyEmployeeDraft()}
        errors={{}}
        index={0}
        managerOptions={[]}
        roles={[]}
        workerRoleId={null}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    const notes = screen.getByPlaceholderText("ملاحظة")
    expect(notes.className).toContain("placeholder:text-muted-foreground/80")
    expect(notes.className).toContain("dark:placeholder:text-muted-foreground")
  })
})
