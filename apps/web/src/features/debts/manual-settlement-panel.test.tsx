// @vitest-environment jsdom
import "@/i18n"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import type { ExactDebtsClient } from "@tuari/contracts"
import { ManualSettlementPanel, type ManualSettlementClient } from "./manual-settlement-panel"
import { useExactDebtCommand } from "./debts-exact-queries"
import { loadPendingSettlement, savePendingSettlement, type PendingSettlement } from "./manual-settlement-pending"
const identity = vi.hoisted(() => ({ owner: "u" }))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: identity.owner } } }) }))
const confirm: PendingSettlement = { kind: "confirm", input: { requestId: "X", externalCounterpartyId: "p", payableOriginalEntryId: "a", receivableOriginalEntryId: "b", currency: "DZD", amountDzd: "25.00", expectedPayableRemainingDzd: "100.00", expectedReceivableRemainingDzd: "60.00", note: "original note" } }
const reverse: PendingSettlement = { kind: "reverse", input: { requestId: "R", settlementId: "s", reason: "original reason" } }
const queries: QueryClient[] = []
function fixture() {
 const client = {
  candidates: vi.fn().mockResolvedValue([{ id: "a", direction: "PAYABLE", postingSequence: 1, remainingDzd: "100.00", sourceKind: "PURCHASE", sourceId: "invoice-1", sourceLabel: "IN-00001" }, { id: "b", direction: "RECEIVABLE", postingSequence: 1, remainingDzd: "60.00", sourceKind: "SALE", sourceId: "sale-1", sourceLabel: "SALE · sale-1" }]),
  history: vi.fn().mockResolvedValue({ items: [], nextOffset: null }), accountHistory: vi.fn(),
  preview: vi.fn().mockResolvedValue({ payableRemainingDzd: "100.00", receivableRemainingDzd: "60.00", projectedPayableRemainingDzd: "75.00", projectedReceivableRemainingDzd: "35.00", netPositionDzd: "40.00" }),
  confirm: vi.fn().mockResolvedValue({}), reverse: vi.fn().mockResolvedValue({}),
 }
 const query = new QueryClient({ defaultOptions: { queries: { retry: false } } }); queries.push(query)
 const mount = () => render(<QueryClientProvider client={query}><ManualSettlementPanel client={client as unknown as ManualSettlementClient} debtClient={{} as ExactDebtsClient} partyId="p" /></QueryClientProvider>)
 return { client, mount, query }
}
afterEach(() => { cleanup(); identity.owner = "u"; vi.restoreAllMocks(); sessionStorage.clear(); queries.splice(0).forEach(q => q.clear()) })
it.each(["create", "post", "pay", "correct", "void", "settle"] as const)("refreshes mounted candidates after ordinary %s", async kind => {
 const f = fixture()
 const original = { id: "new-original", direction: "PAYABLE", postingSequence: 2, remainingDzd: "12.00" }
 const command = vi.fn().mockImplementation(async () => {
  f.client.candidates.mockResolvedValue([original])
  return {}
 })
 const debtClient = { [kind]: command } as unknown as ExactDebtsClient
 function OrdinaryCommand() {
  const mutation = useExactDebtCommand(debtClient)
  return <button onClick={() => mutation.mutate({ kind, input: {} } as Parameters<typeof mutation.mutate>[0])}>ordinary</button>
 }
 render(<QueryClientProvider client={f.query}>
  <OrdinaryCommand />
  <ManualSettlementPanel client={f.client as unknown as ManualSettlementClient} debtClient={debtClient} partyId="p" />
 </QueryClientProvider>)
 fireEvent.click(await screen.findByRole("button", { name: "تسوية متبادلة جديدة" }))
 const select = await screen.findByRole("combobox", { name: "الدين المستحق علينا" })
 await waitFor(() => expect(select.querySelector('option[value="a"]')).not.toBeNull())
 fireEvent.click(screen.getByRole("button", { name: "ordinary", hidden: true }))
 await waitFor(() => expect(select.querySelector('option[value="new-original"]')).not.toBeNull())
 expect(select.querySelector('option[value="a"]')).toBeNull()
 expect(command).toHaveBeenCalledTimes(1)
})
const retry = () => screen.getByRole("button", { name: "إعادة الطلب نفسه" })
for (const command of [confirm, reverse]) {
 for (const code of ["FORBIDDEN", "UNAUTHORIZED", "UPGRADE_REQUIRED", "SERVICE_UNAVAILABLE", "CONFLICT"]) it(`${command.kind} retains committed-once intent after lost response, ${code} and remount`, async () => {
  savePendingSettlement(sessionStorage, "u", "p", command)
  const f = fixture(); let committed = 0
  f.client[command.kind].mockImplementationOnce(async (body: unknown) => { expect(loadPendingSettlement(sessionStorage,"u","p")).toEqual(command); expect(body).toEqual(command.input); committed++; throw new TypeError("lost response") }).mockRejectedValueOnce({ code }).mockResolvedValueOnce({})
  let view = f.mount(); fireEvent.click(retry()); await waitFor(() => expect(f.client[command.kind]).toHaveBeenCalledTimes(1))
  await waitFor(() => expect((retry() as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(retry())
  await waitFor(() => expect(f.client[command.kind]).toHaveBeenCalledTimes(2)); await waitFor(() => expect((retry() as HTMLButtonElement).disabled).toBe(false))
  expect(loadPendingSettlement(sessionStorage,"u","p")).toEqual(command); view.unmount(); view = f.mount(); fireEvent.click(retry())
  await waitFor(() => expect(screen.queryByRole("button",{name:"إعادة الطلب نفسه"})).toBeNull())
  expect(f.client[command.kind].mock.calls.map(c => c[0])).toEqual([command.input,command.input,command.input]); expect(committed).toBe(1)
 })
 it(`${command.kind} blocks dispatch when persistence write fails`, async () => {
  savePendingSettlement(sessionStorage,"u","p",command); const f = fixture(); f.mount()
  vi.spyOn(Storage.prototype,"setItem").mockImplementation(() => { throw new Error("quota") })
  fireEvent.click(retry()); expect(await screen.findByRole("alert")).toBeTruthy(); expect(f.client[command.kind]).not.toHaveBeenCalled()
 })
 it(`${command.kind} keeps accepted identity when cleanup fails and safely replays on remount`, async () => {
  savePendingSettlement(sessionStorage,"u","p",command); const f = fixture(); const view = f.mount()
  const spy = vi.spyOn(Storage.prototype,"removeItem").mockImplementation(() => { throw new Error("cleanup") })
  fireEvent.click(retry()); await screen.findByRole("alert"); expect(loadPendingSettlement(sessionStorage,"u","p")).toEqual(command)
  view.unmount(); spy.mockRestore(); f.mount(); fireEvent.click(retry())
  await waitFor(() => expect(loadPendingSettlement(sessionStorage,"u","p")).toBeNull()); expect(f.client[command.kind].mock.calls.map(c => c[0])).toEqual([command.input,command.input])
 })
}
for (const fault of ["read", "malformed"]) it(`blocks all dispatch after ${fault} storage failure`, async () => {
 if(fault === "read") vi.spyOn(Storage.prototype,"getItem").mockImplementation(() => { throw new Error("disabled") })
 else sessionStorage.setItem(JSON.stringify(["manual-settlement-v1","u","p"]),"invalid json")
 const f = fixture(); f.mount(); await screen.findByRole("alert"); expect(f.client.confirm).not.toHaveBeenCalled(); expect(f.client.reverse).not.toHaveBeenCalled()
})
it("late unmounted X cannot clear new Y after remount replays X", async () => {
 savePendingSettlement(sessionStorage,"u","p",confirm); const f = fixture(); let finish!: () => void
 const accepted = new Map<string, unknown>()
 const accept = (body: {requestId:string}) => { if (!accepted.has(body.requestId)) accepted.set(body.requestId, body); return accepted.get(body.requestId) }
 f.client.confirm.mockImplementationOnce((body: {requestId:string}) => { const result = accept(body); return new Promise(resolve => { finish = () => resolve(result) }) }).mockImplementationOnce(async body => accept(body)).mockImplementationOnce(async body => { expect(loadPendingSettlement(sessionStorage,"u","p")?.input).toEqual(body); accept(body); throw new TypeError("lost Y") }).mockImplementationOnce(async body => accept(body))
 const a = f.mount(); fireEvent.click(retry()); await waitFor(() => expect(f.client.confirm).toHaveBeenCalledTimes(1)); a.unmount()
 const b = f.mount(); fireEvent.click(retry()); await waitFor(() => expect(screen.queryByRole("button",{name:"إعادة الطلب نفسه"})).toBeNull())
 fireEvent.click(await screen.findByRole("button", {name:"تسوية متبادلة جديدة"}))
 fireEvent.change(await screen.findByRole("combobox",{name:"الدين المستحق علينا"}),{target:{value:"a"}}); fireEvent.change(screen.getByRole("combobox",{name:"الدين المستحق لنا"}),{target:{value:"b"}})
 fireEvent.change(screen.getByRole("textbox",{name:"مبلغ التسوية المتبادلة"}),{target:{value:"25"}}); fireEvent.click(screen.getByRole("button",{name:"معاينة التسوية المتبادلة"}))
 fireEvent.click(await screen.findByRole("button",{name:"تأكيد التسوية المتبادلة"})); await waitFor(() => expect(f.client.confirm).toHaveBeenCalledTimes(3))
 const y = loadPendingSettlement(sessionStorage,"u","p"); expect(y?.input.requestId).not.toBe("X")
 await act(async () => { finish() }); expect(loadPendingSettlement(sessionStorage,"u","p")).toEqual(y)
 b.unmount(); f.mount(); fireEvent.click(retry()); await waitFor(() => expect(loadPendingSettlement(sessionStorage,"u","p")).toBeNull())
 expect(f.client.confirm.mock.calls[3]?.[0]).toEqual(y?.input); expect(accepted.size).toBe(2)
 expect([...accepted.keys()]).toEqual(["X", y?.input.requestId])
})
for (const switchKind of ["user", "party", "client"]) it(`isolates deferred completion across ${switchKind} changes`, async () => {
 savePendingSettlement(sessionStorage,"u","p",confirm); const f=fixture(); let finish!:()=>void
 f.client.confirm.mockImplementationOnce(() => new Promise(resolve => { finish=()=>resolve({}) }))
 const view=f.mount(); fireEvent.click(retry()); await waitFor(() => expect(f.client.confirm).toHaveBeenCalledTimes(1))
 const owner=switchKind === "user" ? "other-user" : "u"; const party=switchKind === "party" ? "other-party" : "p"
 const next=switchKind === "client" ? {...f.client} : f.client
 identity.owner=owner
 view.rerender(<QueryClientProvider client={f.query}><ManualSettlementPanel client={next as unknown as ManualSettlementClient} debtClient={{} as ExactDebtsClient} partyId={party} /></QueryClientProvider>)
 if(switchKind !== "client") expect(screen.queryByRole("button",{name:"إعادة الطلب نفسه"})).toBeNull()
 else expect(retry()).toBeTruthy()
 await act(async () => { finish() })
 expect(f.client.confirm).toHaveBeenCalledTimes(1); expect(loadPendingSettlement(sessionStorage,"u","p")).toBeNull()
})
it("opens on demand and retains a draft after closing", async () => {
 const f = fixture(); f.mount()
 await screen.findByText("لا توجد تسويات متبادلة لهذه الجهة.")
 expect(screen.queryByRole("combobox", {name:"الدين المستحق علينا"})).toBeNull()
 fireEvent.click(screen.getByRole("button", {name:"تسوية متبادلة جديدة"}))
 fireEvent.change(screen.getByRole("combobox", {name:"الدين المستحق علينا"}), {target:{value:"a"}})
 fireEvent.change(screen.getByRole("combobox", {name:"الدين المستحق لنا"}), {target:{value:"b"}})
 fireEvent.change(screen.getByRole("textbox", {name:"مبلغ التسوية المتبادلة"}), {target:{value:"25"}})
 fireEvent.click(screen.getByRole("button", {name:"معاينة التسوية المتبادلة"}))
 await screen.findByRole("button", {name:"تأكيد التسوية المتبادلة"})
 fireEvent.click(screen.getByRole("button", {name:"إغلاق"}))
 await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
 fireEvent.click(screen.getByRole("button", {name:"تسوية متبادلة جديدة"}))
 expect((screen.getByRole("textbox", {name:"مبلغ التسوية المتبادلة"}) as HTMLInputElement).value).toBe("25")
 expect(screen.getByRole("button", {name:"تأكيد التسوية المتبادلة"})).toBeTruthy()
 expect(f.client.confirm).not.toHaveBeenCalled()
})
it("history and reversal remain available when candidate read fails", async () => {
 const f=fixture(); f.client.candidates.mockRejectedValue({code:"FORBIDDEN"}); f.client.history.mockResolvedValue({items:[{id:"s",amountDzd:"25.00",recordedAt:"2026-11-10T10:00:00.000Z",actorLabel:"Operator",payableOriginalEntryId:"a",receivableOriginalEntryId:"b",reversal:null}],nextOffset:null})
 f.mount(); expect(await screen.findByRole("button",{name:"عكس التسوية كاملة"})).toBeTruthy()
})
