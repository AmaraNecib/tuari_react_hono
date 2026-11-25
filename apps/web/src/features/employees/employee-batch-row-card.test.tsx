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
    const { rerender } = render(
      <>
        {[0, 1].map((index) => (
          <EmployeeBatchRowCard
            key={index}
            canRemove={false}
            copy={copy}
            draft={createEmptyEmployeeDraft("worker-role")}
            errors={index === 0
              ? { roleId: "اختر صلاحية", managerId: "اختر مسؤولاً", projectId: "اختر مشروعاً" }
              : { roleId: "صلاحية غير صالحة", managerId: "مسؤول غير صالح", projectId: "مشروع غير صالح" }}
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
      const role = row.getByRole("combobox", { name: /الصلاحية/ })
      const manager = row.getByLabelText("المسؤول")
      const project = row.getByLabelText("المشروع")
      for (const [control, prefix, error] of [
        [role, "employee-role", index === 0 ? "اختر صلاحية" : "صلاحية غير صالحة"],
        [manager, "employee-manager", index === 0 ? "اختر مسؤولاً" : "مسؤول غير صالح"],
        [project, "employee-project", index === 0 ? "اختر مشروعاً" : "مشروع غير صالح"],
      ] as const) {
        expect(control.getAttribute("aria-invalid")).toBe("true")
        const ids = control.getAttribute("aria-describedby")!.split(" ")
        if (prefix === "employee-role") {
          expect(ids).toEqual([`${prefix}-error-${index}`])
        } else {
          expect(ids).toContain(`${prefix}-hint-${index}`)
          expect(ids).toContain(`${prefix}-error-${index}`)
        }
        const targets = ids.map((id) => row.getByText((_, element) => element?.id === id))
        expect(targets.map((target) => target.textContent?.trim())).toContain(error)
      }
    }

    rerender(
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
      for (const control of [row.getByRole("combobox", { name: "الصلاحية" }), row.getByLabelText("المسؤول"), row.getByLabelText("المشروع")]) {
        expect(control.getAttribute("aria-invalid")).toBe("false")
      }
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
