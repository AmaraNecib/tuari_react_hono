## Playwright: `getAllByRole` throws on zero matches. Use `queryAllByRole` for zero-count assertions (🟡 Minor)

A `waitFor(() => expect(getAllByRole(...).length).toBe(0))` fails with "Unable to find" instead of "expected 0". `getAllBy*` throws when nothing matches. For asserting an EMPTY result, use `queryAllByRole(...).length === 0`. **Always**: count assertions that may legitimately reach zero use the `queryAll*` variants.

