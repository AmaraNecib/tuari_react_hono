import { useMemo, useState } from "react"
import { DirectionProvider } from "@base-ui/react/direction-provider"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import type { ExactDebtsClient, ExactDebtDetail, ExactDebtAccount } from "@tuari/contracts"
import { AppDate } from "@/components/app-date"
import { Button } from "@/components/ui/button"
import { CurrencyAmountInput } from "@/components/ui/currency-amount-input"
import { NativeSelect, Textarea } from "@/components/ui/form-controls"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Surface } from "@/features/shared/page-primitives"
import { AmountDisplay as MoneyValue, DataTable, EmptyState, PageHeader, Pagination, SectionHeader, StatCard, StatusBadge, paginate } from "@/components/ui"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { parseLocalizedMoneyInput } from "@/features/shared/exact-money-input"
import { getCachedSessionUserId } from "@/features/app-shell/workspace-keys"
import { Money, sumMoneyHistory } from "@tuari/contracts"
import { useExactDebtCommand, useExactDebtDetail, useExactDebtSummary, type ExactDebtCommand } from "./debts-exact-queries"
import { ManualSettlementLink } from "./manual-settlement-link"
import type { ManualSettlementClient } from "./manual-settlement-panel"
import { EmployeePayrollDebtSection } from "./employee-payroll-debt-section"

export type ExactDebtPartyOption = { id: string; label: string; phone?: string; partyType: ExactDebtAccount["partyType"] }
type Entry = ExactDebtDetail["entries"][number]
type Action = { kind: "pay" | "correct" | "void"; entry: Entry } | { kind: "post" | "settle" }
const actionLabel = { pay: "exactDebts.pay", correct: "exactDebts.correct", void: "exactDebts.void", post: "exactDebts.post", settle: "exactDebts.settle" }
// Client identity bounds retention without keeping discarded clients alive.
// Owner is part of each intent signature, so remounts preserve uncertain keys
// without sharing them across authenticated users.
const requestScopes = new WeakMap<ExactDebtsClient, Map<string, string>>()
const entryLabel = { OPENING: "exactDebts.opening", ADJUSTMENT: "exactDebts.adjustment", ADVANCE: "exactDebts.advance", PAYMENT: "exactDebts.payment", SETTLEMENT: "exactDebts.settlement" }
function amount(value: string, positive: boolean) {
  try {
    const parsed = parseLocalizedMoneyInput(value)
    const comparison = parsed.compare(parseLocalizedMoneyInput("0"))
    return positive ? comparison > 0 ? parsed.toWire() : null : parsed.toWire()
  } catch { return null }
}

/** Authenticated debt ledger using the exact financial client. */
export function ExactDebtsPage({ client, parties, scopedParty, payrollEmployees, manualSettlementClient }: { manualSettlementClient?: ManualSettlementClient; client: ExactDebtsClient; parties: ExactDebtPartyOption[]; scopedParty?: ExactDebtPartyOption; payrollEmployees?: ExactDebtPartyOption[] }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState("ledger")
  const [accountPage, setAccountPage] = useState(1)
  const [entryPage, setEntryPage] = useState(1)
  const [search, setSearch] = useState("")
  const scopedParties = scopedParty ? parties.filter(row => row.id === scopedParty.id && row.partyType === scopedParty.partyType) : parties
  const partyNames = useMemo(() => new Map(scopedParties.map(row => [row.id, row.label])), [scopedParties])
  const [action, setAction] = useState<Action | null>(null)
  const [partyId, setPartyId] = useState(scopedParty?.id ?? scopedParties[0]?.id ?? "")
  const [direction, setDirection] = useState<"PAYABLE" | "RECEIVABLE">("PAYABLE")
  const [opening, setOpening] = useState("")
  const [reason, setReason] = useState("")
  const [notice, setNotice] = useState("")
  const summary = useExactDebtSummary(client)
  const detailAccountId = scopedParty && summary.data?.accounts.some(row => row.id === selected && row.partyType === scopedParty.partyType && (row.workerId ?? row.externalCounterpartyId) === scopedParty.id) ? selected : scopedParty ? null : selected
  const detail = useExactDebtDetail(client, detailAccountId)
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
    setNotice(t("exactDebts.saved"))
  }
  function open(next: Action) { mutation.reset(); setAction(next); setNotice("") }
  const chosenParty = scopedParty ?? scopedParties.find(row => row.id === partyId)
  const openingValue = opening.trim() ? amount(opening, false) : undefined
  const canCreate = chosenParty && reason.trim() && (openingValue === undefined || (openingValue !== null && !openingValue.startsWith("-")))
  const account = detail.data?.account
  const scopedAccounts = summary.data?.accounts.filter(row => !scopedParty || (row.partyType === scopedParty.partyType && (row.workerId ?? row.externalCounterpartyId) === scopedParty.id)) ?? []
  const matchingAccounts = scopedAccounts.filter(row => {
    const party = scopedParties.find(party => party.id === (row.workerId ?? row.externalCounterpartyId) && party.partyType === row.partyType)
    return [party?.label ?? "", party?.phone ?? ""].some(value => value.includes(search.trim()))
  })
  const scopedGross = (direction: ExactDebtAccount["direction"]) => sumMoneyHistory(scopedAccounts.flatMap(row => {
    const balance = Money.parse(row.currentBalance)
    const sameDirection = row.direction === direction
    const owed = sameDirection ? balance.compare(Money.parse("0")) > 0 : balance.compare(Money.parse("0")) < 0
    return owed ? [sameDirection ? balance : balance.negate()] : []
  }))
  const scopedPayableDzd = scopedGross("PAYABLE")
  const scopedReceivableDzd = scopedGross("RECEIVABLE")
  const accountPaging = paginate(matchingAccounts, accountPage, 15)
  // Running balances follow posting order, even when a refund has an earlier event date.
  const orderedEntries = (detail.data?.entries ?? []).slice().sort((a, b) => b.postingSequence - a.postingSequence)
  const entryPaging = paginate(orderedEntries, entryPage, 10)
  // Commit clamps to state as well as the visible slice. A later refetch that
  // grows the dataset must not resurrect a page discarded by an earlier shrink.
  if (accountPage !== accountPaging.page) setAccountPage(accountPaging.page)
  if (entryPage !== entryPaging.page) setEntryPage(entryPaging.page)
  const shownAccounts = accountPaging.rows
  const shownEntries = entryPaging.rows
  const pagingProps = (paging: typeof accountPaging | typeof entryPaging, label: string, onPageChange: (page: number) => void) => ({ ...paging, label, onPageChange, previousLabel: t("exactDebts.previous"), nextLabel: t("exactDebts.next"), countLabel: t("exactDebts.pageCount", { start: paging.start, end: paging.end, total: paging.total, page: paging.page, pages: paging.pages }) })
  return <main dir="rtl" className="min-w-0 space-y-6" aria-label={t("exactDebts.ledgerLabel")}>
    <PageHeader title={t("exactDebts.title")} description={t("exactDebts.description")} />
    {summary.isPending ? <p role="status">{t("exactDebts.loadingAccounts")}</p> : summary.isError ? <div role="alert">{t("exactDebts.accountsError")} <Button variant="outline" onClick={() => void summary.refetch()}>{t("exactDebts.retry")}</Button></div> : <>
      <div className="flex flex-wrap gap-x-10 gap-y-4 border-y border-border py-4">
        <StatCard label={t("exactDebts.payable")} value={<MoneyValue aggregate value={scopedParty ? scopedPayableDzd : summary.data.grossPayableDzd} currencyLabel={t("exactDebts.currency")} variant="detail" />} />
        <StatCard label={t("exactDebts.receivable")} value={<MoneyValue aggregate value={scopedParty ? scopedReceivableDzd : summary.data.grossReceivableDzd} currencyLabel={t("exactDebts.currency")} variant="detail" />} />
      </div>
      <label className="block text-sm">{t("exactDebts.search")}<input aria-label={t("exactDebts.search")} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3" value={search} onChange={event => { setSearch(event.target.value); setAccountPage(1) }} /></label>
      <nav aria-label={t("exactDebts.accounts")} className="flex max-h-48 flex-wrap gap-2 overflow-y-auto border-b border-border pb-3">
        {shownAccounts.map(row => <Button key={row.id} aria-pressed={row.id === selected} disabled={mutation.isPending} variant={row.id === selected ? "default" : "outline"} className="h-auto min-h-11 max-w-full flex-wrap py-2" onClick={() => { setSelected(row.id); setEntryPage(1); setTab("ledger"); setAction(null); mutation.reset() }}>
          {partyNames.get(row.workerId ?? row.externalCounterpartyId ?? "") ?? t("exactDebts.unknownParty")} · {row.direction === "PAYABLE" ? t("exactDebts.payable") : t("exactDebts.receivable")} <MoneyValue exact value={row.currentBalance} currencyLabel={t("exactDebts.currency")} />
        </Button>)}
        {!matchingAccounts.length && <EmptyState title={t("exactDebts.emptyAccounts")} description={t("exactDebts.selectHelp")} action={{ label: t("exactDebts.accountsTab"), onClick: () => setTab("accounts") }} />}
      </nav>
      <Pagination {...pagingProps(accountPaging, t("exactDebts.accountPages"), setAccountPage)} />
    </>}
    <DirectionProvider direction="rtl">
    <Tabs value={tab} onValueChange={value => setTab(String(value))}>
    <TabsList aria-label={t("exactDebts.workflows")} className="max-w-full overflow-x-auto">
      <TabsTrigger value="ledger">{t("exactDebts.ledgerTab")}</TabsTrigger>
      <TabsTrigger value="accounts">{t("exactDebts.accountsTab")}</TabsTrigger>
      <TabsTrigger value="settlement">{t("exactDebts.settlementTab")}</TabsTrigger>
      <TabsTrigger value="party">{t("exactDebts.partyTab")}</TabsTrigger>
    </TabsList>
    <TabsContent value="accounts">
    <Surface className="min-w-0 p-5" variant="card">
      <SectionHeader className="mb-4" title={t("exactDebts.createTitle")} />
      <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={event => {
        event.preventDefault()
        if (!canCreate || !chosenParty) return
        void execute({ kind: "create", input: { requestId: "pending", partyType: chosenParty.partyType,
          ...(chosenParty.partyType === "INTERNAL_WORKER" ? { workerId: chosenParty.id } : { externalCounterpartyId: chosenParty.id }),
          direction, ...(openingValue !== undefined && openingValue !== null ? { openingBalanceDzd: openingValue } : {}), reasonCategory: "OTHER", reasonDetail: reason.trim(), note: reason.trim() } }).then(() => { setOpening(""); setReason("") }).catch(() => {})
      }}>
        <label className="space-y-2 text-sm"><span>{t("exactDebts.party")}</span><NativeSelect aria-label={t("exactDebts.party")} value={scopedParty?.id ?? partyId} disabled={mutation.isPending || Boolean(scopedParty)} onChange={event => setPartyId(event.target.value)}>{!parties.length && <option value="">{t("exactDebts.emptyParties")}</option>}{scopedParties.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</NativeSelect></label>
        <label className="space-y-2 text-sm"><span>{t("exactDebts.direction")}</span><NativeSelect aria-label={t("exactDebts.direction")} value={direction} disabled={mutation.isPending} onChange={event => setDirection(event.target.value as typeof direction)}><option value="PAYABLE">{t("exactDebts.payable")}</option><option value="RECEIVABLE">{t("exactDebts.receivable")}</option></NativeSelect></label>
        <CurrencyAmountInput exact label={t("exactDebts.optionalOpening")} value={opening} onChange={setOpening} disabled={mutation.isPending} />
        <label className="space-y-2 text-sm"><span>{t("exactDebts.reason")}</span><Textarea aria-label={t("exactDebts.reason")} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} disabled={mutation.isPending} /></label>
        <div><Button type="submit" disabled={!canCreate || mutation.isPending}>{t("exactDebts.saveAccount")}</Button></div>
      </form>
    </Surface>
    </TabsContent>
    <TabsContent value="ledger">
    {!detailAccountId && <EmptyState title={t("exactDebts.selectAccount")} description={t("exactDebts.selectHelp")} />}
    {detailAccountId && (detail.isPending ? <p role="status">{t("exactDebts.loadingEntries")}</p> : detail.isError ? <div role="alert">{t("exactDebts.entriesError")} <Button variant="outline" onClick={() => void detail.refetch()}>{t("exactDebts.retry")}</Button></div> : account && <Surface className="min-w-0 p-5" variant="card">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="text-lg font-semibold">{t("exactDebts.entriesTitle")} {account.direction === "PAYABLE" ? t("exactDebts.payable") : t("exactDebts.receivable")}</h2><p className="mt-1"><MoneyValue exact value={account.currentBalance} currencyLabel={t("exactDebts.currency")} variant="detail" /></p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => open({ kind: "post" })}>{t("exactDebts.post")}</Button></div>
      </div>
      <DataTable label={t("exactDebts.entriesTable")} pagination={pagingProps(entryPaging, t("exactDebts.entryPages"), setEntryPage)}>
        <Table><TableHeader><TableRow><TableHead>{t("exactDebts.typeDate")}</TableHead><TableHead>{t("exactDebts.amount")}</TableHead><TableHead>{t("exactDebts.balanceAfter")}</TableHead><TableHead>{t("exactDebts.remaining")}</TableHead><TableHead>{t("exactDebts.auditActions")}</TableHead></TableRow></TableHeader><TableBody>
          {shownEntries.map(row => <TableRow key={row.id} data-entry-id={row.id} className={row.status === "VOIDED" ? "opacity-65" : undefined}>
            <TableCell><div>{t(entryLabel[row.entryType])}{row.correctionOfEntryId ? t("exactDebts.correctionSuffix") : ""}{row.status === "VOIDED" ? t("exactDebts.voidSuffix") : ""}</div><div className="mt-1 text-xs text-muted-foreground"><AppDate value={row.entryDate} includeTime timeStyle="medium" /></div></TableCell>
            <TableCell><MoneyValue exact signed value={row.signedAmountDzd} currencyLabel={t("exactDebts.currency")} /></TableCell><TableCell><MoneyValue exact value={row.balanceAfterDzd} currencyLabel={t("exactDebts.currency")} /></TableCell>
            <TableCell>{row.remainingDzd !== null ? <MoneyValue exact value={row.remainingDzd} currencyLabel={t("exactDebts.currency")} /> : "—"}</TableCell>
            <TableCell className="min-w-56">{manualSettlementClient && account.partyType === "EXTERNAL_COUNTERPARTY" && <ManualSettlementLink client={manualSettlementClient} accountId={account.id} entryId={row.id} entries={detail.data?.entries} />}<p className="mb-2 max-w-72 whitespace-normal break-words text-xs text-muted-foreground">{row.note} {row.actorLabel}{row.voidReason ? ` · ${row.voidReason}` : ""}</p>
              {(row.targetEntryId || row.correctionOfEntryId) && <p className="mb-2 text-xs">{t("exactDebts.linkedEntry")} <bdi dir="ltr">#{detail.data.entries.find(target => target.id === (row.targetEntryId ?? row.correctionOfEntryId))?.postingSequence}</bdi></p>}
              {row.status === "LIVE" && !row.producerType && <div className="flex flex-wrap gap-2">
                {!row.targetEntryId && !row.correctionOfEntryId && row.remainingDzd !== null && !row.remainingDzd.startsWith("-") && row.remainingDzd !== "0.00" && <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => open({ kind: "pay", entry: row })}>{t("exactDebts.pay")}</Button>}
                {!row.targetEntryId && !row.correctionOfEntryId && row.remainingDzd !== null && <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => open({ kind: "correct", entry: row })}>{t("exactDebts.correctAmount")}</Button>}
                <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => open({ kind: "void", entry: row })}>{t("exactDebts.void")}</Button>
              </div>}
            </TableCell>
          </TableRow>)}
        </TableBody></Table>
      </DataTable>
    </Surface>)}
    </TabsContent>
    <TabsContent value="settlement" className="space-y-4">
      <SectionHeader title={t("exactDebts.settlementTab")} description={t("exactDebts.settleHelp")} />
      {account && detailAccountId ? <>
        <Button disabled={mutation.isPending || !detail.data?.entries.some(row => row.remainingDzd !== null && row.remainingDzd !== "0.00" && !row.producerType && !row.targetEntryId && !row.correctionOfEntryId)} onClick={() => open({ kind: "settle" })}>{t("exactDebts.settle")}</Button>
        <ul className="space-y-4">{orderedEntries.filter(row => row.entryType === "SETTLEMENT").map(row => <li key={row.id} className="space-y-3 border-b border-border py-4"><AppDate value={row.entryDate} /><MoneyValue signed value={row.signedAmountDzd} currencyLabel={t("exactDebts.currency")} /><StatusBadge label={t(row.status === "VOIDED" ? "exactDebts.voidStatus" : "exactDebts.liveStatus")} tone={row.status === "VOIDED" ? "bad" : "good"} /><span>{row.note} {row.actorLabel}</span>{manualSettlementClient && account.partyType === "EXTERNAL_COUNTERPARTY" && <ManualSettlementLink client={manualSettlementClient} accountId={account.id} entryId={row.id} entries={detail.data?.entries} />}</li>)}</ul>
        {!orderedEntries.some(row => row.entryType === "SETTLEMENT") && <EmptyState title={t("exactDebts.noSettlements")} description={t("exactDebts.settleHelp")} />}
      </> : <EmptyState title={t("exactDebts.selectAccount")} description={t("exactDebts.selectHelp")} />}
    </TabsContent>
    <TabsContent value="party" className="space-y-4">
      <SectionHeader title={t("exactDebts.partyTab")} />
      {account ? <p>{partyNames.get(account.workerId ?? account.externalCounterpartyId ?? "") ?? t("exactDebts.unknownParty")}</p> : <p>{scopedParty?.label ?? t("exactDebts.selectAccount")}</p>}
      {(!scopedParty || scopedParty.partyType === "INTERNAL_WORKER") && <EmployeePayrollDebtSection employees={payrollEmployees ?? scopedParties.filter(row => row.partyType === "INTERNAL_WORKER")} scopedParty={scopedParty} />}
    </TabsContent>
    </Tabs>
    </DirectionProvider>
    {notice && <p role="status" className="text-sm text-foreground">{notice}</p>}
    {mutation.isError && !action && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
    {action && detailAccountId && <DebtActionDialog key={`${detailAccountId}-${action.kind}-${"entry" in action ? action.entry.id : "account"}`} action={action} accountId={detailAccountId} canOpen={!detail.data?.entries.length} canAdvance={account?.partyType === "INTERNAL_WORKER" && account.direction === "RECEIVABLE"} pending={mutation.isPending} error={mutation.isError ? mutation.error.message : null} onClose={() => { if (!mutation.isPending) setAction(null) }} onSubmit={execute} />}
  </main>
}

function DebtActionDialog({ action, accountId, canOpen, canAdvance, pending, error, onClose, onSubmit }: { action: Action; accountId: string; canOpen: boolean; canAdvance: boolean; pending: boolean; error: string | null; onClose: () => void; onSubmit: (command: ExactDebtCommand) => Promise<void> }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState("")
  const [reason, setReason] = useState("")
  const [method, setMethod] = useState<"CASH" | "BANK_TRANSFER" | "CHECK">("CASH")
  const [postType, setPostType] = useState<"ADJUSTMENT" | "OPENING" | "ADVANCE">("ADJUSTMENT")
  const parsed = amount(draft, action.kind === "pay")
  const maximum = action.kind === "pay" ? action.entry.remainingDzd! : undefined
  const exceeds = maximum !== undefined && parsed !== null && parseLocalizedMoneyInput(parsed).compare(parseLocalizedMoneyInput(maximum)) > 0
  const projectedRemaining = action.kind === "pay" && parsed !== null && !exceeds
    ? parseLocalizedMoneyInput(maximum!).subtract(parseLocalizedMoneyInput(parsed))
    : null
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
    <DialogHeader><DialogTitle>{t(actionLabel[action.kind])}</DialogTitle><DialogDescription>{action.kind === "settle" ? t("exactDebts.settleHelp") : action.kind === "void" ? t("exactDebts.voidHelp") : t("exactDebts.actionHelp")}</DialogDescription></DialogHeader>
    <form className="min-w-0 space-y-4" onSubmit={event => { event.preventDefault(); void submit().catch(() => {}) }}>
      {action.kind === "post" && <label className="block space-y-2 text-sm"><span>{t("exactDebts.entryType")}</span><NativeSelect aria-label={t("exactDebts.entryType")} value={postType} disabled={pending} onChange={event => setPostType(event.target.value as typeof postType)}><option value="ADJUSTMENT">{t("exactDebts.adjustment")}</option>{canOpen && <option value="OPENING">{t("exactDebts.opening")}</option>}{canAdvance && <option value="ADVANCE">{t("exactDebts.workerAdvance")}</option>}</NativeSelect></label>}
      {needsAmount && <CurrencyAmountInput exact label={action.kind === "correct" ? t("exactDebts.correctedAmount") : action.kind === "post" ? t("exactDebts.signedAmount") : t("exactDebts.paymentAmount")} value={draft} onChange={setDraft} maxAmount={maximum} onPayFull={maximum ? () => setDraft(maximum) : undefined} disabled={pending} />}
      {action.kind === "pay" && projectedRemaining !== null && <section aria-label={t("debts.payment.preview")} aria-live="polite" className="rounded-lg border border-border p-3 text-sm"><p>{t("debts.payment.preview")}</p><p>{t("debts.payment.amount")}: <MoneyValue exact value={parsed!} currencyLabel={t("exactDebts.currency")} /></p><p>{t("debts.payment.balanceAfter")}: <MoneyValue exact value={projectedRemaining.toWire()} currencyLabel={t("exactDebts.currency")} /></p></section>}
      {action.kind === "pay" && <label className="block space-y-2 text-sm"><span>{t("exactDebts.paymentMethod")}</span><NativeSelect aria-label={t("exactDebts.paymentMethod")} value={method} onChange={event => setMethod(event.target.value as typeof method)} disabled={pending}><option value="CASH">{t("exactDebts.cash")}</option><option value="BANK_TRANSFER">{t("exactDebts.bankTransfer")}</option><option value="CHECK">{t("exactDebts.check")}</option></NativeSelect></label>}
      <label className="block space-y-2 text-sm"><span>{needsReason ? t("exactDebts.requiredReason") : t("exactDebts.optionalNote")}</span><Textarea aria-label={needsReason ? t("exactDebts.requiredReason") : t("exactDebts.optionalNote")} value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} disabled={pending} /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>{t("exactDebts.back")}</Button><Button type="submit" disabled={!valid || pending}>{pending ? t("exactDebts.saving") : t("exactDebts.confirm")}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}
