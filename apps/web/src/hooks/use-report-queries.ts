/**
 * Hooks for querying report data.
 */
import { useQuery } from "@tanstack/react-query";
import type { DebtReport, InventoryReport, MovementReport, Report, ReportType } from "@tuari/contracts";
import { rpcClient } from "@/lib/orpc-client";

interface GenerateReportInput {
  type: ReportType;
  startDate?: string;
  endDate?: string;
}

export function useReportQuery(input: GenerateReportInput, enabled = true) {
  return useQuery({
    queryKey: ["reports", input.type, input.startDate, input.endDate],
    queryFn: async () => {
      const result = await rpcClient.reportsGenerate(input);
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

export function formatReportAsCSV(report: Report): string {
  if (!report?.type || !report?.summary) {
    return "";
  }

  const lines: string[] = [];

  if (report.type === "INVENTORY") {
    const r = report as InventoryReport;
    lines.push("Inventory Report");
    lines.push(`Generated: ${new Date(r.generatedAt).toLocaleString("ar-DZ")}`);
    lines.push("");
    lines.push("Summary");
    lines.push(`Total Assets (DZD),${r.summary.totalAssetsDzd}`);
    lines.push(`Total Consumables (DZD),${r.summary.totalConsumablesDzd}`);
    lines.push(`Total Value (DZD),${r.summary.totalValueDzd}`);
    lines.push("");
    lines.push("By Location");
    lines.push("Location,Asset Count,Asset Value (DZD),Consumable Count");
    r.byLocation.forEach((loc) => {
      lines.push(`"${loc.locationLabel}",${loc.assetCount},${loc.assetValueDzd},${loc.consumableCount}`);
    });
  } else if (report.type === "DEBT") {
    const r = report as DebtReport;
    lines.push("Debt Report");
    lines.push(`Generated: ${new Date(r.generatedAt).toLocaleString("ar-DZ")}`);
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
      lines.push(`"${debtor.partyName}",${debtor.amountDzd},${debtor.daysSinceLastPayment}`);
    });
  } else if (report.type === "MOVEMENT") {
    const r = report as MovementReport;
    lines.push("Movement Report");
    lines.push(`Generated: ${new Date(r.generatedAt).toLocaleString("ar-DZ")}`);
    lines.push("");
    lines.push("Summary");
    lines.push(`Total Movements,${r.summary.totalMovements}`);
    lines.push(`Asset Transfers,${r.summary.assetTransfers}`);
    lines.push(`Consumable Transfers,${r.summary.consumableTransfers}`);
    lines.push(`Outbound Sales,${r.summary.outboundSales}`);
  }

  return lines.join("\n");
}
