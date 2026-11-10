import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { ExactDebtsClient, ExactDebtDetail, ExactDebtAccount } from "@tuari/contracts"
import { AppDate } from "@/components/app-date"
import { Button } from "@/components/ui/button"
import { CurrencyAmountInput } from "@/components/ui/currency-amount-input"
import { NativeSelect, Textarea } from "@/components/ui/form-controls"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Surface } from "@/features/shared/page-primitives"
import { MoneyValue } from "@/features/shared/money-value"
import { parseLocalizedMoneyInput } from "@/features/shared/exact-money-input"
import { getCachedSessionUserId } from "@/features/app-shell/workspace-keys"
import { useExactDebtCommand, useExactDebtDetail, useExactDebtSummary, type ExactDebtCommand } from "./debts-exact-queries"

export type ExactDebtPartyOption = { id: string; label: string; partyType: ExactDebtAccount["partyType"] }
type Entry = ExactDebtDetail["entries"][number]
type Action = { kind: "pay" | "correct" | "void"; entry: Entry } | { kind: "post" | "settle" }
const actionLabel = { pay: "تسجيل دفعة", correct: "تصحيح المبلغ المتفق عليه", void: "إلغاء الحركة", post: "إضافة حركة", settle: "تسوية الحساب بالكامل" }
// Client identity bounds retention without keeping discarded clients alive.
// Owner is part of each intent signature, so remounts preserve uncertain keys
// without sharing them across authenticated users.
const requestScopes = new WeakMap<ExactDebtsClient, Map<string, string>>()
const entryLabel = { OPENING: "رصيد افتتاحي", ADJUSTMENT: "تعديل", ADVANCE: "سلفة", PAYMENT: "دفعة", SETTLEMENT: "تسوية" }
function amount(value: string, positive: boolean) {
  try {
    const parsed = parseLocalizedMoneyInput(value)
    const comparison = parsed.compare(parseLocalizedMoneyInput("0"))
    return positive ? comparison > 0 ? parsed.toWire() : null : parsed.toWire()
  } catch { return null }
}

/** Explicit exact client injection only; numeric production routes remain unchanged. */
export function ExactDebtsPage({ client, parties }: { client: ExactDebtsClient; parties: ExactDebtPartyOption[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [accountPage, setAccountPage] = useState(1)
  const [entryPage, setEntryPage] = useState(1)
  const [search, setSearch] = useState("")
  const partyNames = useMemo(() => new Map(parties.map(row => [row.id, row.label])), [parties])
  const [action, setAction] = useState<Action | null>(null)
  const [partyId, setPartyId] = useState(parties[0]?.id ?? "")
  const [direction, setDirection] = useState<"PAYABLE" | "RECEIVABLE">("PAYABLE")
  const [opening, setOpening] = useState("")
  const [reason, setReason] = useState("")
  const [notice, setNotice] = useState("")
  const summary = useExactDebtSummary(client)
  const detail = useExactDebtDetail(client, selected)
  const mutation = useExactDebtCommand(client)
  const queries = useQueryClient()
  // Preserve the receipt key after an uncertain network result, including when
  // a dialog closes and reopens. A successful intentional repeat gets a new key.
  async function execute(command: ExactDebtCommand) {
    let requests = requestScopes.get(client)
    if (!requests) { requests = new Map<string, string>(); requestScopes.set(client, requests) }
    const signature = JSON.stringify({ owner: getCachedSessionUserId(queries), kind: command.kind, input: { ...command.input, requestId: undefined } })
    let requestId = requests.get(signature)
    if (!requestId) { requestId = crypto.randomUUID(); requests.set(signature, requestId) }
    await mutation.mutateAsync({ ...command, input: { ...command.input, requestId } } as ExactDebtCommand)
    requests.delete(signature)
    setNotice("تم حفظ الحركة وتحديث الرصيد.")
  }
  function open(next: Action) { mutation.reset(); setAction(next); setNotice("") }
  const chosenParty = parties.find(row => row.id === partyId)
  const openingValue = opening.trim() ? amount(opening, false) : undefined
  const canCreate = chosenParty && reason.trim() && (openingValue === undefined || (openingValue !== null && !openingValue.startsWith("-")))
  const account = detail.data?.account
  const matchingAccounts = summary.data?.accounts.filter(row => (partyNames.get(row.workerId ?? row.externalCounterpartyId ?? "") ?? "").includes(search.trim())) ?? []
  const shownAccounts = matchingAccounts.slice((accountPage - 1) * 25, accountPage * 25)
  const shownEntries = detail.data?.entries.slice().reverse().slice((entryPage - 1) * 25, entryPage * 25) ?? []
  return <main dir="rtl" className="min-w-0 space-y-6" aria-label="سجل الديون الدقيق">
    <header><h1 className="text-2xl font-semibold">الديون</h1><p className="mt-1 text-sm text-muted-foreground">حسابات منفصلة للمستحقات لنا والمستحقات علينا.</p></header>
    {summary.isPending ? <p role="status">جار تحميل الحسابات…</p> : summary.isError ? <div role="alert">تعذر تحميل الحسابات. <Button variant="outline" onClick={() => void summary.refetch()}>إعادة المحاولة</Button></div> : <>
      <div className="flex flex-wrap gap-x-10 gap-y-4 border-y border-border py-4">
        <div className="max-w-full overflow-x-auto"><p className="mb-1 text-sm text-muted-foreground">مستحقات علينا</p><MoneyValue exact aggregate value={summary.data.grossPayableDzd} currencyLabel="دج" variant="detail" /></div>
        <div className="max-w-full overflow-x-auto"><p className="mb-1 text-sm text-muted-foreground">مستحقات لنا</p><MoneyValue exact aggregate value={summary.data.grossReceivableDzd} currencyLabel="دج" variant="detail" /></div>
      </div>
      <label className="block text-sm">بحث عن حساب<input aria-label="بحث عن حساب" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3" value={search} onChange={event => { setSearch(event.target.value); setAccountPage(1) }} /></label>
      <nav aria-label="حسابات الديون" className="flex flex-wrap gap-2">
        {shownAccounts.map(row => <Button key={row.id} disabled={mutation.isPending} variant={row.id === selected ? "default" : "outline"} className="h-auto min-h-11 max-w-full flex-wrap py-2" onClick={() => { setSelected(row.id); setEntryPage(1); setAction(null); mutation.reset() }}>
          {partyNames.get(row.workerId ?? row.externalCounterpartyId ?? "") ?? "طرف غير متاح"} · {row.direction === "PAYABLE" ? "مستحقات علينا" : "مستحقات لنا"} <MoneyValue exact value={row.currentBalance} currencyLabel="دج" />
        </Button>)}
        {!summary.data.accounts.length && <p>لا توجد حسابات ديون بعد.</p>}
      </nav>
      {matchingAccounts.length > 25 && <div className="flex items-center gap-3" aria-label="صفحات الحسابات"><Button variant="outline" disabled={accountPage === 1} onClick={() => setAccountPage(page => page - 1)}>السابق</Button><span>{accountPage}</span><Button variant="outline" disabled={accountPage * 25 >= matchingAccounts.length} onClick={() => setAccountPage(page => page + 1)}>التالي</Button></div>}
    </>}
    <Surface className="min-w-0 p-5" variant="card">
      <h2 className="mb-4 text-lg font-semibold">إنشاء حساب أو إضافة رصيد افتتاحي للطرف</h2>
      <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={event => {
        event.preventDefault()
        if (!canCreate || !chosenParty) return
        void execute({ kind: "create", input: { requestId: "pending", partyType: chosenParty.partyType,
          ...(chosenParty.partyType === "INTERNAL_WORKER" ? { workerId: chosenParty.id } : { externalCounterpartyId: chosenParty.id }),
          direction, ...(openingValue !== undefined && openingValue !== null ? { openingBalanceDzd: openingValue } : {}), reasonCategory: "OTHER", reasonDetail: reason.trim(), note: reason.trim() } }).then(() => { setOpening(""); setReason("") }).catch(() => {})
      }}>
        <label className="space-y-2 text-sm"><span>الطرف</span><NativeSelect aria-label="الطرف" value={partyId} disabled={mutation.isPending} onChange={event => setPartyId(event.target.value)}>{!parties.length && <option value="">لا توجد أطراف</option>}{parties.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</NativeSelect></label>
        <label className="space-y-2 text-sm"><span>اتجاه الحساب</span><NativeSelect aria-label="اتجاه الحساب" value={direction} disabled={mutation.isPending} onChange={event => setDirection(event.target.value as typeof direction)}><option value="PAYABLE">مستحقات علينا</option><option value="RECEIVABLE">مستحقات لنا</option></NativeSelect></label>
        <CurrencyAmountInput exact label="الرصيد الافتتاحي، اختياري" value={opening} onChange={setOpening} disabled={mutation.isPending} />
        <label className="space-y-2 text-sm"><span>سبب الدين</span><Textarea aria-label="سبب الدين" maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} disabled={mutation.isPending} /></label>
        <div><Button type="submit" disabled={!canCreate || mutation.isPending}>حفظ الحساب</Button></div>
      </form>
    </Surface>
    {selected && (detail.isPending ? <p role="status">جار تحميل الحركات…</p> : detail.isError ? <div role="alert">تعذر تحميل الحركات. <Button variant="outline" onClick={() => void detail.refetch()}>إعادة المحاولة</Button></div> : account && <Surface className="min-w-0 p-5" variant="card">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="text-lg font-semibold">حركات الحساب · {account.direction === "PAYABLE" ? "مستحقات علينا" : "مستحقات لنا"}</h2><p className="mt-1"><MoneyValue exact value={account.currentBalance} currencyLabel="دج" variant="detail" /></p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => open({ kind: "post" })}>إضافة حركة</Button><Button disabled={mutation.isPending || !detail.data.entries.some(row => row.remainingDzd !== null && row.remainingDzd !== "0.00")} onClick={() => open({ kind: "settle" })}>تسوية الحساب بالكامل</Button></div>
      </div>
      <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="جدول حركات الدين">
        <Table><TableHeader><TableRow><TableHead>النوع والتاريخ</TableHead><TableHead>المبلغ</TableHead><TableHead>الرصيد بعد الحركة</TableHead><TableHead>المتبقي للحركة</TableHead><TableHead>التوثيق والإجراءات</TableHead></TableRow></TableHeader><TableBody>
          {shownEntries.map(row => <TableRow key={row.id} data-entry-id={row.id} className={row.status === "VOIDED" ? "opacity-65" : undefined}>
            <TableCell><div>{entryLabel[row.entryType]}{row.correctionOfEntryId ? " · تصحيح" : ""}{row.status === "VOIDED" ? " · ملغاة" : ""}</div><div className="mt-1 text-xs text-muted-foreground"><AppDate value={row.entryDate} includeTime timeStyle="medium" /></div></TableCell>
            <TableCell><MoneyValue exact signed value={row.signedAmountDzd} currencyLabel="دج" /></TableCell><TableCell><MoneyValue exact value={row.balanceAfterDzd} currencyLabel="دج" /></TableCell>
            <TableCell>{row.remainingDzd !== null ? <MoneyValue exact value={row.remainingDzd} currencyLabel="دج" /> : "—"}</TableCell>
            <TableCell className="min-w-56"><p className="mb-2 max-w-72 whitespace-normal break-words text-xs text-muted-foreground">{row.note} {row.actorLabel}{row.voidReason ? ` · ${row.voidReason}` : ""}</p>
              {(row.targetEntryId || row.correctionOfEntryId) && <p className="mb-2 text-xs">مرتبطة بالحركة <bdi dir="ltr">#{detail.data.entries.find(target => target.id === (row.targetEntryId ?? row.correctionOfEntryId))?.postingSequence}</bdi></p>}
              {row.status === "LIVE" && <div className="flex flex-wrap gap-2">
                {row.remainingDzd !== null && !row.remainingDzd.startsWith("-") && row.remainingDzd !== "0.00" && <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => open({ kind: "pay", entry: row })}>تسجيل دفعة</Button>}
                {row.remainingDzd !== null && <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => open({ kind: "correct", entry: row })}>تصحيح المبلغ</Button>}
                <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => open({ kind: "void", entry: row })}>إلغاء الحركة</Button>
              </div>}
            </TableCell>
          </TableRow>)}
        </TableBody></Table>
      </div>
      {detail.data.entries.length > 25 && <div className="mt-4 flex items-center gap-3" aria-label="صفحات الحركات"><Button variant="outline" disabled={entryPage === 1} onClick={() => setEntryPage(page => page - 1)}>السابق</Button><span>{entryPage}</span><Button variant="outline" disabled={entryPage * 25 >= detail.data.entries.length} onClick={() => setEntryPage(page => page + 1)}>التالي</Button></div>}
    </Surface>)}
    {notice && <p role="status" className="text-sm text-foreground">{notice}</p>}
    {mutation.isError && !action && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
    {action && selected && <DebtActionDialog key={`${selected}-${action.kind}-${"entry" in action ? action.entry.id : "account"}`} action={action} accountId={selected} canOpen={!detail.data?.entries.length} canAdvance={account?.partyType === "INTERNAL_WORKER" && account.direction === "RECEIVABLE"} pending={mutation.isPending} error={mutation.isError ? mutation.error.message : null} onClose={() => { if (!mutation.isPending) setAction(null) }} onSubmit={execute} />}
  </main>
}

function DebtActionDialog({ action, accountId, canOpen, canAdvance, pending, error, onClose, onSubmit }: { action: Action; accountId: string; canOpen: boolean; canAdvance: boolean; pending: boolean; error: string | null; onClose: () => void; onSubmit: (command: ExactDebtCommand) => Promise<void> }) {
  const [draft, setDraft] = useState("")
  const [reason, setReason] = useState("")
  const [method, setMethod] = useState<"CASH" | "BANK_TRANSFER" | "CHECK">("CASH")
  const [postType, setPostType] = useState<"ADJUSTMENT" | "OPENING" | "ADVANCE">("ADJUSTMENT")
  const parsed = amount(draft, action.kind === "pay")
  const maximum = action.kind === "pay" ? action.entry.remainingDzd! : undefined
  const exceeds = maximum !== undefined && parsed !== null && parseLocalizedMoneyInput(parsed).compare(parseLocalizedMoneyInput(maximum)) > 0
  const needsAmount = action.kind === "pay" || action.kind === "correct" || action.kind === "post"
  const needsReason = action.kind !== "pay" && action.kind !== "settle"
  const valid = (!needsAmount || (parsed !== null && parsed !== "0.00" && !exceeds)) && (!needsReason || Boolean(reason.trim()))
  async function submit() {
    if (!valid) return
    const base = { requestId: "pending" }
    let command: ExactDebtCommand
    switch (action.kind) {
      case "pay": command = { kind: "pay", input: { ...base, debtEntryId: action.entry.id, amountDzd: parsed!, paymentMethod: method, note: reason.trim() || null } }; break
      case "correct": command = { kind: "correct", input: { ...base, entryId: action.entry.id, amountDzd: parsed!, reason: reason.trim() } }; break
      case "void": command = { kind: "void", input: { ...base, entryId: action.entry.id, voidReason: reason.trim() } }; break
      case "post": command = { kind: "post", input: { ...base, debtAccountId: accountId, entryType: postType, signedAmountDzd: parsed!, reasonCategory: "OTHER", reasonDetail: reason.trim(), note: reason.trim() } }; break
      case "settle": command = { kind: "settle", input: { ...base, debtAccountId: accountId, note: reason.trim() || null } }; break
    }
    await onSubmit(command)
    onClose()
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose() }}><DialogContent className="max-w-md" dir="rtl">
    <DialogHeader><DialogTitle>{actionLabel[action.kind]}</DialogTitle><DialogDescription>{action.kind === "settle" ? "ستُسجل تسوية لكل حركة متبقية في هذا الحساب فقط." : action.kind === "void" ? "سيبقى سجل الحركة محفوظاً. تُلغى فقط آثارها المرتبطة دون الحركات الأخرى." : "تُحفظ الحركة في سجل الحساب مع توثيق الطرف والمبلغ."}</DialogDescription></DialogHeader>
    <form className="min-w-0 space-y-4" onSubmit={event => { event.preventDefault(); void submit().catch(() => {}) }}>
      {action.kind === "post" && <label className="block space-y-2 text-sm"><span>نوع الحركة</span><NativeSelect aria-label="نوع الحركة" value={postType} disabled={pending} onChange={event => setPostType(event.target.value as typeof postType)}><option value="ADJUSTMENT">تعديل</option>{canOpen && <option value="OPENING">رصيد افتتاحي</option>}{canAdvance && <option value="ADVANCE">سلفة للعامل</option>}</NativeSelect></label>}
      {needsAmount && <CurrencyAmountInput exact label={action.kind === "correct" ? "المبلغ المتفق عليه بعد التصحيح" : action.kind === "post" ? "مبلغ الحركة، موجب أو سالب" : "مبلغ الدفعة"} value={draft} onChange={setDraft} maxAmount={maximum} onPayFull={maximum ? () => setDraft(maximum) : undefined} disabled={pending} />}
      {action.kind === "pay" && <label className="block space-y-2 text-sm"><span>طريقة الدفع</span><NativeSelect aria-label="طريقة الدفع" value={method} onChange={event => setMethod(event.target.value as typeof method)} disabled={pending}><option value="CASH">نقداً</option><option value="BANK_TRANSFER">تحويل بنكي</option><option value="CHECK">شيك</option></NativeSelect></label>}
      <label className="block space-y-2 text-sm"><span>{needsReason ? "السبب، مطلوب" : "ملاحظة، اختيارية"}</span><Textarea aria-label={needsReason ? "السبب، مطلوب" : "ملاحظة، اختيارية"} value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} disabled={pending} /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>رجوع</Button><Button type="submit" disabled={!valid || pending}>{pending ? "جار الحفظ…" : "تأكيد الحفظ"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}
