// @vitest-environment jsdom
import "@/i18n"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import { ManualSettlementLink } from "./manual-settlement-link"
import type { ManualSettlementClient } from "./manual-settlement-panel"
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "u" } } }) }))
const clients: QueryClient[]=[]
afterEach(()=>{ cleanup(); clients.splice(0).forEach(q=>q.clear()) })
const operation={amountDzd:"25.00",id:"shared-operation",payableOriginalEntryId:"pay-original",receivableOriginalEntryId:"receive-original",payableSettlementEntryId:"pay-portion",receivableSettlementEntryId:"receive-portion",recordedAt:"2026-11-10T10:00:00.000Z",actorLabel:"Original actor",note:"Original optional note",reversal:{id:"shared-reversal",payableReversalEntryId:"pay-restore",receivableReversalEntryId:"receive-restore",recordedAt:"2026-11-11T10:00:00.000Z",actorLabel:"Reversal actor",reason:"Wrong pair"}}
for(const [accountId,entryId] of [["pay-account","pay-portion"],["receive-account","receive-portion"],["pay-account","pay-restore"],["receive-account","receive-restore"]]) it(`renders durable bilateral metadata for ${entryId}`,async()=>{
 const query=new QueryClient(); clients.push(query); const accountHistory=vi.fn().mockResolvedValue({items:[operation],nextOffset:null})
 render(<QueryClientProvider client={query}><ManualSettlementLink client={{accountHistory} as unknown as ManualSettlementClient} accountId={accountId!} entryId={entryId!}/></QueryClientProvider>)
 await screen.findByText("معكوسة بالكامل"); expect(accountHistory).toHaveBeenCalledWith({debtAccountId:accountId})
 for(const text of ["pay-original","receive-original","Original actor","Original optional note","shared-reversal","Reversal actor","Wrong pair"]) expect(document.body.textContent).toContain(text)
 expect(document.querySelector('[data-manual-reversal-id="shared-reversal"]')).toBeTruthy()
 const disclosure = screen.getByText("عرض تفاصيل القيدين الأصليين")
 expect(disclosure.closest("details")?.open).toBe(false)
 disclosure.click()
 expect(disclosure.closest("details")?.open).toBe(true)
 expect(screen.getAllByText(/تفاصيل المصدر غير متاحة/)).toHaveLength(2)
 expect(screen.getByText(/shared-operation/).closest("details")?.open).toBe(false)
})
it("does not relabel a generic account-zeroing posting as bilateral",async()=>{
 const query=new QueryClient(); clients.push(query); const accountHistory=vi.fn().mockResolvedValue({items:[operation],nextOffset:null})
 const view=render(<QueryClientProvider client={query}><ManualSettlementLink client={{accountHistory} as unknown as ManualSettlementClient} accountId="pay-account" entryId="generic-zero-posting"/></QueryClientProvider>)
 await waitFor(()=>expect(query.isFetching()).toBe(0)); expect(view.container.textContent).toBe("")
})
