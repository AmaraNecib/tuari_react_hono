import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CurrencyInput, NativeSelect, Textarea } from "@/components/ui/form-controls"
import { Input } from "@/components/ui/input"
import { DatePicker, fromDatePickerValue, toDatePickerValue } from "@/components/ui/date-picker"
import { useCreateSalaryPaymentMutation } from "@/features/app-shell/workspace-mutations"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { useFormAmount, useDateField } from "@/features/shared/use-form-amount"
import { computeProposedSalaryAmount, deriveSalaryProjectDays, roundMoneyToCents } from "@tuari/contracts"

import {
  computeUnallocatedDays,
  defaultSalaryPaymentDays,
  parsePositiveInteger,
  resolveSalaryPaymentPeriod,
  type SalaryPaymentPeriodType,
} from "./salary-payment-form"

export type SalaryProjectOption = { id: string; name: string }
export type SalaryProjectAssignmentWindow = { projectId: string; startDate: string; endDate: string | null }

/**
 * A quick-form draft handed to the split dialog. The dialog owns the payment
 * once it opens: the quick form clears its fields in the same action so one
 * payment never has two live drafts and no typed input is discarded.
 */
export type SalaryPaymentDraft = {
  days: number
  daysTouched: boolean
  amount: number | null
  amountTouched: boolean
  date: string
  note: string
}

type SplitLine = { key: string; projectId: string; days: string }

/**
 * Dialog for recording a salary payment: days worked, a proposed amount that
 * stays editable, and a hand-typed per-project split prefilled from the
 * worker's assignment windows (issue #412).
 */
/**
 * @description Component
 */
export function AddSalaryPaymentDialog({
  employeeId,
  employeeName,
  salaryAmountDzd = null,
  salaryPeriod = null,
  projectAssignments = [],
  projects = [],
  initialDraft = null,
  open,
  onOpenChange,
}: {
  employeeId: string | null
  employeeName?: string | null
  /** The worker's configured wage, used to propose the amount. */
  salaryAmountDzd?: number | null
  salaryPeriod?: SalaryPaymentPeriodType | null
  /** Assignment windows feeding the derived per-project default. */
  projectAssignments?: SalaryProjectAssignmentWindow[]
  /** Projects the split can be attributed to. */
  projects?: SalaryProjectOption[]
  /** A quick-form draft to adopt once when the dialog opens. */
  initialDraft?: SalaryPaymentDraft | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const mutation = useCreateSalaryPaymentMutation()
  const { amount: manualAmount, setAmount: setManualAmount, value: manualAmountValue, reset: resetAmount } = useFormAmount()
  const { date, setDate, reset: resetDate } = useDateField(getAlgeriaDateInputValue())
  const [note, setNote] = useState("")
  const [daysText, setDaysText] = useState(() => String(defaultSalaryPaymentDays(salaryPeriod)))
  const [daysTouched, setDaysTouched] = useState(false)
  const [manualAmountTouched, setManualAmountTouched] = useState(false)
  const [splits, setSplits] = useState<SplitLine[]>([])
  const [splitsTouched, setSplitsTouched] = useState(false)
  // `resetAmount`/`resetDate` are new function identities every render, so the
  // reset effect below must not depend on their identity to decide whether the
  // form was already initialized. It keys on what the defaults actually depend
  // on — the employee and the wage period — so a workspace refresh that
  // reclassifies the worker (monthly→daily) re-applies the day default while
  // the dialog stays open, without discarding an operator edit.
  const initializedTargetRef = useRef<{ employeeId: string; period: SalaryPaymentPeriodType | null } | null>(null)
  // A handoff draft is adopted once per object identity, so a parent re-render
  // cannot replay it over an edit the operator made inside the dialog.
  const appliedDraftRef = useRef<SalaryPaymentDraft | null>(null)

  const days = parsePositiveInteger(daysText)
  const proposedAmount =
    salaryAmountDzd !== null && salaryPeriod !== null && days !== null
      ? computeProposedSalaryAmount({ periodType: salaryPeriod, salaryAmountDzd, days })
      : null

  // The amount follows the proposal until the user edits it; then their value wins.
  const displayedAmount = manualAmountTouched ? manualAmount : proposedAmount !== null ? String(proposedAmount) : ""
  const effectiveAmount = manualAmountTouched ? manualAmountValue : proposedAmount
  const hasValidAmount = effectiveAmount !== null && Number.isFinite(effectiveAmount) && effectiveAmount > 0

  const period = useMemo(
    () => resolveSalaryPaymentPeriod(date, salaryPeriod),
    [date, salaryPeriod],
  )

  const assignmentsKey = JSON.stringify(projectAssignments)
  const defaultSplits = useMemo(() => {
    if (!period || days === null) {
      return [] as Array<{ projectId: string; days: number }>
    }
    return deriveSalaryProjectDays({
      assignments: JSON.parse(assignmentsKey) as SalaryProjectAssignmentWindow[],
      periodStart: period.start,
      periodEnd: period.end,
      days,
    })
  }, [assignmentsKey, days, period])

  useEffect(() => {
    if (!open || !employeeId) {
      initializedTargetRef.current = null
      return
    }
    const previous = initializedTargetRef.current
    const employeeChanged = previous?.employeeId !== employeeId
    const periodChanged = previous?.period !== salaryPeriod
    if (!employeeChanged && !periodChanged) {
      return
    }
    initializedTargetRef.current = { employeeId, period: salaryPeriod }
    // The day default depends only on the wage period, so an amount-only
    // refresh leaves the field alone. Re-apply it for a new employee or a new
    // period unless the operator edited the count; an edited count survives.
    if (employeeChanged || !daysTouched) {
      setDaysText(String(defaultSalaryPaymentDays(salaryPeriod)))
      setDaysTouched(false)
    }
    // A new employee is a different record: reset everything, including an
    // amount the operator had typed for the previous worker.
    if (employeeChanged) {
      resetAmount()
      setManualAmountTouched(false)
      resetDate()
      setNote("")
      setSplitsTouched(false)
    }
  }, [open, employeeId, salaryPeriod, daysTouched, resetAmount, resetDate])

  useEffect(() => {
    if (!open || !employeeId || !initialDraft || appliedDraftRef.current === initialDraft) {
      return
    }
    appliedDraftRef.current = initialDraft
    // A carried draft wins over the default init: it is what the operator
    // typed in the quick form. An untouched day/amount keeps following the
    // wage, an edited one is pinned.
    if (initialDraft.daysTouched) {
      setDaysText(String(initialDraft.days))
      setDaysTouched(true)
    } else {
      setDaysText(String(defaultSalaryPaymentDays(salaryPeriod)))
      setDaysTouched(false)
    }
    if (initialDraft.amountTouched && initialDraft.amount !== null) {
      setManualAmount(String(initialDraft.amount))
      setManualAmountTouched(true)
    } else {
      resetAmount()
      setManualAmountTouched(false)
    }
    setDate(initialDraft.date || getAlgeriaDateInputValue())
    setNote(initialDraft.note)
    setSplitsTouched(false)
    initializedTargetRef.current = { employeeId, period: salaryPeriod }
  }, [open, employeeId, initialDraft, salaryPeriod, setDate, setManualAmount, resetAmount])

  useEffect(() => {
    if (!open || !employeeId || splitsTouched) {
      return
    }
    setSplits(
      defaultSplits.map((split, index) => ({
        key: `${index}-${split.projectId}`,
        projectId: split.projectId,
        days: String(split.days),
      })),
    )
  }, [open, employeeId, defaultSplits, splitsTouched])

  const splitDays = splits.map((line) => Number(line.days))
  const splitsValid = splits.every(
    (line) => line.projectId.length > 0 && Number.isInteger(Number(line.days)) && Number(line.days) > 0,
  )
  const hasDuplicateProjects = new Set(splits.map((line) => line.projectId)).size !== splits.length
  const unallocatedDays = days !== null && splitsValid ? computeUnallocatedDays(days, splitDays) : null
  const overAllocated = unallocatedDays !== null && unallocatedDays < 0

  const canSubmit =
    Boolean(employeeId) &&
    days !== null &&
    hasValidAmount &&
    splitsValid &&
    !hasDuplicateProjects &&
    !overAllocated &&
    !mutation.isPending

  const resetForm = () => {
    setDaysText(String(defaultSalaryPaymentDays(salaryPeriod)))
    setDaysTouched(false)
    resetAmount()
    setManualAmountTouched(false)
    resetDate()
    setNote("")
    setSplits([])
    setSplitsTouched(false)
  }

  const updateSplit = (key: string, patch: Partial<Pick<SplitLine, "projectId" | "days">>) => {
    setSplitsTouched(true)
    setSplits((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  const addSplit = () => {
    const used = new Set(splits.map((line) => line.projectId))
    const next = projects.find((project) => !used.has(project.id))
    const remaining = unallocatedDays !== null && unallocatedDays > 0 ? unallocatedDays : 1
    setSplitsTouched(true)
    setSplits((current) => [
      ...current,
      { key: `line-${Date.now()}-${current.length}`, projectId: next?.id ?? "", days: String(remaining) },
    ])
  }

  const removeSplit = (key: string) => {
    setSplitsTouched(true)
    setSplits((current) => current.filter((line) => line.key !== key))
  }

  const handleSubmit = async () => {
    if (!canSubmit || !employeeId || days === null) return

    await mutation.mutateAsync({
      employeeId,
      days,
      // The override is stored at the currency's precision so it agrees with
      // the whole-cent shares the split display attributes.
      actualAmountDzd:
        manualAmountTouched && manualAmountValue !== null
          ? roundMoneyToCents(manualAmountValue)
          : undefined,
      paymentDate: date ? toAlgeriaDayBoundaryIso(date, "start") : undefined,
      note: note.trim() || null,
      projectSplits: splits.map((line) => ({ projectId: line.projectId, days: Number(line.days) })),
    })

    resetForm()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetForm()
        onOpenChange(isOpen)
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("salaries.addPayment")}</DialogTitle>
          {employeeName ? (
            <p className="text-sm text-muted-foreground" dir="auto">{employeeName}</p>
          ) : null}
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t("salaries.days")}</span>
              <Input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                dir="ltr"
                value={daysText}
                onChange={(event) => {
                  setDaysTouched(true)
                  setDaysText(event.target.value)
                }}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t("salaries.paymentDate")}</span>
              <DatePicker
                value={toDatePickerValue(date)}
                onChange={(value) => setDate(fromDatePickerValue(value))}
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t("salaries.proposedAmount")}</span>
              <span className="flex h-10 items-center rounded-xl border border-dashed border-border/75 bg-surface-2 px-4 text-sm font-mono tabular-nums text-ink-2" dir="ltr">
                {proposedAmount !== null
                  ? new Intl.NumberFormat("ar-DZ", { maximumFractionDigits: 2 }).format(proposedAmount)
                  : "—"}
              </span>
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("salaries.actualAmount")}</span>
            <CurrencyInput
              placeholder="0"
              value={displayedAmount}
              onChange={(event) => {
                setManualAmountTouched(true)
                setManualAmount(event.target.value)
              }}
            />
          </label>

          <div className="space-y-3 rounded-xl border border-border/60 bg-surface-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{t("salaries.projectSplit")}</span>
              <Button type="button" size="xs" variant="outline" onClick={addSplit} disabled={projects.length === 0}>
                {t("salaries.addProjectLine")}
              </Button>
            </div>

            {splits.length > 0 ? (
              <div className="space-y-3">
                {splits.map((line) => (
                  <div key={line.key} className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-ink-3">{t("salaries.project")}</span>
                      <NativeSelect
                        value={line.projectId}
                        onChange={(event) => updateSplit(line.key, { projectId: event.target.value })}
                      >
                        <option value="">{t("salaries.selectProject")}</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                      </NativeSelect>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-ink-3">{t("salaries.days")}</span>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        dir="ltr"
                        value={line.days}
                        onChange={(event) => updateSplit(line.key, { days: event.target.value })}
                      />
                    </label>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => removeSplit(line.key)}
                    >
                      {t("salaries.removeProjectLine")}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-3">{t("salaries.noProjectSplit")}</p>
            )}

            <p className={`text-sm font-medium ${overAllocated ? "text-destructive" : "text-ink-2"}`} dir="rtl">
              {overAllocated && unallocatedDays !== null
                ? t("salaries.overAllocatedDays", { count: Math.abs(unallocatedDays) })
                : t("salaries.unallocatedDays", { count: unallocatedDays ?? days ?? 0 })}
            </p>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("salaries.notes")}</span>
            <Textarea
              placeholder={t("common.noNotes")}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              resetForm()
              onOpenChange(false)
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            {t("salaries.addPayment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
