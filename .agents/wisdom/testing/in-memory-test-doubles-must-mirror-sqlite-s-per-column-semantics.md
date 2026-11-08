## In-memory test doubles must mirror sqlite's per-column semantics (🟠 Major)

The in-memory employee repo concatenated `firstName lastName phone` into one haystack; sqlite matched each column with `OR`. A full-name term like `أحمد بلخير` matched in-memory (module tests green) but returned NOTHING on production sqlite. The test-audit edge-case hunter caught it. Fix: sqlite added `(first_name || ' ' || last_name) LIKE …` to mirror the concatenated haystack. **Always**: when a filter/query behaves differently in the in-memory double vs the sqlite adapter, add a discriminating test that would fail on the divergent side; assert the same term in BOTH adapters.

