import { expect, it } from "vitest"
import { workspaceRoutes } from "./router/navigation"

it("keeps ordinary inventory invoice routes separate from experimental invoice routes", () => {
  expect(workspaceRoutes.invoices()).toEqual({ to: "/invoices" })
  expect(workspaceRoutes.invoiceDetails("stock-group")).toEqual({ to: "/invoices/$invoiceId", params: { invoiceId: "stock-group" } })
  expect(workspaceRoutes.experimentalInvoices()).toEqual({ to: "/experimental/invoices" })
  expect(workspaceRoutes.experimentalInvoiceDetails("ordinary-invoice")).toEqual({ to: "/experimental/invoices/$invoiceId", params: { invoiceId: "ordinary-invoice" } })
})
