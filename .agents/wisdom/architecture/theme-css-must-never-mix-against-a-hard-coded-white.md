## Theme CSS must never mix against a hard-coded `white` (🟠 Major)

`::selection { background: color-mix(in oklab, var(--primary) 24%, white) }`
was invisible in dark mode: `white` is light in both themes, so the light
`--foreground` ink sat on a near-white highlight. The same class of bug shows up
whenever a token is mixed with a fixed colour instead of the theme surface.
Mix with `var(--surface)` (white in light, the dark card in dark) so the light
theme is byte-identical and dark follows its own tokens. The native `<select>`
had the sibling bug: `select option { color: var(--foreground); background-color:
var(--background) }` overrides the OS highlight's own text colour, so a hovered
option in dark mode was light-on-light. Leave `<option>` to the platform and
theme the closed control with `color-scheme` per theme.

**Always**: after any `color-mix`/overlay token, check both themes; and never
set `color`/`background-color` on native `<option>` — use `color-scheme`.

