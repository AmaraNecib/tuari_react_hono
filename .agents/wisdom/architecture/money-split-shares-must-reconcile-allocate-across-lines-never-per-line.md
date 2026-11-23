## Money split shares must reconcile: allocate across lines, never per line (🟠 Major)

On #412 round 5, `allocateSalaryAmountByDays` prorated each split line on its own
and rounded to two decimals. A 100 DZD payment over three one-day lines produced
33.33 three times — 99.99, visibly short of the amount paid. This is the money
twin of the day-split reconciliation bug: per-line rounding cannot make the lines
sum to the total they were derived from.

**Always**: when a paid total is distributed across lines, compute every line's
exact share, floor it to the smallest money unit, then hand the leftover units to
the lines with the largest fractional part (largest-remainder/Hamilton) — the
same shape `deriveSalaryProjectDays` already uses for whole days. The shares then
sum to the rounded attributed total by construction (the whole amount when the
split covers every paid day), and ties break deterministically by line order.
Floor-then-distribute, not round-each: rounding each line can overshoot the total
as easily as undershoot. Test the divide-evenly case (100 into 3) and a case
where the leftover unit lands on a different line; a 50/50 split never rounds, so
it passes on the buggy code and proves nothing.

