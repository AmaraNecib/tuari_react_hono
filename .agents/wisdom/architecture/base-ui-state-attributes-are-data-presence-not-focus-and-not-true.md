## Base UI state attributes are `data-*` presence, not `:focus` and not `="true"` (🟠 Major)

The shared `Select` styled its items with `focus:bg-accent focus:text-accent-foreground`.
Base UI marks the active option with `data-highlighted` (value `""`) and the
chosen option with `data-selected` (value `""`), and it drives the highlight
from pointer/keyboard state rather than per-item focus, so the `:focus` variant
misses real highlight states. Worse, this repo's `shadcn/tailwind.css` defines
`@custom-variant data-selected { &:where([data-selected="true"]) }`, which a
Base UI `data-selected=""` never matches; the bare `data-selected:` variant
silently generates dead CSS. Use the arbitrary form `data-[selected]:` (→
`[data-selected]`) and style `data-[highlighted]:` for hover/keyboard.

**Always**: for Base UI (or any primitive that emits bare boolean `data-*`
attributes), grep the compiled stylesheet for the generated selector before
trusting a `data-*` variant. If it contains `="true"` and the runtime attribute
is `""`, switch to the `data-[attr]:` arbitrary form. Style the state attribute,
not `:focus`, so pointer and keyboard highlight stay in sync.

