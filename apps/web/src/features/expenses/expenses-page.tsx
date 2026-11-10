import { useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import type { ExactExpense, ExactExpensesClient, Expense, ExpenseListFilters, ExpenseListOutput, VoidExpenseInput } from "@tuari/contracts"

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
import { TableQueryState, type TableQuery } from "@/features/shared/table-primitives"
import { MoneyValue } from "@/features/shared/money-value"
import { useMoneyGrouping } from "@/features/preferences/money-format-preference"
import { formatExactMoney } from "@/features/shared/exact-money-display"
import { Surface } from "@/features/shared/page-primitives"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { formatAlgeriaDate } from "@/lib/algeria-time"

import { ExpenseFormDialog, ExactExpenseFormDialog, type ExpenseFormDialogProps, type ExpenseLookupOption } from "./expense-form-dialog"
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
type ExpenseRecord<Amount> = Omit<Expense, "amount"> & { amount: Amount }
type ListData<Amount, Record extends ExpenseRecord<Amount>> = {
  items: Record[]
  totals: Omit<ExpenseListOutput["totals"], "total" | "taggedToProject" | "notTaggedToProject" | "heldByWorkers"> & {
    total: Amount; taggedToProject: Amount; notTaggedToProject: Amount; heldByWorkers: Amount
  }
  groupsByProject: Array<{ projectId: string | null; total: Amount; count: number }>
}
type FormViewProps<Record> = Omit<ExpenseFormDialogProps, "expense"> & { expense?: Record | null }
type PageViewProps<Amount, Record extends ExpenseRecord<Amount>> = ExpensesPageProps & {
  zero: Amount
  useListQuery: (filters: ExpenseListFilters) => Omit<TableQuery, "data"> & { data: ListData<Amount, Record> | undefined }
  useVoidMutation: () => { isPending: boolean; mutateAsync: (input: VoidExpenseInput) => Promise<unknown> }
  formatAmount: (value: Amount) => string
  renderAmount: (value: Amount, aggregate?: boolean) => ReactNode
  percentage: (part: Amount, total: Amount) => number
  renderForm: (props: FormViewProps<Record>) => ReactNode
  renderDetail?: (id: string | null, close: () => void, edit: (expense: Record) => void, voidExpense: (expense: Record) => void) => ReactNode
}

export function ExpensesPage(props: ExpensesPageProps) {
  const { t } = useTranslation()
  return <ExpensePageView<number, Expense> {...props} zero={0} useListQuery={useExpensesListQuery} useVoidMutation={useVoidExpenseMutation}
    formatAmount={formatNumber} renderAmount={value => `${formatNumber(value)} ${t("expenses.currency")}`}
    percentage={(part, total) => total > 0 ? Math.round(part / total * 100) : 0}
    renderForm={form => <ExpenseFormDialog {...form} />} />
}

function ExpensePageView<Amount, Record extends ExpenseRecord<Amount>>({
  projects, employees, sellers, zero, useListQuery, useVoidMutation, formatAmount, renderAmount, percentage, renderForm, renderDetail,
}: PageViewProps<Amount, Record>) {
  const { t } = useTranslation()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [responsibleWorkerId, setResponsibleWorkerId] = useState<string | null>(null)
  // A filter opens EMPTY: empty means "everything". A seeded range silently hid
  // every expense older than it, which is the opposite of what a filter is for.
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [groupByProject, setGroupByProject] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Record | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [voidingExpense, setVoidingExpense] = useState<Record | null>(null)
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

  const query = useListQuery(filters)
  const voidMutation = useVoidMutation()

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

  const money = renderAmount
  const untaggedLabel = t("expenses.untagged")

  const projectLabel = (id: string | null) =>
    id ? (projectNameById.get(id) ?? t("expenses.unknownProject")) : untaggedLabel

  const data = query.data
  const totals = data?.totals
  const items = useMemo(() => data?.items ?? [], [data])
  const taggedPercent = totals ? percentage(totals.taggedToProject, totals.total) : 0

  const itemsByGroup = useMemo(() => {
    const map = new Map<string | null, Record[]>()
    for (const item of items) {
      const key = item.projectId
      const bucket = map.get(key)
      if (bucket) bucket.push(item)
      else map.set(key, [item])
    }
    return map
  }, [items])

  const groups = data?.groupsByProject ?? []
  const displayedGroups = renderDetail
    ? [...groups, ...[...itemsByGroup.keys()].filter(id => !groups.some(group => group.projectId === id)).map(projectId => ({ projectId, total: zero, count: 0 }))]
    : groups

  const openCreate = () => {
    setEditingExpense(null)
    setFormOpen(true)
  }

  const openEdit = (expense: Record) => {
    setEditingExpense(expense)
    setFormOpen(true)
  }

  const openVoid = (expense: Record) => {
    setVoidingExpense(expense)
    setVoidReason("")
  }

  const confirmVoid = async () => {
    if (!voidingExpense || voidMutation.isPending) return
    try {
      await voidMutation.mutateAsync({ id: voidingExpense.id, reason: voidReason.trim() || null })
      setVoidingExpense(null)
      setVoidReason("")
    } catch {
      // The mutation reports the error. Retain the dialog and reason for retry.
    }
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
              <p className="mt-1 text-xl font-semibold text-ink">{money(totals?.total ?? zero, true)}</p>
              <p className="mt-1 text-xs text-ink-4">
                {t("expenses.kpi.expenseCount", { count: totals?.count ?? 0 })}
              </p>
            </Surface>
            <Surface variant="card" className="p-4">
              <p className="text-xs text-ink-3">{t("expenses.kpi.taggedToProject")}</p>
              <p className="mt-1 text-xl font-semibold text-ink">
                {money(totals?.taggedToProject ?? zero, true)}
              </p>
              <p className="mt-1 text-xs text-ink-4">
                {t("expenses.kpi.percentOfTotal", { percent: taggedPercent })}
              </p>
            </Surface>
            <Surface variant="card" className="p-4">
              <p className="text-xs text-ink-3">{t("expenses.kpi.heldByWorkers")}</p>
              <p className="mt-1 text-xl font-semibold text-ink">
                {money(totals?.heldByWorkers ?? zero, true)}
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
              <p className="text-2xl font-semibold text-ink">{money(totals?.total ?? zero, true)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs text-ink">
                {t("expenses.totals.tagged", { amount: formatAmount(totals?.taggedToProject ?? zero) })}
              </span>
              <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2">
                {t("expenses.totals.untagged", { amount: formatAmount(totals?.notTaggedToProject ?? zero) })}
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
              {displayedGroups.map((group) => (
                <Surface key={group.projectId ?? "untagged"} variant="card" className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className={group.projectId ? "font-medium text-ink" : "font-medium text-ink-3"}>
                      {projectLabel(group.projectId)}
                    </h3>
                    <span className="font-semibold text-ink">{money(group.total, true)}</span>
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
                          <span className="font-medium text-ink">{renderDetail ? money(item.amount) : formatAmount(item.amount)}</span>
                          {renderDetail && <Button size="sm" variant="outline" className="ms-2" onClick={() => setDetailId(item.id)}>التفاصيل</Button>}
                          {renderDetail && item.status === "VOIDED" && <span className="ms-2">{t("expenses.status.voided")}</span>}
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
                    <TableCell className="font-medium">{renderDetail ? money(item.amount) : formatAmount(item.amount)}</TableCell>
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
                      <div className="flex flex-wrap gap-2">
                        {renderDetail && <Button size="sm" variant="outline" onClick={() => setDetailId(item.id)}>التفاصيل</Button>}
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

      {renderForm({ open: formOpen, onOpenChange: setFormOpen, expense: editingExpense, projects, employees, sellers })}
      {renderDetail?.(detailId, () => setDetailId(null), expense => { setDetailId(null); openEdit(expense) }, expense => { setDetailId(null); openVoid(expense) })}

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

export type ExactExpensesPageProps = ExpensesPageProps & { client: ExactExpensesClient }

export function ExactExpensesPage({ client, ...props }: ExactExpensesPageProps) {
  const { t } = useTranslation()
  const grouped = useMoneyGrouping()
  function useListQuery(filters: ExpenseListFilters) { return useExactExpensesListQuery(client, filters) }
  function useVoidMutation() { return useVoidExactExpenseMutation(client) }
  return <ExpensePageView<string, ExactExpense> {...props} zero="0.00"
    useListQuery={useListQuery} useVoidMutation={useVoidMutation}
    formatAmount={value => formatExactMoney(value, { aggregate: true, grouped }).text}
    renderAmount={(value, aggregate = false) => <MoneyValue exact value={value} aggregate={aggregate} currencyLabel={t("expenses.currency")} />}
    percentage={exactPercent}
    renderForm={form => <ExactExpenseFormDialog {...form} client={client} />}
    renderDetail={(id, close, edit, voidExpense) => <ExactExpenseDetail client={client} id={id} onClose={close} onEdit={edit} onVoid={voidExpense} />} />
}

function ExactExpenseDetail({ client, id, onClose, onEdit, onVoid }: {
  client: ExactExpensesClient; id: string | null; onClose: () => void
  onEdit: (expense: ExactExpense) => void; onVoid: (expense: ExactExpense) => void
}) {
  const { t } = useTranslation()
  const query = useExactExpenseQuery(client, id)
  const detail = query.data
  const money = (value: string | null) => value === null ? <span>غير متاح</span>
    : <MoneyValue exact value={value} currencyLabel={t("expenses.currency")} />
  return (
    <Dialog open={id !== null} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>تفاصيل المصروف وسجل التعديلات</DialogTitle></DialogHeader>
        <TableQueryState query={query} resource="تفاصيل المصروف">
          {detail && <div className="max-h-[70vh] space-y-4 overflow-y-auto">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt>المبلغ</dt><dd>{money(detail.amount)}</dd>
              <dt>الحالة</dt><dd>{detail.status === "VOIDED" ? t("expenses.status.voided") : "ساري"}</dd>
              <dt>التاريخ</dt><dd>{formatExpenseDate(detail.expenseDate)}</dd>
              <dt>الوصف</dt><dd>{detail.whatFor ?? t("expenses.noDescription")}</dd>
              <dt>ملاحظة</dt><dd>{detail.note ?? t("expenses.none")}</dd>
              <dt>المشروع</dt><dd><bdi>{detail.projectId ?? t("expenses.none")}</bdi></dd>
              <dt>المسؤول</dt><dd><bdi>{detail.responsibleWorkerId ?? t("expenses.none")}</bdi></dd>
              <dt>المورّد</dt><dd><bdi>{detail.sellerId ?? t("expenses.none")}</bdi></dd>
              <dt>قطعة المخزون</dt><dd><bdi>{detail.stockItemId ?? t("expenses.none")}</bdi></dd>
              <dt>المنشئ</dt><dd><bdi>{detail.actorLabel ?? detail.actorUserId ?? t("expenses.none")}</bdi></dd>
              <dt>معرّف العملية</dt><dd className="break-all"><bdi>{detail.transactionId ?? t("expenses.none")}</bdi></dd>
              {detail.status === "VOIDED" && <>
                <dt>سبب الإلغاء</dt><dd>{detail.voidReason ?? t("expenses.none")}</dd>
                <dt>ألغاه</dt><dd><bdi>{detail.voidedBy ?? t("expenses.none")}</bdi></dd>
                <dt>وقت الإلغاء</dt><dd>{detail.voidedAt ? formatExpenseDate(detail.voidedAt) : t("expenses.none")}</dd>
              </>}
            </dl>
            <h3 className="font-semibold">سجل التعديلات</h3>
            {detail.revisions.length === 0 ? <p>لا توجد تعديلات</p> : <ol className="space-y-3">
              {detail.revisions.map(revision => <li key={revision.id} className="border-t border-line pt-3">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                  <dt>المبلغ السابق</dt><dd>{money(revision.previousAmount)}</dd>
                  <dt>المبلغ الجديد</dt><dd>{money(revision.newAmount)}</dd>
                  <dt>السبب</dt><dd>{revision.reason ?? t("expenses.none")}</dd>
                  <dt>الفاعل</dt><dd><bdi>{revision.actorLabel ?? revision.actorUserId ?? t("expenses.none")}</bdi></dd>
                  <dt>الوقت</dt><dd>{formatExpenseDate(revision.createdAt)}</dd>
                  <dt>معرّف العملية</dt><dd className="break-all"><bdi>{revision.transactionId ?? t("expenses.none")}</bdi></dd>
                </dl>
              </li>)}
            </ol>}
          </div>}
        </TableQueryState>
        <DialogFooter>
          {detail?.status === "LIVE" && <>
            <Button variant="outline" onClick={() => onEdit(detail)}>{t("common.edit")}</Button>
            <Button variant="outline" onClick={() => onVoid(detail)}>{t("expenses.actions.void")}</Button>
          </>}
          <Button variant="outline" onClick={onClose}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function exactPercent(part: string, total: string) {
  // Values are canonical contract-validated aggregates, not bounded persisted Money.
  const denominator = BigInt(total.replace(".", ""))
  if (denominator === 0n) return 0
  const numerator = BigInt(part.replace(".", "")) * 100n
  return Number((numerator + denominator / 2n) / denominator)
}
