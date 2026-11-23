## A CSS/DOM selector mismatch can make an a11y fix a user trap (🟠 Major)

Issue #284's "mobile sidebar can't be dismissed" turned out to be worse than
described: the `<div data-tour="sidebar">` wrapper around `<WorkspaceSidebar/>`
broke EVERY `.tauri-shell > aside` selector (mobile drawer overlay, `aside + div`
main-area grid, print/4K rules). The drawer never overlaid (aside stayed a static
52.5px sliver), but `.tauri-shell::after` (on the shell itself) DID match, so
opening the drawer on mobile showed a z-39 backdrop with `pointer-events: auto`
and NO click handler, covering the header toggle. The user was trapped on mobile.
Also `data-collapsed="true"` (specificity 0,2,0) beat the mobile `.tauri-shell`
`grid-template-columns: 1fr` (0,1,0), keeping the mobile grid at 52.5px + 1fr.

**Always**: when the issue says "X can't be dismissed/closed", verify the DOM
matches the CSS selectors before trusting that the control renders at all. A
wrapper div inserted for a tour target or analytics hook can silently sever the
selector chain, and the "can't dismiss" symptom is often a full trap. Test at the
actual mobile viewport (Playwright + computed styles), not just the unit level.
Check attribute-selector specificity fights between persisted state
(`data-collapsed`) and media-query overrides.

