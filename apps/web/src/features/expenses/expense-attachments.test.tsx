// @vitest-environment jsdom
import "@/i18n"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { ExpenseAttachments } from "./expense-attachments"
vi.mock("@/features/app-shell/workspace-queries",async()=>{
  const {useQuery}=await import("@tanstack/react-query")
  return {useWorkspaceScopedQuery:({key,...options}:{key:(user:string)=>unknown[];queryFn:()=>Promise<unknown>})=>useQuery({...options,queryKey:key("owner")})}
})
vi.mock("@/lib/desktop-auth-session",()=>({isDesktopRuntime:()=>false}))
vi.mock("@/lib/orpc-client",()=>({createRpcHeaders:()=>({}),resolveRpcCredentials:()=>"include"}))
vi.mock("@/lib/runtime-config",()=>({resolveApiUrl:(path:string)=>`http://localhost${path}`}))
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it("shows receipt links without any upload controls in read-only history",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({items:[{id:"a",originalName:"history.pdf",byteSize:1}]})})))
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ExpenseAttachments expenseId="voided" readOnly /></QueryClientProvider>)
  await waitFor(()=>expect(screen.getByRole("link",{name:"history.pdf"})).toBeTruthy())
  expect(document.querySelector('input[type="file"]')).toBeNull()
  expect(screen.queryByRole("button",{name:"حفظ"})).toBeNull()
})

it("loads multiple saved files again when reopening the same expense",async()=>{
  const fetcher = vi.fn(async()=>({ok:true,json:async()=>({items:[{id:"a",originalName:"first.pdf",byteSize:1},{id:"b",originalName:"second.png",byteSize:2}]})}))
  vi.stubGlobal("fetch",fetcher)
  const client = new QueryClient({defaultOptions:{queries:{retry:false,staleTime:30_000}}})
  function open(){return render(<QueryClientProvider client={client}><ExpenseAttachments expenseId="expense-one" /></QueryClientProvider>)}
  const first=open()
  await waitFor(()=>expect(screen.getByRole("link",{name:"second.png"})).toBeTruthy())
  expect(screen.getByRole("link",{name:"first.pdf"}).getAttribute("href")).toBe("http://localhost/api/expenses/expense-one/attachments/a")
  first.unmount()
  fetcher.mockResolvedValueOnce({ok:true,json:async()=>({items:[{id:"a",originalName:"first.pdf",byteSize:1},{id:"b",originalName:"second.png",byteSize:2},{id:"external",originalName:"external.pdf",byteSize:3}]})})
  open()
  await waitFor(()=>expect(screen.getByRole("link",{name:"external.pdf"})).toBeTruthy())
  expect(fetcher).toHaveBeenCalledTimes(2)
})
