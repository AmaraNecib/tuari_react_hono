// @vitest-environment jsdom

import "@/i18n"

import * as React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RecordTabPanel, RecordTabs } from "./record-page-frame"

afterEach(() => {
  cleanup()
})

function RecordTabsHarness() {
  const [activeTab, setActiveTab] = React.useState("overview")

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
      <RecordTabPanel activeTab={activeTab} baseId="record-tabs-test" tabId="overview">
        <div>محتوى النظرة العامة</div>
      </RecordTabPanel>
      <RecordTabPanel activeTab={activeTab} baseId="record-tabs-test" tabId="history">
        <div>محتوى السجل</div>
      </RecordTabPanel>
      <RecordTabPanel activeTab={activeTab} baseId="record-tabs-test" tabId="team">
        <div>محتوى الفريق</div>
      </RecordTabPanel>
    </div>
  )
}

describe("RecordTabs", () => {
  it("wires tabs and tabpanels with ARIA metadata", () => {
    render(<RecordTabsHarness />)

    const activeTab = screen.getByRole("tab", { name: "نظرة عامة" })
    const panel = screen.getByRole("tabpanel")

    expect(activeTab.getAttribute("aria-controls")).toBe("record-tabs-test-panel-overview")
    expect(activeTab.getAttribute("id")).toBe("record-tabs-test-tab-overview")
    expect(panel.getAttribute("id")).toBe("record-tabs-test-panel-overview")
    expect(panel.getAttribute("aria-labelledby")).toBe("record-tabs-test-tab-overview")
    expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("horizontal")
  })

  it("supports RTL-friendly arrow key navigation", () => {
    render(<RecordTabsHarness />)

    const overviewTab = screen.getByRole("tab", { name: "نظرة عامة" })
    overviewTab.focus()

    fireEvent.keyDown(overviewTab, { key: "ArrowLeft" })

    expect(screen.getByRole("tab", { name: "السجل" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("tabpanel").textContent).toContain("محتوى السجل")
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "السجل" }))
  })

  it("supports Home and End keyboard navigation", () => {
    const onChange = vi.fn()

    render(
      <div dir="rtl">
        <RecordTabs
          activeTab="history"
          baseId="record-tabs-home-end"
          tabs={[
            { id: "overview", label: "نظرة عامة" },
            { id: "history", label: "السجل" },
            { id: "team", label: "الفريق" },
          ]}
          onChange={onChange}
        />
      </div>,
    )

    const historyTab = screen.getByRole("tab", { name: "السجل" })
    fireEvent.keyDown(historyTab, { key: "Home" })
    fireEvent.keyDown(historyTab, { key: "End" })

    expect(onChange).toHaveBeenNthCalledWith(1, "overview")
    expect(onChange).toHaveBeenNthCalledWith(2, "team")
  })
})
