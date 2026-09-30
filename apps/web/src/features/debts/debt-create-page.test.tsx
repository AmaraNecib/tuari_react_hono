// @vitest-environment jsdom

import "@/i18n"

import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DebtCreatePage } from "./debt-create-page"

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router")

  return {
    ...actual,
    Link: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => <a {...props}>{children}</a>,
  }
})

vi.mock("@/features/app-shell/mock-dashboard", () => ({
  useCreateDebtAccountMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateExternalCounterpartyMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

const navigation = {
  goToDebtCreate: vi.fn(),
  goToEmployeeDebts: vi.fn(),
  goToExternalDetails: vi.fn(),
} as never

const employees = [{ id: "emp-1", name: "علي بن حميد", phone: "0555200120", roleKey: "worker" }]

const externalCounterparties = [
  {
    id: "ext-1",
    fullName: "شركة المورد",
    phoneNumber: "0555000000",
    note: null,
    createdAt: "2026-03-27T10:00:00.000Z",
    updatedAt: "2026-03-27T10:00:00.000Z",
  },
] as never

function renderPage(preselectedPartyType?: string) {
  return render(
    <DebtCreatePage
      employees={employees}
      externalCounterparties={externalCounterparties}
      navigation={navigation}
      preselectedPartyType={preselectedPartyType}
    />,
  )
}

async function openPartySelect() {
  fireEvent.mouseDown(screen.getByRole("combobox"))
  return screen.findByRole("listbox")
}

afterEach(() => {
  cleanup()
})

describe("DebtCreatePage — party inline create", () => {
  it("does not offer an internal-worker create: the API rejects an ACTIVE worker with no project/manager", async () => {
    renderPage()

    const listbox = await openPartySelect()

    expect(within(listbox).queryByRole("option", { name: /إضافة موظف/ })).toBeNull()
    expect(within(listbox).getByRole("option", { name: /علي بن حميد/ })).toBeTruthy()
  })

  it("still offers the external-counterparty create", async () => {
    renderPage("EXTERNAL_COUNTERPARTY")

    const listbox = await openPartySelect()

    expect(within(listbox).getByRole("option", { name: /إضافة طرف خارجي/ })).toBeTruthy()
  })
})
