import { useQuery } from "@tanstack/react-query";
import { rpcClient } from "@/lib/orpc-client";

type ReportType = "INVENTORY" | "DEBT" | "MOVEMENT";

interface GenerateReportInput {
  type: ReportType;
  startDate?: string;
  endDate?: string;
}

export function useReportQuery(input: GenerateReportInput, enabled = true) {
  return useQuery({
    queryKey: ["reports", input.type, input.startDate, input.endDate],
    queryFn: async () => {
      const result = await (rpcClient as any).reportsGenerate(input);
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

export function formatReportAsCSV(report: any): string {
  if (!report?.type || !report?.summary) {
    return "";
  }

  const lines: string[] = [];

  if (report.type === "INVENTORY") {
    lines.push("Inventory Report");
    lines.push(`Generated: ${new Date(report.generatedAt).toLocaleString("ar-DZ")}`);
    lines.push("");
    lines.push("Summary");
    lines.push(`Total Assets (DZD),${report.summary.totalAssetsDzd}`);
    lines.push(`Total Consumables (DZD),${report.summary.totalConsumablesDzd}`);
    lines.push(`Total Value (DZD),${report.summary.totalValueDzd}`);
    lines.push("");
    lines.push("By Location");
    lines.push("Location,Asset Count,Asset Value (DZD),Consumable Count");
    report.byLocation.forEach((loc: any) => {
      lines.push(`"${loc.locationLabel}",${loc.assetCount},${loc.assetValueDzd},${loc.consumableCount}`);
    });
  } else if (report.type === "DEBT") {
    lines.push("Debt Report");
    lines.push(`Generated: ${new Date(report.generatedAt).toLocaleString("ar-DZ")}`);
    lines.push("");
    lines.push("Summary");
    lines.push(`Total Outstanding (DZD),${report.summary.totalOutstandingDzd}`);
    lines.push(`Total Settled (DZD),${report.summary.totalSettledDzd}`);
    lines.push(`Overdue (DZD),${report.summary.overdueDzd}`);
    lines.push(`Party Count,${report.summary.partyCount}`);
    lines.push("");
    lines.push("Top Debtors");
    lines.push("Party Name,Amount (DZD),Days Since Last Payment");
    report.topDebtors.forEach((debtor: any) => {
      lines.push(`"${debtor.partyName}",${debtor.amountDzd},${debtor.daysSinceLastPayment}`);
    });
  } else if (report.type === "MOVEMENT") {
    lines.push("Movement Report");
    lines.push(`Generated: ${new Date(report.generatedAt).toLocaleString("ar-DZ")}`);
    lines.push("");
    lines.push("Summary");
    lines.push(`Total Movements,${report.summary.totalMovements}`);
    lines.push(`Asset Transfers,${report.summary.assetTransfers}`);
    lines.push(`Consumable Transfers,${report.summary.consumableTransfers}`);
    lines.push(`Outbound Sales,${report.summary.outboundSales}`);
  }

  return lines.join("\n");
}
