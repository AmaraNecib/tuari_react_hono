import { expect, it } from "vitest"
import { clearPendingSettlement, loadPendingSettlement, savePendingSettlement, type PendingSettlement } from "./manual-settlement-pending"
it("a late X completion cannot delete Y and a stale X retry cannot replace Y", () => {
 const data = new Map<string,string>()
 const port = { getItem: (k:string) => data.get(k) ?? null, setItem: (k:string,v:string) => { data.set(k,v) }, removeItem: (k:string) => { data.delete(k) } }
 const x: PendingSettlement = {kind:"reverse", input:{requestId:"X",settlementId:"s",reason:"X reason"}}
 const y: PendingSettlement = {kind:"reverse", input:{requestId:"Y",settlementId:"t",reason:"Y reason"}}
 savePendingSettlement(port,"u","p",x)
 clearPendingSettlement(port,"u","p",x)
 savePendingSettlement(port,"u","p",y)
 clearPendingSettlement(port,"u","p",x)
 expect(loadPendingSettlement(port,"u","p")).toEqual(y)
 expect(() => savePendingSettlement(port,"u","p",x)).toThrow()
 expect(loadPendingSettlement(port,"u","p")).toEqual(y)
})
