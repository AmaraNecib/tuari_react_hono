import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./helpers/db-isolation"
import {
  seedEmployeeByRole,
  seedProjectWithManager,
  seedWarehouse,
} from "./helpers/db-seed"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.describe.configure({ mode: "serial" })

const seeded = {
  pmId: "",
  projectWorkerId: "",
  warehouseWorkerId: "",
  unplacedWorkerId: "",
  projectId: "",
  warehouseId: "",
  projectWorkerName: "",
  warehouseWorkerName: "",
  projectName: "",
  warehouseName: "",
}

test.beforeAll(() => {
  resetE2eDatabase()

  const suffix = uniqueSuffix()
  // A valid 10-digit Algerian phone (0[5-7] + 8 digits), unique per attempt.
  // uniqueSuffix is base36 so it must NOT be used directly as a phone — the
  // employee output schema validates the phone and would reject letters.
  const digits = `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 1000)}`
  seeded.projectName = `مشروع البناء ${suffix}`
  seeded.warehouseName = `المستودع ${suffix}`
  seeded.projectWorkerName = `عامل الموقع ${suffix}`
  seeded.warehouseWorkerName = `عامل المخزن ${suffix}`

  // Employee creation via the UI is still role-constrained, so workers and the
  // project manager are seeded directly (established pattern, db-seed). Seeding
  // in beforeAll so the sign-in snapshot already contains them.
  seeded.pmId = seedEmployeeByRole({
    firstName: "مدير",
    lastName: `المشروع ${suffix}`,
    phone: `053${digits.slice(0, 7)}`,
    roleKey: "project_manager",
    status: "ACTIVE",
  })
  seeded.projectWorkerId = seedEmployeeByRole({
    firstName: "عامل",
    lastName: `الموقع ${suffix}`,
    phone: `054${digits.slice(0, 7)}`,
    roleKey: "worker",
    status: "ACTIVE",
  })
  seeded.warehouseWorkerId = seedEmployeeByRole({
    firstName: "عامل",
    lastName: `المخزن ${suffix}`,
    phone: `055${digits.slice(0, 7)}`,
    roleKey: "worker",
    status: "ACTIVE",
  })
  seeded.unplacedWorkerId = seedEmployeeByRole({
    firstName: "عامل",
    lastName: `بدون ربط ${suffix}`,
    phone: `056${digits.slice(0, 7)}`,
    roleKey: "worker",
    status: "ACTIVE",
  })
  seeded.projectId = seedProjectWithManager({
    name: seeded.projectName,
    managerId: seeded.pmId,
  })
  seeded.warehouseId = seedWarehouse({ name: seeded.warehouseName })
})

test.describe("workforce assignment (issue #20)", () => {
  test("admin assigns a worker to a project and a worker to a warehouse and sees the results", async ({
    page,
  }) => {
    await bootstrapOrSignIn(page)

    // ── Assign worker #1 to a PROJECT from the worker's edit page ───────────
    await page.goto(`/employees/${seeded.projectWorkerId}/edit`)
    await expect(page.getByRole("heading", { name: /تعديل عامل/ }).first()).toBeVisible()

    await page.getByLabel("مكان العمل").selectOption({ label: "مشروع" })
    await page.getByLabel("المدير المباشر").selectOption(seeded.pmId)
    await page.getByLabel("المشروع الحالي").selectOption(seeded.projectId)
    await page.getByRole("button", { name: "حفظ كل التغييرات" }).click()

    // Save navigates back to the worker's details page; work-history shows the
    // project assignment.
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 10_000 })
    await page.getByRole("tab", { name: "سجل العمل" }).click()
    await expect(page.getByText(seeded.projectName)).toBeVisible({ timeout: 10_000 })

    // The project "العمال المرتبطون" tab lists the worker.
    await page.goto(`/projects/${seeded.projectId}`)
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 10_000 })
    await page.getByRole("tab", { name: "العمال المرتبطون" }).click()
    await expect(page.getByText(seeded.projectWorkerName)).toBeVisible({ timeout: 10_000 })

    // ── Assign worker #2 to a WAREHOUSE from the worker's edit page ─────────
    await page.goto(`/employees/${seeded.warehouseWorkerId}/edit`)
    await expect(page.getByRole("heading", { name: /تعديل عامل/ }).first()).toBeVisible()

    await page.getByLabel("مكان العمل").selectOption({ label: "مستودع" })
    await page.getByLabel("المستودع").selectOption(seeded.warehouseId)
    await page.getByRole("button", { name: "حفظ كل التغييرات" }).click()
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 10_000 })

    // The warehouse worker's work-history also shows the warehouse assignment.
    await page.getByRole("tab", { name: "سجل العمل" }).click()
    await expect(page.getByText(seeded.warehouseName)).toBeVisible({ timeout: 10_000 })

    // The warehouse Team tab lists the worker.
    await page.goto(`/warehouses/${seeded.warehouseId}`)
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 10_000 })
    await page.getByRole("tab", { name: "الفريق" }).click()
    await expect(page.getByText(seeded.warehouseWorkerName)).toBeVisible({ timeout: 10_000 })

    // The dashboard active-worker counter reflects the seeded ACTIVE
    // worker-role employees (non-zero, not stuck at 0 per issue #20). All
    // three seeded workers — project, warehouse, and the unplaced validation
    // worker — are role `worker` with status ACTIVE, so the counter is 3.
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible()
    await expect(
      page.getByText("العمال النشطون", { exact: true }).locator("..").getByText("3", { exact: true }),
    ).toBeVisible()
  })

  test("an ACTIVE worker with no workplace placement is rejected on save", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.goto(`/employees/${seeded.unplacedWorkerId}/edit`)
    await expect(page.getByRole("heading", { name: /تعديل عامل/ }).first()).toBeVisible()

    // Leave the workplace type on its default NONE (بدون مكان عمل) and save:
    // an ACTIVE worker must have a placement, so this is rejected inline.
    await page.getByRole("button", { name: "حفظ كل التغييرات" }).click()
    await expect(
      page.getByText("اختر مكان عمل للعامل النشط (مشروع أو مستودع)."),
    ).toBeVisible()
    // Still on the edit page (no navigation), no assignment created.
    await expect(page.getByRole("heading", { name: /تعديل عامل/ }).first()).toBeVisible()
  })
})
