## react-day-picker's default chevron is a black-filled polygon (🟡 Minor)

`chevron: ""` in the `classNames` left react-day-picker's default `<svg><polygon>`
with no `fill` attribute, so it rendered black in both themes (invisible on the
dark popup). Give it `fill-current` so it inherits the nav button's ink token
(`text-ink-3`), and add explicit `disabled:*`/`focus-visible:*` classes because
the library ships no default CSS here.

**Always**: when overriding a component library's default class to `""`, check
what the default element actually paints (attribute vs `currentColor`); an empty
class is not "theme-aware", it is "unstyled default".
