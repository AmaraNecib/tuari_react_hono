## A client-side `?? default` survives a server default removal (🟠 Major)

The same change removed `input.direction ?? "PAYABLE"` from the service, but the
web `useCreateDebtAccountMutation` still had `direction: input.direction ??
"PAYABLE"` and `openingBalanceDzd: input.openingBalanceDzd ?? 0`. The first
reintroduced the silent default at a new layer; the second turned "no opening
balance" into a supplied `0`, which the new `.positive()` schema rejects — so
empty-account creation would have broken while every mocked web test stayed
green.

**Always**: when removing a server-side default, grep the client layer for the
same `?? default` / `?? 0` coercion. The value the client sends is the value the
wire validates; "omitted" must stay omitted for an optional field.
