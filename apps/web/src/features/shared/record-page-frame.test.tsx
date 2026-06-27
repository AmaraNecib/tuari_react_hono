// @vitest-environment jsdom

import "@/i18n"

import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { RecordTabPanel, RecordTabs } from "./record-page-frame"

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
