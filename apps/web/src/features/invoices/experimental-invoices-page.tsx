import type { ExperimentalExactInvoice, ExperimentalExactInvoicesClient } from "@tuari/contracts"
import { useTranslation } from "react-i18next"

import { AppDate } from "@/components/app-date"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCompositeWorkspaceQuery } from "@/features/app-shell/workspace-queries"
import { MoneyValue, CurrencyRun } from "@/features/shared/money-value"
import { Surface } from "@/features/shared/page-primitives"
import {
  useExperimentalExactInvoice,
  useExperimentalExactInvoicePayments,
  useExperimentalExactInvoices,
} from "./experimental-invoices-queries"

type Props = {
  client: ExperimentalExactInvoicesClient
  initialInvoiceId?: string
  onBackToList(): void
  onOpenInvoice(id: string): void
}

const statusLabels = {
  DRAFT: "exactCommerce.draft",
  RECEIVED: "exactCommerce.received",
  SETTLED: "exactCommerce.experimentalSettled",
  PAID: "exactCommerce.experimentalPaid",
  VOIDED: "exactCommerce.voidedInvoice",
} as const

function invoiceLabel(invoice: Pick<ExperimentalExactInvoice, "id" | "invoiceNumber">) {
  return invoice.invoiceNumber || invoice.id
}

/** Read-only invoice settlement projection. The server capability gates every experimental RPC. */
export function ExperimentalInvoicesPage({ client, initialInvoiceId, onBackToList, onOpenInvoice }: Props) {
  const { t, i18n } = useTranslation()
  const workspace = useCompositeWorkspaceQuery()
  const supported = workspace.isSuccess
    && !workspace.isFetching
    && workspace.data?.capabilities?.experimentalInvoiceSettlement === true
  const invoices = useExperimentalExactInvoices(client, supported && !initialInvoiceId)
  const requestedInvoice = useExperimentalExactInvoice(client, initialInvoiceId, supported)
  const invoice = requestedInvoice.isSuccess && !requestedInvoice.isFetching ? requestedInvoice.data : undefined
  const payments = useExperimentalExactInvoicePayments(client, invoice, Boolean(invoice) && supported)

  if (workspace.isPending || workspace.isFetching) {
    return <main dir={i18n.dir()} aria-label={t("exactCommerce.experimentalPageLabel")} className="min-w-0 space-y-4"><p role="status">{t("exactCommerce.experimentalCheckingCapability")}</p></main>
  }
  if (workspace.isError || !supported) {
    return <UnavailablePage label={t("exactCommerce.experimentalPageLabel")} message={t("exactCommerce.experimentalUnavailable")} />
  }

  if (initialInvoiceId) {
    return <InvoiceDetail
      invoice={invoice}
      invoiceQuery={requestedInvoice}
      payments={payments}
      label={t("exactCommerce.experimentalPageLabel")}
      onBackToList={onBackToList}
    />
  }

  const rows = invoices.data?.pages.flatMap(page => page.items) ?? []
  if (invoices.isPending || invoices.isFetching) {
    return <main dir={i18n.dir()} aria-label={t("exactCommerce.experimentalPageLabel")} className="min-w-0 space-y-4"><p role="status">{t("exactCommerce.experimentalLoadingInvoices")}</p></main>
  }
  if (invoices.isError) {
    return <UnavailablePage label={t("exactCommerce.experimentalPageLabel")} message={t("exactCommerce.experimentalUnavailable")} retry={() => void invoices.refetch()} />
  }

  return <main dir={i18n.dir()} aria-label={t("exactCommerce.experimentalPageLabel")} className="min-w-0 space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">{t("exactCommerce.experimentalTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("exactCommerce.experimentalReadOnlyNotice")}</p>
    </header>
    <Surface variant="card" className="min-w-0 p-5">
      <h2 className="mb-4 text-lg font-semibold">{t("exactCommerce.experimentalInvoices")}</h2>
      <div role="region" aria-label={t("exactCommerce.experimentalInvoiceTable")} tabIndex={0} className="overflow-x-auto">
        <Table className="min-w-[760px]">
          <TableHeader><TableRow>
            <TableHead>{t("exactCommerce.invoiceAndParty")}</TableHead>
            <TableHead>{t("exactCommerce.total")}</TableHead>
            <TableHead>{t("exactCommerce.experimentalActualPayment")}</TableHead>
            <TableHead>{t("exactCommerce.experimentalSettledAmount")}</TableHead>
            <TableHead>{t("exactCommerce.remaining")}</TableHead>
            <TableHead>{t("exactCommerce.status")}</TableHead>
            <TableHead>{t("exactCommerce.actions")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map(row => <TableRow key={row.id}>
            <TableCell><bdi>{invoiceLabel(row)}</bdi><p className="mt-1 text-xs text-muted-foreground">{row.supplierName} · {t(row.direction === "PURCHASE" ? "exactCommerce.purchasePayable" : "exactCommerce.saleReceivable")}</p></TableCell>
            <TableCell><MoneyValue exact value={row.totalAmount} currencyLabel={t("common.currency")} /></TableCell>
            <TableCell><MoneyValue exact value={row.paidAmount} currencyLabel={t("common.currency")} /></TableCell>
            <TableCell><MoneyValue exact value={row.settledAmount} currencyLabel={t("common.currency")} /></TableCell>
            <TableCell><MoneyValue exact value={row.remainingAmount} currencyLabel={t("common.currency")} /></TableCell>
            <TableCell className="whitespace-nowrap">{t(statusLabels[row.status])}</TableCell>
            <TableCell><Button size="sm" variant="outline" onClick={() => onOpenInvoice(row.id)}>{t("exactCommerce.experimentalOpenInvoice", { invoice: invoiceLabel(row) })}</Button></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div>
      {!rows.length && <p className="py-5">{t("exactCommerce.experimentalNoInvoices")}</p>}
      {invoices.hasNextPage && <Button variant="outline" disabled={invoices.isFetchingNextPage} onClick={() => void invoices.fetchNextPage()}>{t("common.showMore")}</Button>}
    </Surface>
  </main>
}

function UnavailablePage({ label, message, retry }: { label: string; message: string; retry?: () => void }) {
  const { t, i18n } = useTranslation()
  return <main dir={i18n.dir()} aria-label={label} className="min-w-0 space-y-4"><p role="alert">{message}</p>{retry && <Button variant="outline" onClick={retry}>{t("common.retry")}</Button>}</main>
}

function InvoiceDetail({ invoice, invoiceQuery, payments, label, onBackToList }: {
  invoice: ExperimentalExactInvoice | undefined
  invoiceQuery: ReturnType<typeof useExperimentalExactInvoice>
  payments: ReturnType<typeof useExperimentalExactInvoicePayments>
  label: string
  onBackToList(): void
}) {
  const { t, i18n } = useTranslation()
  if (invoiceQuery.isPending || invoiceQuery.isFetching) {
    return <main dir={i18n.dir()} aria-label={label} className="min-w-0 space-y-4"><Button variant="outline" onClick={onBackToList}>{t("exactCommerce.experimentalBackToInvoices")}</Button><p role="status">{t("exactCommerce.loadingInvoiceDetails")}</p></main>
  }
  if (invoiceQuery.isError || !invoice) {
    return <main dir={i18n.dir()} aria-label={label} className="min-w-0 space-y-4"><Button variant="outline" onClick={onBackToList}>{t("exactCommerce.experimentalBackToInvoices")}</Button><p role="alert">{t("exactCommerce.experimentalUnavailable")}</p><Button variant="outline" onClick={() => void invoiceQuery.refetch()}>{t("common.retry")}</Button></main>
  }

  const relatedPayments = payments.data?.pages.flatMap(page => page.items) ?? []
  const paymentRows = relatedPayments.filter(payment => payment.allocations.some(allocation => allocation.invoiceId === invoice.id) || payment.unallocatedAmount !== "0.00")
  return <main dir={i18n.dir()} aria-label={label} className="min-w-0 space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">{t("exactCommerce.experimentalInvoiceDetails", { invoice: invoiceLabel(invoice) })}</h1><p className="mt-2 text-sm text-muted-foreground">{invoice.supplierName} · {t(invoice.direction === "PURCHASE" ? "exactCommerce.purchasePayable" : "exactCommerce.saleReceivable")}</p></div>
      <Button variant="outline" onClick={onBackToList}>{t("exactCommerce.experimentalBackToInvoices")}</Button>
    </div>
    <Surface variant="card" className="min-w-0 p-5">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-sm text-muted-foreground">{t("exactCommerce.total")}</dt><dd><MoneyValue exact value={invoice.totalAmount} currencyLabel={t("common.currency")} variant="detail" /></dd></div>
        <div><dt className="text-sm text-muted-foreground">{t("exactCommerce.experimentalActualPayment")}</dt><dd><MoneyValue exact value={invoice.paidAmount} currencyLabel={t("common.currency")} variant="detail" /></dd></div>
        <div><dt className="text-sm text-muted-foreground">{t("exactCommerce.experimentalSettledAmount")}</dt><dd><MoneyValue exact value={invoice.settledAmount} currencyLabel={t("common.currency")} variant="detail" /></dd></div>
        <div><dt className="text-sm text-muted-foreground">{t("exactCommerce.remaining")}</dt><dd><MoneyValue exact value={invoice.remainingAmount} currencyLabel={t("common.currency")} variant="detail" /></dd></div>
        <div><dt className="text-sm text-muted-foreground">{t("exactCommerce.status")}</dt><dd>{t(statusLabels[invoice.status])}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{t("common.invoiceDate")}</dt><dd>{invoice.invoiceDate ? <AppDate value={invoice.invoiceDate} /> : t("common.none")}</dd></div>
      </dl>
    </Surface>
    <Surface variant="card" className="min-w-0 p-5">
      <h2 className="mb-4 text-lg font-semibold">{t("exactCommerce.experimentalLines")}</h2>
      <ol className="space-y-4">{invoice.lineItems.map((line, index) => <li key={line.id} className="border-t border-border pt-4">
        <h3 className="font-medium">{t("exactCommerce.lineNumber", { number: index + 1 })} · {line.description}</h3>
        <p className="mt-2 text-sm">{t("exactCommerce.quantity")} <bdi dir="ltr">{line.source.quantity}</bdi></p>
        <p className="mt-2 text-sm">{line.source.mode === "unit-price"
          ? <>{t("exactCommerce.unitPrice")} <CurrencyRun amount={line.source.price} currencyLabel={t("common.currency")} /></>
          : <>{t("exactCommerce.agreedTotal")} <MoneyValue exact value={line.source.total} currencyLabel={t("common.currency")} /></>}</p>
      </li>)}</ol>
      {invoice.notes && <p className="mt-4 whitespace-pre-wrap border-t border-border pt-4">{invoice.notes}</p>}
    </Surface>
    <Surface role="region" aria-label={t("exactCommerce.experimentalPaymentAllocations")} variant="card" className="min-w-0 p-5">
      <h2 className="mb-2 text-lg font-semibold">{t("exactCommerce.experimentalPaymentAllocations")}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t("exactCommerce.experimentalUnallocatedNote")}</p>
      {payments.isPending || payments.isFetching ? <p role="status">{t("exactCommerce.loadingPayments")}</p>
        : payments.isError ? <p role="alert">{t("exactCommerce.experimentalUnavailable")}</p>
          : <>
            {!paymentRows.length && <p className="py-3">{t("exactCommerce.experimentalNoAllocations")}</p>}
            <ul className="space-y-4">{paymentRows.map(payment => {
              const allocations = payment.allocations.filter(allocation => allocation.invoiceId === invoice.id)
              return <li key={payment.id}><article className="space-y-2 border-t border-border pt-3">
                <h3 className="font-medium">{payment.paymentMethod === "CASH" ? t("exactCommerce.cash") : payment.paymentMethod === "BANK_TRANSFER" ? t("exactCommerce.bankTransfer") : t("exactCommerce.check")} · <AppDate value={payment.paymentDate} /></h3>
                <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm"><div><dt>{t("exactCommerce.amount")}</dt><dd><MoneyValue exact value={payment.totalAmount} currencyLabel={t("common.currency")} /></dd></div>
                  <div><dt>{t("exactCommerce.experimentalAllocationToInvoice")}</dt><dd>{allocations.length ? allocations.map(allocation => <p key={allocation.id}><MoneyValue exact value={allocation.amount} currencyLabel={t("common.currency")} />{allocation.status === "VOIDED" ? ` · ${t("exactCommerce.voidedAllocation")}` : ""}</p>) : t("common.none")}</dd></div>
                  <div><dt>{t("exactCommerce.unallocated")}</dt><dd><MoneyValue exact value={payment.unallocatedAmount} currencyLabel={t("common.currency")} /></dd></div>
                  {payment.status === "VOIDED" && <div><dt>{t("exactCommerce.status")}</dt><dd>{t("exactCommerce.voidedPayment")}</dd></div>}
                </dl>
              </article></li>
            })}</ul>
            {payments.hasNextPage && <Button variant="outline" disabled={payments.isFetchingNextPage} onClick={() => void payments.fetchNextPage()}>{t("common.showMore")}</Button>}
          </>}
    </Surface>
  </main>
}
