// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createEmptyEmployeeDraft } from "./employee-batch-schema"
import { EmployeeBatchRowCard } from "./employee-batch-row-card"

/**
 * The notes textarea on the batch card carries a bespoke class list (it does
 * not use the shared `formTextareaClassName`), so its dark-mode placeholder
 * override can drift from the shared control without any other test noticing.
 * The card reuses `placeholderContrastClassName` and this pins the rendered
 * token classes, not a colour literal.
 */

const copy = {
  title: "عامل",
  firstNameLabel: "الاسم",
  lastNameLabel: "اللقب",
  phoneLabel: "الهاتف",
  roleLabel: "الصلاحية",
  occupationLabel: "المهنة",
  salaryReferenceAmountLabel: "الراتب المرجعي",
  salaryReferencePeriodLabel: "الدورة",
  salaryReferenceAmountPlaceholder: "0",
  salaryReferencePeriodPlaceholder: "اختر",
  salaryReferencePeriodOptions: [{ value: "MONTHLY" as const, label: "شهري" }],
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

describe("EmployeeBatchRowCard selectors", () => {
  it("exposes labeled native selectors and associates manager/project hints per row", () => {
    render(
      <>
        {[0, 1].map((index) => (
          <EmployeeBatchRowCard
            key={index}
            canRemove={false}
            copy={copy}
            draft={createEmptyEmployeeDraft("worker-role")}
            errors={{}}
            index={index}
            managerOptions={[{ id: "manager-1", label: "مدير", projectOptions: [{ id: "project-1", label: "مشروع" }] }]}
            roles={[{ id: "worker-role", key: "worker", name: "عامل" } as never]}
            workerRoleId="worker-role"
            onChange={vi.fn()}
            onRemove={vi.fn()}
          />
        ))}
      </>,
    )

    for (const index of [0, 1]) {
      const row = within(screen.getAllByRole("article")[index]!)
      expect(row.getByRole("combobox", { name: "الصلاحية" })).toBeTruthy()
      const manager = row.getByLabelText("المسؤول")
      const project = row.getByLabelText("المشروع")
      expect(manager.getAttribute("aria-describedby")).toContain(`employee-manager-hint-${index}`)
      expect(project.getAttribute("aria-describedby")).toContain(`employee-project-hint-${index}`)
    }
  })
})

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
    const tokens = (notes.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)
    expect(tokens).toContain("placeholder:text-muted-foreground/80")
    expect(tokens).toContain("dark:placeholder:text-muted-foreground")
    expect(tokens).not.toContain("dark:placeholder:text-muted-foreground/80")
  })
})
