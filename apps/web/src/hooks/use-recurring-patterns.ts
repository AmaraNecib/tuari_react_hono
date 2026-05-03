import { useQuery } from "@tanstack/react-query";
import { rpcClient } from "@/lib/orpc-client";

export function useRecurringPatternsQuery() {
  return useQuery({
    queryKey: ["recurring-patterns"],
    queryFn: async () => {
      return (rpcClient as any).recurringPatternsList?.() ?? { items: [] };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecurringPatternQuery(id: string) {
  return useQuery({
    queryKey: ["recurring-patterns", id],
    queryFn: async () => {
      return (rpcClient as any).recurringPatternsGet?.({ id });
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function formatNextOccurrence(pattern: any): string {
  if (!pattern.nextOccurrenceDate) return "لم تحسب بعد";
  const date = new Date(pattern.nextOccurrenceDate);
  return date.toLocaleDateString("ar-DZ");
}

export function calculateDaysUntilOccurrence(pattern: any): number {
  if (!pattern.nextOccurrenceDate) return -1;
  const now = new Date();
  const nextDate = new Date(pattern.nextOccurrenceDate);
  const diff = nextDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
