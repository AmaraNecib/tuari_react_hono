import { formatDateTimeInAlgeria, type DateFormat } from "@/lib/algeria-time";
/**
 * Hooks for querying report data.
 */
import { useQuery } from "@tanstack/react-query";
import type { ExactDebtReport, ExactInventoryReports, ReportType } from "@tuari/contracts";
import { financialClient } from "@/lib/orpc-client";
import { resolveDayRangeBounds } from "@/lib/date-range";

type ExactReport = ExactDebtReport | ExactInventoryReports;

interface GenerateReportInput {
  type: ReportType;
  /** Canonical `yyyy-MM-dd` day from the date pickers; expanded to inclusive bounds below. */
  startDate?: string;
  /** Canonical `yyyy-MM-dd` day from the date pickers; expanded to inclusive bounds below. */
  endDate?: string;
}

/**
 * @description Component
 */
export function useReportQuery(input: GenerateReportInput, enabled = true) {
  // The wire contract wants ISO-8601 instants, so expand the picked days to
  // start/end-of-day bounds here (the wire seam) rather than at every caller.
  const { fromDate, toDate } = resolveDayRangeBounds({
    fromDate: input.startDate,
    toDate: input.endDate,
  })

  return useQuery({
    queryKey: ["reports", input.type, input.startDate, input.endDate],
    queryFn: async () => {
      const result = await financialClient.reports.generate({
        type: input.type,
        startDate: fromDate,
        endDate: toDate,
      });
      if (!result) throw new Error("Failed to generate report");
      return result;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}
export function useInventoryReport(startDate?: string, endDate?: string) {
  return useReportQuery({ type: "INVENTORY", startDate, endDate });
}

export function useDebtReport(startDate?: string, endDate?: string) {
  return useReportQuery({ type: "DEBT", startDate, endDate });
}

export function useMovementReport(startDate?: string, endDate?: string) {
  return useReportQuery({ type: "MOVEMENT", startDate, endDate });
}

function encodeCSVText(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function formatReportAsCSV(report: ExactReport, dateFormat: DateFormat = "DD/MM/YYYY"): string {
  if (!report?.type || !report?.summary) {
    return "";
  }

  const lines: string[] = [];

  if (report.type === "INVENTORY") {
    const r = report;
    lines.push("Inventory Report");
    lines.push(`Generated: ${formatDateTimeInAlgeria(new Date(r.generatedAt), "ar-DZ", dateFormat)}`);
    lines.push("Basis,Purchase-entry quantities and purchase locations; not current stock");
    lines.push("");
    lines.push("Summary");
    lines.push(`Total Assets (DZD),${r.summary.totalAssetsDzd}`);
    lines.push(`Total Consumables (DZD),${r.summary.totalConsumablesDzd}`);
    lines.push(`Total Value (DZD),${r.summary.totalValueDzd}`);
    lines.push("");
    lines.push("By Location");
    lines.push("Location,Asset Count,Asset Value (DZD),Consumable Count");
    r.byLocation.forEach((loc) => {
      lines.push(`${encodeCSVText(loc.locationLabel)},${loc.assetCount},${loc.assetValueDzd},${loc.consumableCount}`);
    });
  } else if (report.type === "DEBT") {
    const r = report;
    lines.push("Debt Report");
    lines.push(`Generated: ${formatDateTimeInAlgeria(new Date(r.generatedAt), "ar-DZ", dateFormat)}`);
    lines.push("");
    lines.push("Summary");
    lines.push(`Total Outstanding (DZD),${r.summary.totalOutstandingDzd}`);
    lines.push(`Total Settled (DZD),${r.summary.totalSettledDzd}`);
    lines.push(`Overdue (DZD),${r.summary.overdueDzd}`);
    lines.push(`Party Count,${r.summary.partyCount}`);
    lines.push("");
    lines.push("Top Debtors");
    lines.push("Party Name,Amount (DZD),Days Since Last Payment");
    r.topDebtors.forEach((debtor) => {
      lines.push(`${encodeCSVText(debtor.partyName)},${debtor.amountDzd},${debtor.daysSinceLastPayment}`);
    });
  } else if (report.type === "MOVEMENT") {
    const r = report;
    lines.push("Movement Report");
    lines.push(`Generated: ${formatDateTimeInAlgeria(new Date(r.generatedAt), "ar-DZ", dateFormat)}`);
    lines.push("");
    lines.push("Summary");
    lines.push(`Total Movements,${r.summary.totalMovements}`);
    lines.push(`Asset Transfers,${r.summary.assetTransfers}`);
    lines.push(`Consumable Transfers,${r.summary.consumableTransfers}`);
    lines.push(`Raw outbound movement-kind count (OUTBOUND_SALE; sale/return/gift),${r.summary.outboundSales}`);
    lines.push("Outbound documents by kind");
    lines.push("Document kind,Count");
    r.outboundDocuments.forEach((row) => lines.push(`${row.transferType},${row.count}`));
  }

  return lines.join("\n");
}
