import { expect, it } from "vitest"
import type { AppClient, WorkspaceMetadata } from "@tuari/contracts"
import { selectSettlementClient } from "./settlement-client"

const manual = {} as AppClient["financial"]["manualSettlement"]
const experimental = {} as AppClient["financial"]["experimentalSettlement"]
const invoices = {} as AppClient["financial"]["experimentalInvoices"]
const capabilities = (overrides: Partial<NonNullable<WorkspaceMetadata["capabilities"]>> = {}) => ({
  manualSettlement: true,
  experimentalInvoiceSettlement: true,
  experimentalSettlement: true,
  ...overrides,
}) as WorkspaceMetadata["capabilities"]

it("selects the experimental client only when both experimental capabilities are true", () => {
  for (const partial of [
    { experimentalInvoiceSettlement: false },
    { experimentalSettlement: false },
  ]) {
    expect(selectSettlementClient({
      resolved: true,
      capabilities: capabilities(partial),
      manualClient: manual,
      experimentalClient: experimental,
      experimentalInvoicesClient: invoices,
    })).toEqual({ kind: "manual", client: manual })
  }

  expect(selectSettlementClient({
    resolved: true,
    capabilities: capabilities(),
    manualClient: manual,
    experimentalClient: experimental,
    experimentalInvoicesClient: invoices,
  })).toEqual({ kind: "experimental", client: experimental, invoices })
})

it.each([
  [false, capabilities()],
  [true, undefined],
  [true, capabilities({ manualSettlement: false, experimentalSettlement: false, experimentalInvoiceSettlement: false })],
] as const)("selects no settlement client when metadata is unresolved or unsupported", (resolved, caps) => {
  expect(selectSettlementClient({
    resolved,
    capabilities: caps,
    manualClient: manual,
    experimentalClient: experimental,
    experimentalInvoicesClient: invoices,
  })).toBeUndefined()
})

it("falls back to manual when experimental capabilities are true but an experimental client is missing", () => {
  expect(selectSettlementClient({
    resolved: true,
    capabilities: capabilities(),
    manualClient: manual,
  })).toEqual({ kind: "manual", client: manual })
})
