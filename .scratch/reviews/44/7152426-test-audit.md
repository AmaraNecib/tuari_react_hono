# Issue #44 test audit

**Reviewed SHA:** `7152426`
**Base:** `0165b7e`

## Coverage

The spec covers the requested acceptance criteria: normal popup geometry, 900x700 collision placement, keyboard label selection, 12 repeated click cycles, invoice debt consumer, and warehouse manager consumer. Per-test database reset keeps the five-option list deterministic and retry-safe.

## Findings and decisions

- Long-list scrolling, empty/error API states, horizontal collision, and request-payload assertions are useful broader coverage, but are outside Issue #44's stated regression scope. No change made.
- The normal and low-viewport tests assert the popup and the selected/target option, which is the relevant regression target; asserting every option would be incorrect for a scrollable list.
- The keyboard test uses page-level key events because Base UI transfers focus into the open popup. It verifies the resulting selected label and raw-ID absence.
- Manager option matching anchors the generated label prefix and preserves the phone suffix rendered by the consumer.

## Grade

B+ for focused, deterministic browser regression coverage. No blocking test-quality findings.
