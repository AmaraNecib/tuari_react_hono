/**
 * Instant normalization for the expenses module (issue #411).
 *
 * `timestampSchema` accepts any ISO-8601 instant, including an explicit offset
 * (`2026-10-01T00:30:00+01:00`). Storing that text verbatim makes the
 * lexicographic `expense_date` range predicates compare text, not instants, so
 * a row entered with an offset can fall on the wrong side of a UTC boundary.
 * Normalize every stored instant (and every range bound) to the canonical UTC
 * `...Z` form so string comparison is instant comparison. Input is already
 * validated by `timestampSchema`, so an unparseable value is a programming
 * error and surfaces as a throw.
 */
export function toUtcInstant(value: string): string {
  return new Date(value).toISOString();
}
