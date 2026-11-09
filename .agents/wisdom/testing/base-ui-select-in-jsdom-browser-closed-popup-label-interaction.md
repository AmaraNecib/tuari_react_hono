## Base UI Select in jsdom/browser: closed-popup label + interaction (🟢 Minor)

`@base-ui/react`'s Select only registers its items while the popup is OPEN — a
closed trigger's text resolves via `stringifyAsLabel(value)` when no `items`
prop is passed, so a controlled `value` renders as the RAW VALUE (e.g. a UUID)
or, on some re-renders, looks "reset". Fix the display at the component level
(`SelectValue.children` = matched option name), not per page. Test note: Base
UI commits an option click only when the option is `highlighted`
(`activeIndex` set by pointer hover); a bare `fireEvent.click` silently
no-ops — dispatch `mouseDown` on the trigger, then `mouseEnter` + `click` on
the option (scope queries to `[role=listbox]` so native `<select>` options
don't shadow them). Behavior verified in a real browser before finalizing.

