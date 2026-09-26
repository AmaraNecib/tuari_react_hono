// @vitest-environment jsdom

import "@/i18n"

import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { RecordHistoryTable, RecordTabPanel, RecordTabs } from "./record-page-frame"

afterEach(() => {
  cleanup()
})

function RecordTabsHarness({ initialTab = "overview" }: { initialTab?: string }) {
  const [activeTab, setActiveTab] = React.useState(initialTab)

  return (
    <div dir="rtl">
      <RecordTabs
        activeTab={activeTab}
        baseId="record-tabs-test"
        tabs={[
          { id: "overview", label: "نظرة عامة" },
          { id: "history", label: "السجل" },
          { id: "team", label: "الفريق" },
        ]}
        onChange={setActiveTab}
      />
      <RecordTabPanel activeTab={activeTab} tabId="overview">
        <div>محتوى النظرة العامة</div>
      </RecordTabPanel>
      <RecordTabPanel activeTab={activeTab} tabId="history">
        <div>محتوى السجل</div>
      </RecordTabPanel>
      <RecordTabPanel activeTab={activeTab} tabId="team">
        <div>محتوى الفريق</div>
      </RecordTabPanel>
    </div>
  )
}

describe("RecordTabs", () => {
  it("renders all tab triggers", () => {
    render(<RecordTabsHarness />)

    expect(screen.getByRole("tab", { name: "نظرة عامة" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "السجل" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "الفريق" })).toBeTruthy()
  })

  it("renders tablist container", () => {
    render(<RecordTabsHarness />)

    expect(screen.getByRole("tablist")).toBeTruthy()
  })

  it("shows content for the active tab only", () => {
    render(<RecordTabsHarness initialTab="overview" />)

    expect(screen.getByText("محتوى النظرة العامة")).toBeTruthy()
    expect(screen.queryByText("محتوى السجل")).toBeNull()
    expect(screen.queryByText("محتوى الفريق")).toBeNull()
  })

  it("shows history content when history is active", () => {
    render(<RecordTabsHarness initialTab="history" />)

    expect(screen.queryByText("محتوى النظرة العامة")).toBeNull()
    expect(screen.getByText("محتوى السجل")).toBeTruthy()
    expect(screen.queryByText("محتوى الفريق")).toBeNull()
  })

  it("shows team content when team is active", () => {
    render(<RecordTabsHarness initialTab="team" />)

    expect(screen.queryByText("محتوى النظرة العامة")).toBeNull()
    expect(screen.queryByText("محتوى السجل")).toBeNull()
    expect(screen.getByText("محتوى الفريق")).toBeTruthy()
  })
})

describe("RecordHistoryTable", () => {
  type HistoryRow = {
    id: string
    typeLabel: string
    title: string
    detail?: string | null
    periodLabel: string
    statusLabel: string
  }

  const rows: HistoryRow[] = [
    {
      id: "h1",
      typeLabel: "إضافة",
      title: "عملية إضافة",
      detail: "تفاصيل العملية",
      periodLabel: "2026-01-01",
      statusLabel: "مكتمل",
    },
  ]

  it("renders the default column headers from i18n", () => {
    render(<RecordHistoryTable emptyLabel="لا يوجد سجل" rows={[]} />)

    expect(screen.getByRole("columnheader", { name: "النوع" })).toBeTruthy()
    expect(screen.getByRole("columnheader", { name: "التفاصيل" })).toBeTruthy()
    expect(screen.getByRole("columnheader", { name: "الفترة" })).toBeTruthy()
    expect(screen.getByRole("columnheader", { name: "الحالة" })).toBeTruthy()
  })

  it("renders the empty state when there are no rows", () => {
    render(<RecordHistoryTable emptyLabel="لا يوجد سجل" rows={[]} />)

    expect(screen.getByText("لا يوجد سجل")).toBeTruthy()
  })

  it("renders row data using the shared table primitives", () => {
    render(<RecordHistoryTable emptyLabel="لا يوجد سجل" rows={rows} />)

    expect(screen.getByText("إضافة")).toBeTruthy()
    expect(screen.getByText("عملية إضافة")).toBeTruthy()
    expect(screen.getByText("تفاصيل العملية")).toBeTruthy()
    expect(screen.getByText("2026-01-01")).toBeTruthy()
    expect(screen.getByText("مكتمل")).toBeTruthy()
  })

  it("renders row without a detail element when detail is null", () => {
    render(
      <RecordHistoryTable
        emptyLabel="لا يوجد سجل"
        rows={[{ id: "h1", typeLabel: "إضافة", title: "عملية إضافة", detail: null, periodLabel: "2026-01-01", statusLabel: "مكتمل" }]}
      />,
    )

    expect(screen.getByText("عملية إضافة")).toBeTruthy()
    expect(screen.queryByText("تفاصيل العملية")).toBeNull()
  })

  it("honors custom column labels", () => {
    render(
      <RecordHistoryTable
        columns={{ type: "نوع مخصص", details: "تفاصيل مخصصة", period: "فترة", status: "وضع" }}
        emptyLabel="لا يوجد سجل"
        rows={[]}
      />,
    )

    expect(screen.getByRole("columnheader", { name: "نوع مخصص" })).toBeTruthy()
    expect(screen.getByRole("columnheader", { name: "تفاصيل مخصصة" })).toBeTruthy()
    expect(screen.getByRole("columnheader", { name: "فترة" })).toBeTruthy()
    expect(screen.getByRole("columnheader", { name: "وضع" })).toBeTruthy()
  })
})
