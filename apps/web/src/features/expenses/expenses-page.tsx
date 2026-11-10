import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import type { ExactExpense, ExactExpenseWithRevisions, ExactExpensesClient, Expense, ExpenseListFilters } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { NativeSelect, Textarea } from "@/components/ui/form-controls"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TableQueryState } from "@/features/shared/table-primitives"
import { MoneyValue } from "@/features/shared/money-value"
import { useMoneyGrouping } from "@/features/preferences/money-format-preference"
import { formatExactMoney } from "@/features/shared/exact-money-display"
import { Surface } from "@/features/shared/page-primitives"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { formatAlgeriaDate } from "@/lib/algeria-time"

import { ExpenseFormDialog, ExactExpenseFormDialog, type ExpenseLookupOption } from "./expense-form-dialog"
import { buildExpenseFilters, getCurrentMonthExpenseDates } from "./expenses-filters"
import { useExpensesListQuery, useVoidExpenseMutation } from "./expenses-queries"
import { useExactExpenseQuery, useExactExpensesListQuery, useVoidExactExpenseMutation } from "./expenses-exact-queries"

const NO_SELECTION = "ALL"

export type ExpensesPageProps = {
  projects: ExpenseLookupOption[]
  employees: ExpenseLookupOption[]
  sellers: ExpenseLookupOption[]
}

function formatNumber(value: number) {
  // Money is not always whole dinars: `paymentAmountSchema` accepts fractions,
  // so show up to two decimals instead of rounding every amount to an integer.
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)
}

/**
 * Render a stored instant as the local (Africa/Algiers) calendar day it fell
 * on. The raw `expenseDate` is UTC; slicing it would show September 30 for an
 * expense entered for October 1 in Algeria (UTC+1).
 */
function formatExpenseDate(iso: string) {
  return formatAlgeriaDate(new Date(iso))
}

/**
 * The المصروفات screen (issue #411): KPI cards, a filter bar with a total
 * strip, a dense table and a "group by project" toggle over the same list.
 */
export function ExpensesPage({ projects, employees, sellers }: ExpensesPageProps) {
  const { t } = useTranslation()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [responsibleWorkerId, setResponsibleWorkerId] = useState<string | null>(null)
  // A filter opens EMPTY: empty means "everything". A seeded range silently hid
  // every expense older than it, which is the opposite of what a filter is for.
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [groupByProject, setGroupByProject] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [voidingExpense, setVoidingExpense] = useState<Expense | null>(null)
  const [voidReason, setVoidReason] = useState("")

  const filters = useMemo<ExpenseListFilters>(
    () => buildExpenseFilters({ projectId, responsibleWorkerId, fromDate, toDate }),
    [projectId, responsibleWorkerId, fromDate, toDate],
  )

  const currentMonth = getCurrentMonthExpenseDates()
  const isCurrentMonth = fromDate === currentMonth.fromDate && toDate === currentMonth.toDate
  const toggleCurrentMonth = () => {
    const month = getCurrentMonthExpenseDates()
    const selected = fromDate === month.fromDate && toDate === month.toDate
    setFromDate(selected ? "" : month.fromDate)
    setToDate(selected ? "" : month.toDate)
  }

  const query = useExpensesListQuery(filters)
  const voidMutation = useVoidExpenseMutation()

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.label])),
    [projects],
  )
  const workerNameById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.label])),
    [employees],
  )
  const sellerNameById = useMemo(
    () => new Map(sellers.map((seller) => [seller.id, seller.label])),
    [sellers],
  )

  const money = (value: number) => `${formatNumber(value)} ${t("expenses.currency")}`
  const untaggedLabel = t("expenses.untagged")

  const projectLabel = (id: string | null) =>
    id ? (projectNameById.get(id) ?? t("expenses.unknownProject")) : untaggedLabel

  const data = query.data
  const totals = data?.totals
  const items = useMemo(() => data?.items ?? [], [data])
  const taggedPercent =
    totals && totals.total > 0 ? Math.round((totals.taggedToProject / totals.total) * 100) : 0

  const itemsByGroup = useMemo(() => {
    const map = new Map<string | null, Expense[]>()
    for (const item of items) {
      const key = item.projectId
      const bucket = map.get(key)
      if (bucket) bucket.push(item)
      else map.set(key, [item])
    }
    return map
  }, [items])

  const openCreate = () => {
    setEditingExpense(null)
    setFormOpen(true)
  }

  const openEdit = (expense: Expense) => {
    setEditingExpense(expense)
    setFormOpen(true)
  }

  const openVoid = (expense: Expense) => {
    setVoidingExpense(expense)
    setVoidReason("")
  }

  const confirmVoid = async () => {
    if (!voidingExpense) return
    await voidMutation.mutateAsync({
      id: voidingExpense.id,
      reason: voidReason.trim() || null,
    })
    setVoidingExpense(null)
    setVoidReason("")
  }

  return (
    <RecordPageFrame
      title={t("expenses.title")}
      description={t("expenses.description")}
      action={<Button onClick={openCreate}>{t("expenses.actions.create")}</Button>}
    >

      <TableQueryState query={query} resource={t("expenses.title")}>
        <>
          {/* B's three KPI cards above the table */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Surface variant="card" className="p-4">
              <p className="text-xs text-ink-3">
                {t(filters.fromDate || filters.toDate ? "expenses.kpi.periodTotal" : "expenses.kpi.allTimeTotal")}
              </p>
              <p className="mt-1 text-xl font-semibold text-ink">{money(totals?.total ?? 0)}</p>
              <p className="mt-1 text-xs text-ink-4">
                {t("expenses.kpi.expenseCount", { count: totals?.count ?? 0 })}
              </p>
            </Surface>
            <Surface variant="card" className="p-4">
              <p className="text-xs text-ink-3">{t("expenses.kpi.taggedToProject")}</p>
              <p className="mt-1 text-xl font-semibold text-ink">
                {money(totals?.taggedToProject ?? 0)}
              </p>
              <p className="mt-1 text-xs text-ink-4">
                {t("expenses.kpi.percentOfTotal", { percent: taggedPercent })}
              </p>
            </Surface>
            <Surface variant="card" className="p-4">
              <p className="text-xs text-ink-3">{t("expenses.kpi.heldByWorkers")}</p>
              <p className="mt-1 text-xl font-semibold text-ink">
                {money(totals?.heldByWorkers ?? 0)}
              </p>
              <p className="mt-1 text-xs text-ink-4">
                {t("expenses.kpi.workerCount", { count: totals?.workerCount ?? 0 })}
              </p>
            </Surface>
          </div>

          {/* Filter bar */}
          <Surface variant="panel" className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-3">{t("expenses.filters.project")}</span>
                <NativeSelect
                  value={projectId ?? NO_SELECTION}
                  onChange={(event) =>
                    setProjectId(event.target.value === NO_SELECTION ? null : event.target.value)
                  }
                >
                  <option value={NO_SELECTION}>{t("expenses.filters.allProjects")}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.label}
                    </option>
                  ))}
                </NativeSelect>
              </label>

              <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-3">{t("expenses.filters.worker")}</span>
                <NativeSelect
                  value={responsibleWorkerId ?? NO_SELECTION}
                  onChange={(event) =>
                    setResponsibleWorkerId(event.target.value === NO_SELECTION ? null : event.target.value)
                  }
                >
                  <option value={NO_SELECTION}>{t("expenses.filters.allWorkers")}</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.label}
                    </option>
                  ))}
                </NativeSelect>
              </label>

              <label htmlFor="expenses-from-date" className="flex min-w-[9rem] flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-3">{t("expenses.filters.from")}</span>
                <DatePicker
                  id="expenses-from-date"
                  value={fromDate}
                  onChange={setFromDate}
                />
              </label>

              <label htmlFor="expenses-to-date" className="flex min-w-[9rem] flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-3">{t("expenses.filters.to")}</span>
                <DatePicker
                  id="expenses-to-date"
                  value={toDate}
                  onChange={setToDate}
                />
              </label>

              <Button
                variant={isCurrentMonth ? "default" : "outline"}
                aria-pressed={isCurrentMonth}
                onClick={toggleCurrentMonth}
              >
                {t("expenses.filters.currentMonth")}
              </Button>

              <Button
                variant={groupByProject ? "default" : "outline"}
                aria-pressed={groupByProject}
                onClick={() => setGroupByProject((value) => !value)}
              >
                {t("expenses.filters.groupByProject")}
              </Button>
            </div>
          </Surface>

          {/* Total strip for whatever is filtered */}
          <Surface variant="subtle" className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-xs text-ink-3">
                {t("expenses.totals.stripLabel", { count: totals?.count ?? 0 })}
              </p>
              <p className="text-2xl font-semibold text-ink">{money(totals?.total ?? 0)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs text-ink">
                {t("expenses.totals.tagged", { amount: formatNumber(totals?.taggedToProject ?? 0) })}
              </span>
              <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2">
                {t("expenses.totals.untagged", { amount: formatNumber(totals?.notTaggedToProject ?? 0) })}
              </span>
            </div>
          </Surface>

          {items.length === 0 ? (
            <EmptyState
              title={t("expenses.empty.title")}
              description={t("expenses.empty.description")}
            />
          ) : groupByProject ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {(data?.groupsByProject ?? []).map((group) => (
                <Surface key={group.projectId ?? "untagged"} variant="card" className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className={group.projectId ? "font-medium text-ink" : "font-medium text-ink-3"}>
                      {projectLabel(group.projectId)}
                    </h3>
                    <span className="font-semibold text-ink">{money(group.total)}</span>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {(itemsByGroup.get(group.projectId) ?? []).map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-ink-2">
                          <span className="text-ink-4">{formatExpenseDate(item.expenseDate)}</span>
                          {" · "}
                          {item.whatFor ?? t("expenses.noDescription")}
                        </span>
                        <span className="shrink-0">
                          {item.responsibleWorkerId ? (
                            <span className="me-2 rounded-full border border-line px-2 py-0.5 text-xs text-ink-2">
                              {workerNameById.get(item.responsibleWorkerId) ?? t("expenses.unknownWorker")}
                            </span>
                          ) : null}
                          <span className="font-medium text-ink">{formatNumber(item.amount)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Surface>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("expenses.table.date")}</TableHead>
                  <TableHead>{t("expenses.table.whatFor")}</TableHead>
                  <TableHead>{t("expenses.table.amount")}</TableHead>
                  <TableHead>{t("expenses.table.responsibleWorker")}</TableHead>
                  <TableHead>{t("expenses.table.seller")}</TableHead>
                  <TableHead>{t("expenses.table.project")}</TableHead>
                  <TableHead>{t("expenses.table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className={item.status === "VOIDED" ? "opacity-60" : undefined}>
                    <TableCell className="text-ink-3">{formatExpenseDate(item.expenseDate)}</TableCell>
                    <TableCell>
                      <span className={item.status === "VOIDED" ? "line-through" : undefined}>
                        {item.whatFor ?? t("expenses.noDescription")}
                      </span>
                      {item.status === "VOIDED" ? (
                        <span className="ms-2 rounded-full border border-line px-2 py-0.5 text-xs text-ink-3">
                          {t("expenses.status.voided")}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-medium">{formatNumber(item.amount)}</TableCell>
                    <TableCell className="text-ink-2">
                      {item.responsibleWorkerId
                        ? (workerNameById.get(item.responsibleWorkerId) ?? t("expenses.unknownWorker"))
                        : t("expenses.none")}
                    </TableCell>
                    <TableCell className="text-ink-2">
                      {item.sellerId
                        ? (sellerNameById.get(item.sellerId) ?? t("expenses.unknownSeller"))
                        : t("expenses.none")}
                    </TableCell>
                    <TableCell>
                      {item.projectId ? (
                        <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs">
                          {projectLabel(item.projectId)}
                        </span>
                      ) : (
                        <span className="text-ink-3">{untaggedLabel}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {item.status === "LIVE" ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                              {t("common.edit")}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openVoid(item)}>
                              {t("expenses.actions.void")}
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-ink-4">{t("expenses.actions.voidedNoEdit")}</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      </TableQueryState>

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        expense={editingExpense}
        projects={projects}
        employees={employees}
        sellers={sellers}
      />

      <Dialog open={Boolean(voidingExpense)} onOpenChange={(open) => { if (!open) setVoidingExpense(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("expenses.void.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink-3">{t("expenses.void.description")}</p>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("expenses.void.reason")}</span>
            <Textarea
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder={t("expenses.void.reasonPlaceholder")}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidingExpense(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={voidMutation.isPending}
              onClick={() => void confirmVoid()}
            >
              {t("expenses.void.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RecordPageFrame>
  )
}

/** Exact-money opt-in page. The numeric page above remains the application default. */
export type ExactExpensesPageProps = ExpensesPageProps & { client: ExactExpensesClient }

export function ExactExpensesPage({ projects, employees, sellers, client }: ExactExpensesPageProps) {
  const { t } = useTranslation()
  const grouped = useMoneyGrouping()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [responsibleWorkerId, setResponsibleWorkerId] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [groupByProject, setGroupByProject] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExactExpense | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [voidingExpense, setVoidingExpense] = useState<ExactExpense | null>(null)
  const [voidReason, setVoidReason] = useState("")
  const filters = useMemo<ExpenseListFilters>(
    () => buildExpenseFilters({ projectId, responsibleWorkerId, fromDate, toDate }),
    [projectId, responsibleWorkerId, fromDate, toDate],
  )
  const currentMonth = getCurrentMonthExpenseDates()
  const isCurrentMonth = fromDate === currentMonth.fromDate && toDate === currentMonth.toDate
  const toggleCurrentMonth = () => {
    const month = getCurrentMonthExpenseDates()
    const selected = fromDate === month.fromDate && toDate === month.toDate
    setFromDate(selected ? "" : month.fromDate)
    setToDate(selected ? "" : month.toDate)
  }
  const query = useExactExpensesListQuery(client, filters)
  const detailQuery = useExactExpenseQuery(client, detailId)
  const voidMutation = useVoidExactExpenseMutation(client)
  const data = query.data
  const totals = data?.totals
  const items = useMemo(() => data?.items ?? [], [data])
  const projectNames = useMemo(() => new Map(projects.map((option) => [option.id, option.label])), [projects])
  const workerNames = useMemo(() => new Map(employees.map((option) => [option.id, option.label])), [employees])
  const sellerNames = useMemo(() => new Map(sellers.map((option) => [option.id, option.label])), [sellers])
  const untagged = t("expenses.untagged")
  const projectLabel = (id: string | null) => id ? projectNames.get(id) ?? t("expenses.unknownProject") : untagged
  const money = (value: string, aggregate = false) => (
    <MoneyValue exact value={value} aggregate={aggregate} currencyLabel={t("expenses.currency")} />
  )
  const itemsByGroup = useMemo(() => {
    const groups = new Map<string | null, ExactExpense[]>()
    for (const item of items) groups.set(item.projectId, [...(groups.get(item.projectId) ?? []), item])
    return groups
  }, [items])
  const confirmVoid = async () => {
    if (!voidingExpense) return
    try {
      await voidMutation.mutateAsync({ id: voidingExpense.id, reason: voidReason.trim() || null })
      setVoidingExpense(null)
      setVoidReason("")
    } catch {
      // Keep the user's reason and dialog available for correction or retry.
    }
  }
  const detail = detailQuery.data as ExactExpenseWithRevisions | undefined
  const detailLabel = (value: string | null) => value === null
    ? <span>غير متاح <span className="sr-only">(Unavailable)</span></span>
    : money(value)

  return (
    <RecordPageFrame title={t("expenses.title")} description={t("expenses.description")}
      action={<Button onClick={() => { setEditingExpense(null); setFormOpen(true) }}>{t("expenses.actions.create")}</Button>}>
      <TableQueryState query={query} resource={t("expenses.title")}>
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Surface variant="card" className="p-4">
              <p className="text-xs text-ink-3">{t(filters.fromDate || filters.toDate ? "expenses.kpi.periodTotal" : "expenses.kpi.allTimeTotal")}</p>
              <p className="mt-1 text-xl font-semibold text-ink">{money(totals?.total ?? "0.00", true)}</p>
              <p className="mt-1 text-xs text-ink-4">{t("expenses.kpi.expenseCount", { count: totals?.count ?? 0 })}</p>
            </Surface>
            <Surface variant="card" className="p-4">
              <p className="text-xs text-ink-3">{t("expenses.kpi.taggedToProject")}</p>
              <p className="mt-1 text-xl font-semibold text-ink">{money(totals?.taggedToProject ?? "0.00", true)}</p>
              <p className="mt-1 text-xs text-ink-4">{t("expenses.kpi.percentOfTotal", { percent: exactPercent(totals?.taggedToProject ?? "0.00", totals?.total ?? "0.00") })}</p>
            </Surface>
            <Surface variant="card" className="p-4">
              <p className="text-xs text-ink-3">{t("expenses.kpi.heldByWorkers")}</p>
              <p className="mt-1 text-xl font-semibold text-ink">{money(totals?.heldByWorkers ?? "0.00", true)}</p>
              <p className="mt-1 text-xs text-ink-4">{t("expenses.kpi.workerCount", { count: totals?.workerCount ?? 0 })}</p>
            </Surface>
          </div>
          <Surface variant="panel" className="p-4"><div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5"><span className="text-xs font-medium text-ink-3">{t("expenses.filters.project")}</span>
              <NativeSelect value={projectId ?? NO_SELECTION} onChange={(event) => setProjectId(event.target.value === NO_SELECTION ? null : event.target.value)}>
                <option value={NO_SELECTION}>{t("expenses.filters.allProjects")}</option>{projects.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </NativeSelect></label>
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5"><span className="text-xs font-medium text-ink-3">{t("expenses.filters.worker")}</span>
              <NativeSelect value={responsibleWorkerId ?? NO_SELECTION} onChange={(event) => setResponsibleWorkerId(event.target.value === NO_SELECTION ? null : event.target.value)}>
                <option value={NO_SELECTION}>{t("expenses.filters.allWorkers")}</option>{employees.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </NativeSelect></label>
            <label htmlFor="exact-expenses-from-date" className="flex min-w-[9rem] flex-col gap-1.5"><span className="text-xs font-medium text-ink-3">{t("expenses.filters.from")}</span><DatePicker id="exact-expenses-from-date" value={fromDate} onChange={setFromDate} /></label>
            <label htmlFor="exact-expenses-to-date" className="flex min-w-[9rem] flex-col gap-1.5"><span className="text-xs font-medium text-ink-3">{t("expenses.filters.to")}</span><DatePicker id="exact-expenses-to-date" value={toDate} onChange={setToDate} /></label>
            <Button variant={isCurrentMonth ? "default" : "outline"} aria-pressed={isCurrentMonth} onClick={toggleCurrentMonth}>{t("expenses.filters.currentMonth")}</Button>
            <Button variant={groupByProject ? "default" : "outline"} aria-pressed={groupByProject} onClick={() => setGroupByProject((value) => !value)}>{t("expenses.filters.groupByProject")}</Button>
          </div></Surface>
          <Surface variant="subtle" className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="text-xs text-ink-3">{t("expenses.totals.stripLabel", { count: totals?.count ?? 0 })}</p><p className="text-2xl font-semibold text-ink">{money(totals?.total ?? "0.00", true)}</p></div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs text-ink">{t("expenses.totals.tagged", { amount: formatExactMoney(totals?.taggedToProject ?? "0.00", { aggregate: true, grouped }).text })}</span>
              <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2">{t("expenses.totals.untagged", { amount: formatExactMoney(totals?.notTaggedToProject ?? "0.00", { aggregate: true, grouped }).text })}</span>
            </div>
          </Surface>
          {items.length === 0 ? <EmptyState title={t("expenses.empty.title")} description={t("expenses.empty.description")} /> : groupByProject ? (
            <div className="grid gap-4 xl:grid-cols-2">{(data?.groupsByProject ?? []).map((group) => <Surface key={group.projectId ?? "untagged"} variant="card" className="p-4">
              <div className="flex items-center justify-between gap-3"><h3 className="font-medium text-ink">{projectLabel(group.projectId)}</h3>{money(group.total, true)}</div>
              <ul className="mt-3 space-y-2">{(itemsByGroup.get(group.projectId) ?? []).map((item) => <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink-2"><span className="text-ink-4">{formatExpenseDate(item.expenseDate)}</span> · {item.whatFor ?? t("expenses.noDescription")}{item.status === "VOIDED" ? ` · ${t("expenses.status.voided")}` : ""}</span>
                <span className="shrink-0">{money(item.amount)} <Button size="sm" variant="outline" onClick={() => setDetailId(item.id)}>التفاصيل</Button></span>
              </li>)}</ul></Surface>)}</div>
          ) : <Table><TableHeader><TableRow><TableHead>{t("expenses.table.date")}</TableHead><TableHead>{t("expenses.table.whatFor")}</TableHead><TableHead>{t("expenses.table.amount")}</TableHead><TableHead>{t("expenses.table.responsibleWorker")}</TableHead><TableHead>{t("expenses.table.seller")}</TableHead><TableHead>{t("expenses.table.project")}</TableHead><TableHead>التفاصيل</TableHead><TableHead>{t("expenses.table.actions")}</TableHead></TableRow></TableHeader>
            <TableBody>{items.map((item) => <TableRow key={item.id} className={item.status === "VOIDED" ? "opacity-60" : undefined}>
              <TableCell className="text-ink-3">{formatExpenseDate(item.expenseDate)}</TableCell><TableCell><span className={item.status === "VOIDED" ? "line-through" : undefined}>{item.whatFor ?? t("expenses.noDescription")}</span>{item.status === "VOIDED" ? <span className="ms-2 rounded-full border border-line px-2 py-0.5 text-xs text-ink-3">{t("expenses.status.voided")}</span> : null}</TableCell>
              <TableCell>{money(item.amount)}</TableCell><TableCell className="text-ink-2">{item.responsibleWorkerId ? workerNames.get(item.responsibleWorkerId) ?? t("expenses.unknownWorker") : t("expenses.none")}</TableCell><TableCell className="text-ink-2">{item.sellerId ? sellerNames.get(item.sellerId) ?? t("expenses.unknownSeller") : t("expenses.none")}</TableCell><TableCell>{projectLabel(item.projectId)}</TableCell>
              <TableCell><Button size="sm" variant="outline" onClick={() => setDetailId(item.id)}>التفاصيل</Button></TableCell><TableCell>{item.status === "LIVE" ? <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingExpense(item); setFormOpen(true) }}>{t("common.edit")}</Button><Button size="sm" variant="outline" onClick={() => { setVoidingExpense(item); setVoidReason("") }}>{t("expenses.actions.void")}</Button></div> : t("expenses.actions.voidedNoEdit")}</TableCell>
            </TableRow>)}</TableBody></Table>}
        </>
      </TableQueryState>
      <ExactExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} expense={editingExpense} projects={projects} employees={employees} sellers={sellers} client={client} />
      <Dialog open={Boolean(detailId)} onOpenChange={(open) => { if (!open) setDetailId(null) }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>تفاصيل المصروف وسجل التعديلات</DialogTitle></DialogHeader>
        {detailQuery.isPending ? <p role="status">جارٍ تحميل التفاصيل</p> : detailQuery.isError ? <p role="alert">تعذر تحميل سجل المصروف</p> : detail ? <div className="max-h-[70vh] space-y-4 overflow-y-auto">
          <dl className="grid gap-3 sm:grid-cols-2"><dt>المبلغ</dt><dd>{money(detail.amount)}</dd><dt>الحالة</dt><dd>{detail.status === "VOIDED" ? t("expenses.status.voided") : "ساري"}</dd><dt>التاريخ</dt><dd>{formatExpenseDate(detail.expenseDate)}</dd><dt>الوصف</dt><dd>{detail.whatFor ?? t("expenses.noDescription")}</dd><dt>ملاحظة</dt><dd>{detail.note ?? t("expenses.none")}</dd><dt>المنشئ</dt><dd>{detail.actorLabel ?? detail.actorUserId}</dd><dt>معرّف العملية</dt><dd>{detail.transactionId ?? t("expenses.none")}</dd>{detail.status === "VOIDED" && <><dt>سبب الإلغاء</dt><dd>{detail.voidReason ?? t("expenses.none")}</dd><dt>ألغاه</dt><dd>{detail.voidedBy ?? t("expenses.none")}</dd><dt>وقت الإلغاء</dt><dd>{detail.voidedAt ?? t("expenses.none")}</dd></>}</dl>
          <h3 className="font-semibold">سجل التعديلات</h3><ol className="space-y-3">{detail.revisions.map((revision) => <li key={revision.id} className="border-t border-line pt-3"><p>{detailLabel(revision.previousAmount)} → {money(revision.newAmount)}</p><p>السبب: {revision.reason ?? t("expenses.none")}</p><p>الفاعل: {revision.actorLabel ?? revision.actorUserId}</p><p>الوقت: {revision.createdAt}</p><p>معرّف العملية: {revision.transactionId ?? t("expenses.none")}</p></li>)}</ol>
        </div> : null}<DialogFooter><Button variant="outline" onClick={() => setDetailId(null)}>{t("common.close")}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(voidingExpense)} onOpenChange={(open) => { if (!open) setVoidingExpense(null) }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{t("expenses.void.title")}</DialogTitle></DialogHeader><p className="text-sm text-ink-3">{t("expenses.void.description")}</p>
        <label className="flex flex-col gap-2"><span className="text-sm font-medium">{t("expenses.void.reason")}</span><Textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder={t("expenses.void.reasonPlaceholder")} /></label>
        <DialogFooter><Button variant="outline" onClick={() => setVoidingExpense(null)}>{t("common.cancel")}</Button><Button disabled={voidMutation.isPending} onClick={() => void confirmVoid()}>{t("expenses.void.confirm")}</Button></DialogFooter></DialogContent></Dialog>
    </RecordPageFrame>
  )
}

function exactPercent(part: string, total: string) {
  const coefficient = (value: string) => {
    const [whole, fraction = "00"] = value.split(".")
    return BigInt(`${whole}${fraction}`)
  }
  const denominator = coefficient(total)
  if (denominator === 0n) return 0
  const numerator = coefficient(part) * 100n
  // Round positive percentage to the nearest integer without converting money to Number.
  return Number((numerator + denominator / 2n) / denominator)
}
