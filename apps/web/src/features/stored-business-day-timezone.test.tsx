// @vitest-environment jsdom

import "@/i18n"

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import { formatDateLabel } from "@/features/app-shell/home-view-derived-formatters"
import { InventoryInvoicesPage } from "@/features/inventory/inventory-invoices-page"
import { LocationTransferHistory } from "@/features/inventory/location-transfer-history"
import { OutboundTransfersPage } from "@/features/inventory/outbound-transfers-page"
import { TransferHistoryPage } from "@/features/inventory/transfer-history-page"
import { formatAlgeriaDate } from "@/lib/algeria-time"
import {
  ALGERIA_DAY,
  ALGERIA_DAY_SHORT,
  UTC_DAY,
  UTC_DAY_SHORT,
  pinUtcTimeZone,
} from "@/test-utils/algeria-day"

vi.mock("@tanstack/react-router", async (importActual) => {
  const actual = await importActual<typeof import("@tanstack/react-router")>()
  return {
    ...actual,
    Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
  }
})

const MIDNIGHT_CROSSING = "2026-09-30T23:00:00.000Z" // 2026-10-01T00:00 in Africa/Algiers

const transferItem = {
  id: "transfer-00000001",
  date: MIDNIGHT_CROSSING,
  type: "SALE" as const,
  from: { type: "WAREHOUSE" as const, id: "warehouse-1", name: "مستودع" },
  to: { type: "PROJECT" as const, id: "project-1", name: "مشروع" },
  counterparty: null,
  items: [{ id: "line-1", name: "سلعة", quantity: 2, type: "CONSUMABLE" as const }],
  totalAmount: 1200,
  status: "COMPLETED" as const,
}

const { transferHistoryQuery, locationTransferHistoryQuery, outboundTransfersQuery, invoiceGroupsQuery } =
  vi.hoisted(() => ({
    transferHistoryQuery: vi.fn(),
    locationTransferHistoryQuery: vi.fn(),
    outboundTransfersQuery: vi.fn(),
    invoiceGroupsQuery: vi.fn(),
  }))

vi.mock("@/features/inventory/transfer-history-hooks", () => ({
  useTransferHistoryQuery: () => transferHistoryQuery(),
  useLocationTransferHistoryQuery: () => locationTransferHistoryQuery(),
}))

vi.mock("@/features/inventory/inventory-hooks", () => ({
  useOutboundTransfersQuery: () => outboundTransfersQuery(),
  useInventoryInvoiceGroupsQuery: () => invoiceGroupsQuery(),
}))

let restoreTimeZone: () => void

beforeEach(() => {
  restoreTimeZone = pinUtcTimeZone()
  transferHistoryQuery.mockReturnValue({ data: { items: [transferItem] }, isLoading: false })
  locationTransferHistoryQuery.mockReturnValue({ data: { items: [transferItem] }, isLoading: false })
  outboundTransfersQuery.mockReturnValue({
    data: {
      items: [
        {
          id: "outbound-1",
          counterpartyId: "customer-1",
          fromType: "WAREHOUSE",
          fromId: "warehouse-1",
          transferType: "SALE",
          transferDate: MIDNIGHT_CROSSING,
        },
      ],
    },
    isLoading: false,
  })
  invoiceGroupsQuery.mockReturnValue({
    data: {
      items: [
        {
          id: "invoice-1",
          invoiceNumber: "INV-1",
          supplierName: "مورد",
          invoiceDate: MIDNIGHT_CROSSING,
          remainingDebtDzd: 0,
        },
      ],
    },
    isPending: false,
    isError: false,
  })
})

afterEach(() => {
  cleanup()
  restoreTimeZone()
})

describe("stored business day renders in Africa/Algiers (#473)", () => {
  it("actually runs under a non-Algerian timezone, so the assertions are not vacuous", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC")
    expect(ALGERIA_DAY).not.toBe(UTC_DAY)
  })

  it("formatAlgeriaDate pins the stored instant to the Algeria day", () => {
    expect(formatAlgeriaDate(MIDNIGHT_CROSSING)).toBe(ALGERIA_DAY)
    expect(formatAlgeriaDate(MIDNIGHT_CROSSING)).not.toBe(UTC_DAY)
  })

  it("home-view formatDateLabel renders the Algeria day, not the ambient UTC day", () => {
    expect(formatDateLabel(MIDNIGHT_CROSSING)).toBe(ALGERIA_DAY_SHORT)
    expect(formatDateLabel(MIDNIGHT_CROSSING)).not.toBe(UTC_DAY_SHORT)
    expect(formatDateLabel(null)).toBe("-")
  })

  it("TransferHistoryPage renders the transfer on its Algeria day", () => {
    render(<TransferHistoryPage />)
    expect(screen.getByText(ALGERIA_DAY_SHORT)).toBeTruthy()
    expect(screen.queryByText(UTC_DAY_SHORT)).toBeNull()
  })

  it("LocationTransferHistory renders the transfer on its Algeria day", () => {
    render(<LocationTransferHistory locationId="warehouse-1" locationType="WAREHOUSE" />)
    expect(screen.getByText(ALGERIA_DAY_SHORT)).toBeTruthy()
    expect(screen.queryByText(UTC_DAY_SHORT)).toBeNull()
  })

  it("OutboundTransfersPage renders the transfer on its Algeria day", () => {
    render(<OutboundTransfersPage onCreate={vi.fn()} />)
    expect(screen.getByText(ALGERIA_DAY)).toBeTruthy()
    expect(screen.queryByText(UTC_DAY)).toBeNull()
  })

  it("InventoryInvoicesPage renders the invoice on its Algeria day", () => {
    render(<InventoryInvoicesPage onCreate={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByText(ALGERIA_DAY)).toBeTruthy()
    expect(screen.queryByText(UTC_DAY)).toBeNull()
  })
})
