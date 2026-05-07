# TauriOS Redesign — Design Specification
> Source: `tauri-handoff/tauri/project/` — read in full before implementing anything.
> Language: Arabic RTL is the primary language. English is secondary. Both must be equal-station.

---

## Fonts

### Load via Google Fonts (add to index.html)
```
Inter Tight: 400, 500, 600, 700
Inter: 400, 500, 600
Instrument Serif: italic 0;1, weight 400
JetBrains Mono: 400, 500
IBM Plex Sans Arabic: 400, 500, 600, 700
Noto Naskh Arabic: 400, 500, 600, 700
Amiri: 400, 700, italic
```

### Tailwind v4 font tokens (in styles.css @theme)
```css
--font-display: "Instrument Serif", "Cormorant Garamond", Georgia, serif;
--font-body:    "Inter Tight", "Inter", system-ui, sans-serif;
--font-mono:    "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;
```

### Arabic overrides (when lang="ar")
```css
html[lang="ar"] body { font-family: "IBM Plex Sans Arabic", "Noto Sans Arabic", system-ui; }
html[lang="ar"] .page-title, .section-title, .sb-name { font-family: "Amiri", "Noto Naskh Arabic", serif; font-style: normal; }
/* Mono stays JetBrains for numbers/codes */
/* letter-spacing: 0 on all label/tag elements (Arabic has no letter spacing) */
```

---

## Color Tokens

### Light theme (warm paper)
| Token          | Value       | Usage                        |
|----------------|-------------|------------------------------|
| `--bg`         | `#f6f3ee`   | App background               |
| `--bg-2`       | `#efeae2`   | Sidebar background           |
| `--surface`    | `#fbf9f5`   | Cards, table hover, inputs   |
| `--surface-2`  | `#f1ece4`   | Hover states, chips          |
| `--line`       | `#e3dccf`   | Borders, dividers            |
| `--line-2`     | `#d5cdbe`   | Darker borders on hover      |
| `--ink`        | `#1a1714`   | Primary text                 |
| `--ink-2`      | `#4a443c`   | Secondary text               |
| `--ink-3`      | `#7a7367`   | Muted/labels                 |
| `--ink-4`      | `#a89f91`   | Dim/placeholder              |
| `--accent`     | `#b4502a`   | Clay/terracotta — primary CTA|
| `--accent-2`   | `#d4754a`   | Accent hover                 |
| `--accent-soft`| `#f0e0d3`   | Accent background tint       |
| `--good`       | `#5a7a3a`   | Success/positive             |
| `--good-soft`  | `#e6ecda`   |                              |
| `--warn`       | `#b08020`   | Warning                      |
| `--warn-soft`  | `#f3e9cf`   |                              |
| `--bad`        | `#a83a2a`   | Error/negative               |
| `--bad-soft`   | `#f0d8d2`   |                              |

### Dark theme
| Token          | Value       |
|----------------|-------------|
| `--bg`         | `#16140f`   |
| `--bg-2`       | `#1c1914`   |
| `--surface`    | `#1f1c16`   |
| `--surface-2`  | `#25211a`   |
| `--line`       | `#2c2820`   |
| `--line-2`     | `#3a3528`   |
| `--ink`        | `#f0ebe0`   |
| `--ink-2`      | `#c9c2b3`   |
| `--ink-3`      | `#8a8276`   |
| `--ink-4`      | `#5a5448`   |
| `--accent`     | `#d97a4a`   |
| `--accent-2`   | `#e89968`   |
| `--accent-soft`| `#2e2418`   |
| `--good`       | `#94b06a`   |
| `--warn`       | `#d4a955`   |
| `--bad`        | `#d97565`   |

---

## Spacing System (4px base)
```css
--s-1: 4px   --s-2: 8px   --s-3: 12px  --s-4: 16px
--s-5: 20px  --s-6: 24px  --s-8: 32px  --s-10: 40px
--s-12: 48px --s-16: 64px
```

## Font Sizes
```css
--fs-xs: 11px  --fs-sm: 12.5px  --fs-base: 13.5px  --fs-md: 15px
--fs-lg: 18px  --fs-xl: 24px    --fs-2xl: 36px     --fs-3xl: 48px
```

## Layout
```css
--sidebar-w: 232px
--sidebar-collapsed-w: 56px
--header-h: 52px   /* compact: 44px, comfy: 60px */
--row-h: 40px      /* compact: 32px, comfy: 48px */
```

## Shadows
```css
--shadow-sm: 0 1px 0 rgba(0,0,0,.04)
--shadow-md: 0 1px 2px rgba(0,0,0,.06), 0 0 0 0.5px rgba(0,0,0,.04)
```

---

## Component Patterns

### Shell Layout
- `grid-template-columns: var(--sidebar-w) 1fr`
- Collapses to `--sidebar-collapsed-w` — text fades out, icons stay
- `height: 100vh; overflow: hidden`

### Sidebar (`.sb`)
- Background: `--bg-2`; right border `--line`
- Brand: logo mark (22×22 rounded box ink bg) + italic display font name
- Org block: avatar circle (accent bg) + name + chevron
- Nav groups: group label in 10.5px mono uppercase `--ink-4`
- Nav items: icon + label, active = `--surface` bg + left 2px `--accent` bar + accent icon color
- Count badge: mono 10.5px `--ink-4`, margin-left auto
- Footer: avatar gradient + user name + role

### Topbar (`.topbar`)
- Height `--header-h`, border-bottom `--line`
- Sidebar toggle → crumbs (separator = `›`) → spacer → search → theme toggle → bell → New btn (accent)
- Search: 280px wide, 30px tall, `--surface` bg, `--line` border, mono keyboard shortcut

### Page Header (`.page-h`)
- Grid 1fr auto
- Eyebrow: mono 10.5px uppercase `--ink-3`
- Title: display font, 48px, italic (LTR) / normal (Arabic via Amiri), letter-spacing -0.02em
- Sub: `--ink-3` 15px

### Stat Band (`.stat-band`)
- 4-col grid, `border-top` + `border-bottom` `--line`, no box shadow
- Each stat: label in mono uppercase 10.5px + big italic display value + meta row with delta badge
- Delta badge: mono 11px, `border-radius: 3px`, colored bg/fg for up/down/flat
- **No card wrappers** — just dividers between columns

### Section Header (`.section-h`)
- `display: flex; justify-content: space-between; align-items: baseline`
- Title: display font, italic 24px
- Right side: count in mono + action buttons + "see all →" link

### Tables (`.tbl`)
- `border-collapse: collapse`, full width
- `thead th`: mono 10.5px uppercase, `--ink-3`, left-aligned (right in RTL)
- Row hover: `--surface` bg
- Numeric columns: mono, tabular-nums, right-aligned (left in RTL)
- Row height: `--row-h`

### Tags/Badges (`.tag`)
- Mono font 10.5px, uppercase, 2px 7px padding, border-radius 3px
- Variants: default (surface-2/ink-2), good (good-soft/good), warn, bad, accent
- With `.dot` adds a 5px circle before content

### Buttons (`.btn`)
- 32px height, 7px radius, `--surface` bg, `--line` border
- `.btn-primary`: `--ink` bg, `--bg` text
- `.btn-accent`: `--accent` bg, white text
- `.btn-ghost`: transparent bg/border, `--ink-2` text
- `.btn-sm`: 26px height

### Tabs (`.tabs`)
- Flex row, `border-bottom: 1px solid --line`
- Active: `border-bottom: 2px solid --ink` (not accent)
- Count in mono 10.5px `--ink-4`

### Chips/Filters (`.chip`)
- 28px, 6px radius, `--surface` bg, `--line` border
- Active: `--ink` bg, `--bg` text

### Split Layout (`.split`)
- `grid-template-columns: 1fr 320px; gap: --s-10`
- Aside uses `.aside-block` with mono uppercase headers

### Feed/Activity
- `grid-template-columns: 56px 1fr auto`
- Time in mono 10.5px `--ink-4`, text in `--ink-2` with bold names in `--ink`

### Money Display
- Always mono tabular-nums
- `.pos` = `--good`, `.neg` = `--bad`

### Progress Bar (`.bar`)
- 4px height, `--line` bg, `--ink` fill, `.over` = `--bad` fill

### Quick Actions Grid
- 4-col grid, equal cells with shared borders (no gap)
- Each cell: icon + title (500 weight) + subtitle (muted) + shortcut key (absolute top-right, mono)

---

## RTL Rules

```css
[dir="rtl"] .sb               { border-right: 0; border-left: 1px solid var(--line); }
[dir="rtl"] .sb-item.is-active::before { left: auto; right: -1px; }
[dir="rtl"] .stat              { padding-right: 0; padding-left: var(--s-6); border-right: 0; border-left: 1px solid var(--line); }
[dir="rtl"] .stat:last-child  { border-left: 0; }
[dir="rtl"] .qa                { border-right: 0; border-left: 1px solid var(--line); }
[dir="rtl"] .qa:nth-child(4n) { border-left: 0; }
[dir="rtl"] .qa-shortcut       { right: auto; left: var(--s-3); }
[dir="rtl"] .tbl thead th     { text-align: right; }
[dir="rtl"] .tbl .num         { text-align: left; }
[dir="rtl"] .crumbs .crumb-sep { transform: scaleX(-1); }
[dir="rtl"] .sb-count          { margin-left: 0; margin-right: auto; }
[dir="rtl"] .av-stack .av:not(:first-child) { margin-left: 0; margin-right: -7px; }
```

**App already uses `dir="rtl"` on html element for Arabic.** Language is always Arabic (RTL). The design must default to Arabic layout.

---

## Page-by-Page Design Notes

### Dashboard
- Stat band: active projects / spent / receivable / payable
- 2-col layout: main (projects table + quick actions + expenses table) + 360px right (activity feed + stock alerts)
- Quick actions: 4×2 grid with keyboard shortcuts

### Projects List
- Filter tabs + site filter chips
- Table: proj-row hybrid (name/code/client + status tag + budget bar + due + crew avatars)
- Click row → project detail

### Project Detail
- Eyebrow: back link + code
- Stat band: status / progress / budget / due
- Split layout: main (expenses + assets + crew tables) + 320px aside (client / schedule / docs / photos)

### Warehouse
- Stat band: SKU count / value / low stock count / assigned count
- Tabs: All / Consumables / In-Use Assets / Low stock
- item-row: thumb + name/location + category tag + sku + stock (colored) + value + more btn
- Assigned assets table below

### Invoices
- Ledger head: receivable / payable / net position (3 columns, flat)
- Two sections: outbound invoices + inbound bills tables

### Employees
- Stat band: headcount / monthly payroll / outstanding advances / avg tenure
- Table: avatar + name + role + project tag + hired + phone + salary + debt

### Analytics
- Stat band + SVG line chart (revenue vs cost) + project spend breakdown

---

## UX Improvements (from user feedback)

### 1. Salary Payment — Replace multi-step with popup dialog
**Problem:** User navigates to employee → salary tab → add payment → details → confirm. Too many steps.
**Solution:** Single `<SalaryPaymentDialog>` component triggered from anywhere:
- Pre-filled: employee name, amount, date (today)
- Editable fields: amount, type (salary/advance), note
- Single confirm click → done
- No navigation required

### 2. Warehouse ↔ Project Transfer — Add inline dialog
**Problem:** No UI exists for transferring inventory between warehouse and project (or vice versa).
**Solution:** `<TransferItemDialog>` with:
- Item selector (searchable)
- From location (warehouse or project)
- To location (warehouse or project)
- Quantity (for consumables)
- Note
- Single confirm → done

### 3. Invoice Details Page
**Problem:** After creating an invoice, there's no styled details view.
**Solution:** `inventory-invoice-details-page.tsx` EXISTS but needs to be styled with the new design system and properly linked from the invoices list.

---

## Navigation Mapping (design → existing routes)

| Design page    | Existing route                        | Status        |
|----------------|---------------------------------------|---------------|
| dashboard      | `/`                                   | exists        |
| projects       | `/projects`                           | exists        |
| project detail | `/projects/$projectId`                | exists        |
| warehouse      | `/warehouses/$warehouseId`            | exists        |
| expenses       | (debts / transactions)                | partial       |
| invoices       | `/invoices`                           | exists        |
| invoice detail | `/invoices/$invoiceId`                | exists (route), needs design |
| partners       | `/externals`                          | exists        |
| employees      | `/employees`                          | exists        |
| analytics      | (no dedicated page yet)               | missing       |
| reports        | `/reports` (report builder)           | exists        |
| settings       | `/settings`                           | exists        |

---

## Tech Notes

- **Tailwind v4** — use CSS variables via `@theme inline`, no `tailwind.config.js`
- **shadcn/ui** — keep existing component library, override with new tokens
- **RTL** — `dir="rtl"` already applied on html; enhance with CSS RTL overrides
- **i18next** — Arabic translations already exist; extend for new strings
- **dark mode** — toggle via `.dark` class on html; map tokens to dark values
- **Existing font** — Noto Sans Arabic already loaded via `@fontsource-variable/noto-sans-arabic`; add IBM Plex Sans Arabic + Amiri + Instrument Serif via Google Fonts or @fontsource
