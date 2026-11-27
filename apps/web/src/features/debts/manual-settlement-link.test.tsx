// @vitest-environment jsdom
import "@/i18n"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import { ManualSettlementLink } from "./manual-settlement-link"
import type { ManualSettlementClient } from "./manual-settlement-panel"
const session = vi.hoisted(() => ({ owner: "u" as string | undefined }))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: session.owner ? { user: { id: session.owner } } : undefined }) }))
const clients: QueryClient[]=[]
afterEach(()=>{ cleanup(); clients.splice(0).forEach(q=>q.clear()); session.owner = "u" })
const operation={amountDzd:"25.00",id:"shared-operation",externalCounterpartyId:"party-1",payableSource:{kind:"PURCHASE",id:"invoice-1",label:"IN-00001"},receivableSource:{kind:"SALE",id:"sale-1",label:"SALE · sale-1"},payableOriginalEntryId:"pay-original",receivableOriginalEntryId:"receive-original",payableSettlementEntryId:"pay-portion",receivableSettlementEntryId:"receive-portion",recordedAt:"2026-11-10T10:00:00.000Z",actorLabel:"Original actor",note:"Original optional note",reversal:{id:"shared-reversal",payableReversalEntryId:"pay-restore",receivableReversalEntryId:"receive-restore",recordedAt:"2026-11-11T10:00:00.000Z",actorLabel:"Reversal actor",reason:"Wrong pair"}}
for(const [accountId,entryId] of [["pay-account","pay-portion"],["receive-account","receive-portion"],["pay-account","pay-restore"],["receive-account","receive-restore"]]) it(`renders durable bilateral metadata for ${entryId}`,async()=>{
 const query=new QueryClient(); clients.push(query); const accountHistory=vi.fn().mockResolvedValue({items:[operation],nextOffset:null})
 render(<QueryClientProvider client={query}><ManualSettlementLink client={{accountHistory} as unknown as ManualSettlementClient} accountId={accountId!} entryId={entryId!}/></QueryClientProvider>)
 await screen.findByText("معكوسة بالكامل"); expect(screen.getByRole("link",{name:"IN-00001"}).getAttribute("href")).toBe("/invoices/invoice-1"); expect(screen.getByRole("link",{name:"SALE · sale-1"}).getAttribute("href")).toBe("/outbound-transfers?source=sale-1&party=party-1"); expect(accountHistory).toHaveBeenCalledWith({debtAccountId:accountId})
 for(const text of ["pay-original","receive-original","Original actor","Original optional note","shared-reversal","Reversal actor","Wrong pair"]) expect(document.body.textContent).toContain(text)
 expect(document.querySelector('[data-manual-reversal-id="shared-reversal"]')).toBeTruthy()
 const disclosure = screen.getByText("عرض تفاصيل القيدين الأصليين")
 expect(disclosure.closest("details")?.open).toBe(false)
 disclosure.click()
 expect(disclosure.closest("details")?.open).toBe(true)
 expect(screen.getAllByText(/تفاصيل المصدر غير متاحة/)).toHaveLength(2)
 expect(disclosure.closest("details")?.textContent).not.toContain("قيد يدوي")
 expect(screen.getByText(/shared-operation/).closest("details")?.open).toBe(false)
})
it("renders restricted account history without inventory links or fake manual provenance", async () => {
 const query = new QueryClient(); clients.push(query);
 const restricted = { ...operation, payableSource: { kind: "RESTRICTED" }, receivableSource: { kind: "RESTRICTED" } };
 const accountHistory = vi.fn().mockResolvedValue({ items: [restricted], nextOffset: null });
 render(<QueryClientProvider client={query}><ManualSettlementLink client={{accountHistory} as unknown as ManualSettlementClient} accountId="pay-account" entryId="pay-portion" /></QueryClientProvider>);
 await screen.findByText("معكوسة بالكامل");
 expect(document.body.textContent).toContain("Original optional note");
 expect(document.body.textContent).toContain("pay-original");
 expect(document.body.textContent).toContain("receive-original");
 expect(document.body.textContent).toContain("مصدر مقيّد العرض");
 expect(screen.queryByRole("link", { name: "IN-00001" })).toBeNull();
 expect(screen.queryByRole("link", { name: "SALE · sale-1" })).toBeNull();
 expect(document.body.textContent).toContain("shared-operation");
 const disclosure = screen.getByText("عرض تفاصيل القيدين الأصليين");
 disclosure.click();
 expect(disclosure.closest("details")?.open).toBe(true);
 expect(disclosure.closest("details")?.textContent).not.toContain("قيد يدوي");
 expect(disclosure.closest("details")?.textContent?.match(/مصدر مقيّد العرض/g)).toHaveLength(2);
});
it("preserves genuine manual provenance when original entry details are missing", async () => {
 const query = new QueryClient(); clients.push(query);
 const manual = { ...operation, payableSource: { kind: "MANUAL", id: "pay-original", label: "#1" }, receivableSource: { kind: "MANUAL", id: "receive-original", label: "#2" } };
 const accountHistory = vi.fn().mockResolvedValue({ items: [manual], nextOffset: null });
 render(<QueryClientProvider client={query}><ManualSettlementLink client={{accountHistory} as unknown as ManualSettlementClient} accountId="pay-account" entryId="pay-portion" /></QueryClientProvider>);
 await screen.findByText("معكوسة بالكامل");
 const disclosure = screen.getByText("عرض تفاصيل القيدين الأصليين");
 disclosure.click();
 expect(disclosure.closest("details")?.open).toBe(true);
 expect(disclosure.closest("details")?.textContent?.match(/قيد يدوي أصلي/g)).toHaveLength(2);
});
it.each(["MANUAL", "PURCHASE", "SALE", "RESTRICTED"] as const)("uses truthful provenance for note-free %s entry details", async kind => {
 const query = new QueryClient(); clients.push(query);
 const source = kind === "RESTRICTED" ? { kind } : { kind, id: "source-record", label: "Source record" };
 const item = { ...operation, payableSource: source, receivableSource: source };
 const entries: NonNullable<Parameters<typeof ManualSettlementLink>[0]["entries"]> = ["pay-original", "receive-original"].map((id, index) => ({
  id, debtAccountId: index === 0 ? "pay-account" : "receive-account", entryType: "ADJUSTMENT", signedAmountDzd: "100.00", balanceAfterDzd: "100.00", remainingDzd: "90.00", postingSequence: 1, currency: "DZD",
  producerType: null, producerId: null, invoiceId: null, targetEntryId: null, correctionOfEntryId: null, note: kind === "RESTRICTED" ? "EXP-615-SECRET-NUMBER" : null, reasonCategory: "INVOICE_DRIVEN", reasonDetail: null, paymentMethod: null,
  status: "LIVE", voidedAt: null, voidedBy: null, voidReason: null, actorUserId: "u", actorLabel: "Owner", transactionId: "tx", entryDate: operation.recordedAt, createdAt: operation.recordedAt, updatedAt: operation.recordedAt,
 }));
 const accountHistory = vi.fn().mockResolvedValue({ items: [item], nextOffset: null });
 render(<QueryClientProvider client={query}><ManualSettlementLink client={{accountHistory} as unknown as ManualSettlementClient} accountId="pay-account" entryId="pay-portion" entries={entries} /></QueryClientProvider>);
 await screen.findByText("معكوسة بالكامل");
 const disclosure = screen.getByText("عرض تفاصيل القيدين الأصليين"); disclosure.click();
 expect(disclosure.closest("details")?.open).toBe(true);
 const text = disclosure.closest("details")?.textContent;
 if (kind === "MANUAL") expect(text?.match(/قيد يدوي/g)).toHaveLength(2);
 else {
  expect(text).not.toContain("قيد يدوي");
  expect(text?.match(kind === "RESTRICTED" ? /مصدر مقيّد العرض/g : /قيد أصلي/g)).toHaveLength(2);
  if (kind === "RESTRICTED") expect(text).not.toContain("EXP-615-SECRET-NUMBER");
 }
});
it("does not relabel a generic account-zeroing posting as bilateral",async()=>{
 const query=new QueryClient(); clients.push(query); const accountHistory=vi.fn().mockResolvedValue({items:[operation],nextOffset:null})
 const view=render(<QueryClientProvider client={query}><ManualSettlementLink client={{accountHistory} as unknown as ManualSettlementClient} accountId="pay-account" entryId="generic-zero-posting"/></QueryClientProvider>)
 await waitFor(()=>expect(query.isFetching()).toBe(0)); expect(view.container.textContent).toBe("")
})
it("does not request or expose history without a session", async () => {
 session.owner = undefined
 const query = new QueryClient(); clients.push(query)
 const accountHistory = vi.fn()
 const view = render(<QueryClientProvider client={query}><ManualSettlementLink client={{accountHistory} as unknown as ManualSettlementClient} accountId="pay-account" entryId="pay-portion" /></QueryClientProvider>)
 await waitFor(() => expect(query.isFetching()).toBe(0))
 expect(accountHistory).not.toHaveBeenCalled()
 expect(view.container.textContent).toBe("")
})
it("fails closed when account history access is denied", async () => {
 const query = new QueryClient(); clients.push(query)
 const accountHistory = vi.fn().mockRejectedValue(new Error("FORBIDDEN"))
 render(<QueryClientProvider client={query}><ManualSettlementLink client={{accountHistory} as unknown as ManualSettlementClient} accountId="foreign-account" entryId="pay-portion" /></QueryClientProvider>)
 await screen.findByRole("alert")
 expect(document.body.textContent).not.toContain("Original actor")
 expect(document.querySelector("[data-manual-settlement-id]")).toBeNull()
})
it.each(["SERVICE_UNAVAILABLE", "FORBIDDEN", "INTERNAL_SERVER_ERROR"])("hides cached restricted history after %s", async code => {
 const query = new QueryClient(); clients.push(query)
 const accountHistory = vi.fn().mockResolvedValueOnce({ items: [operation], nextOffset: null })
 const view = render(<QueryClientProvider client={query}><ManualSettlementLink client={{accountHistory} as unknown as ManualSettlementClient} accountId="pay-account" entryId="pay-portion" /></QueryClientProvider>)
 await screen.findByText("معكوسة بالكامل")
 accountHistory.mockRejectedValue(Object.assign(new Error(code), { code }))
 await query.invalidateQueries({ queryKey: ["manual-settlement"] })
 await waitFor(() => expect(view.container.textContent).not.toContain("Original actor"))
 expect(document.querySelector("[data-manual-settlement-id]")).toBeNull()
 if (code === "SERVICE_UNAVAILABLE") expect(view.container.textContent).toBe("")
 else expect(screen.getByRole("alert")).toBeTruthy()
})
it("names a settled action separately from a reversal", async () => {
 const query = new QueryClient(); clients.push(query)
 const accountHistory = vi.fn().mockResolvedValue({items:[{...operation,reversal:null}],nextOffset:null})
 render(<QueryClientProvider client={query}><ManualSettlementLink client={{accountHistory} as unknown as ManualSettlementClient} accountId="pay-account" entryId="pay-portion" /></QueryClientProvider>)
 await screen.findByText("تسوية مسجلة")
 expect(screen.queryByText("معكوسة بالكامل")).toBeNull()
 expect(document.querySelector("[data-manual-reversal-id]")).toBeNull()
})
