import type { AppClient } from "@tuari/contracts"

export type ManualSettlementClient = AppClient["financial"]["manualSettlement"]
export type ExperimentalSettlementClient = AppClient["financial"]["experimentalSettlement"]
export type ExperimentalInvoicesClient = AppClient["financial"]["experimentalInvoices"]
export type SettlementCapabilities = NonNullable<Awaited<ReturnType<AppClient["financial"]["metadata"]>>["capabilities"]>

export type SettlementUiClient =
  | { kind: "manual"; client: ManualSettlementClient }
  | { kind: "experimental"; client: ExperimentalSettlementClient; invoices: ExperimentalInvoicesClient }
export type SettlementClientInput = SettlementUiClient | ManualSettlementClient

export type ManualSettlementRecord = Awaited<ReturnType<ManualSettlementClient["history"]>>["items"][number]
export type ExperimentalSettlementRecord = Awaited<ReturnType<ExperimentalSettlementClient["history"]>>["items"][number]
export type SettlementRecord = ManualSettlementRecord | ExperimentalSettlementRecord

const clientScopes = new WeakMap<object, number>()
let nextClientScope = 0

export function settlementApi(client: SettlementClientInput): ManualSettlementClient | ExperimentalSettlementClient {
  return "kind" in client ? client.client : client
}

export function settlementKind(client: SettlementClientInput): SettlementUiClient["kind"] {
  return "kind" in client ? client.kind : "manual"
}

export function settlementUiClient(client: SettlementClientInput): SettlementUiClient {
  return "kind" in client ? client : { kind: "manual", client }
}

export function manualSettlementScope(client: object): number {
  if (!clientScopes.has(client)) clientScopes.set(client, ++nextClientScope)
  return clientScopes.get(client)!
}

export function settlementClientPrefix(client: SettlementClientInput, owner: string) {
  return ["manual-settlement", settlementKind(client), manualSettlementScope(settlementApi(client)), owner] as const
}

export function selectSettlementClient({
  resolved,
  capabilities,
  manualClient,
  experimentalClient,
  experimentalInvoicesClient,
}: {
  resolved: boolean
  capabilities?: SettlementCapabilities
  manualClient?: ManualSettlementClient
  experimentalClient?: ExperimentalSettlementClient
  experimentalInvoicesClient?: ExperimentalInvoicesClient
}): SettlementUiClient | undefined {
  if (!resolved) return undefined
  if (capabilities?.experimentalSettlement === true
    && capabilities.experimentalInvoiceSettlement === true
    && experimentalClient
    && experimentalInvoicesClient) {
    return { kind: "experimental", client: experimentalClient, invoices: experimentalInvoicesClient }
  }
  if (capabilities?.manualSettlement === true && manualClient) return { kind: "manual", client: manualClient }
  return undefined
}
