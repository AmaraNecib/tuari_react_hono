import { useQuery } from "@tanstack/react-query";
import type { RecurringPattern, RecurringPatternList } from "@tuari/contracts";
import { rpcClient } from "@/lib/orpc-client";

export function useRecurringPatternsQuery() {
  return useQuery<RecurringPatternList>({
    queryKey: ["recurring-patterns"],
    queryFn: async () => {
      return rpcClient.recurringPatternsList({});
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecurringPatternQuery(id: string) {
  return useQuery<RecurringPattern>({
    queryKey: ["recurring-patterns", id],
    queryFn: async () => {
      return rpcClient.recurringPatternsGet({ id });
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
