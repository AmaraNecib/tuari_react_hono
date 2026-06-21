import { useQuery } from "@tanstack/react-query";
import type { RecurringPattern } from "@tuari/contracts";
import { rpcClient } from "@/lib/orpc-client";

export function useRecurringPatternsQuery() {
  return useQuery({
    queryKey: ["recurring-patterns"],
    queryFn: async () => {
      return (rpcClient as unknown as { recurringPatternsList?: () => Promise<{ items: RecurringPattern[] }> }).recurringPatternsList?.() ?? { items: [] };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecurringPatternQuery(id: string) {
  return useQuery({
    queryKey: ["recurring-patterns", id],
    queryFn: async () => {
      return (rpcClient as unknown as { recurringPatternsGet?: (input: { id: string }) => Promise<RecurringPattern> }).recurringPatternsGet?.({ id });
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function formatNextOccurrence(pattern: RecurringPattern): string {
  if (!pattern.nextOccurrenceDate) return "لم تحسب بعد";
  const date = new Date(pattern.nextOccurrenceDate);
  return date.toLocaleDateString("ar-DZ");
}

export function calculateDaysUntilOccurrence(pattern: RecurringPattern): number | null {
  if (!pattern?.nextOccurrenceDate) return null;
  const now = new Date();
  const nextDate = new Date(pattern.nextOccurrenceDate);
  const diff = nextDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
