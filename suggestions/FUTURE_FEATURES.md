# Future Features & System Enhancements

This document outlines feature suggestions to improve the Tuari enterprise management system. Features are categorized by business value, implementation effort, and priority.

---

## PHASE 1: CRITICAL BUSINESS VALUE (2-4 weeks)

### 1. Advanced Search & Filtering
**Business Value:** HIGH - Essential as data grows  
**Effort:** 2-3 days  
**Priority:** 1

**Description:**
- Unified search across multiple fields (invoice number, supplier name, asset ID, etc.)
- Saved filter presets ("Show only unpaid invoices", "Show pending transfers")
- Quick filters with one-click activation
- Filter history / recent filters

**Benefits:**
- Dramatically improves usability with large datasets
- Reduces time to find critical information
- Enables power users to work efficiently

**Implementation Outline:**
```
apps/web/src/features/shared/advanced-search-bar.tsx
- Search input with debounce
- Filter chip selector
- Save/load filter presets

apps/web/src/hooks/use-saved-filters.ts
- localStorage persistence
- Filter validation using existing Zod schemas

Updates to list pages:
- inventory-invoices-page.tsx
- outbound-transfers-page.tsx
- (and others with large datasets)
```

**Technical Considerations:**
- Use query parameters for filter state (shareable URLs)
- Persist filters to localStorage with max 10 presets
- Clear filters button always visible
- Mobile-friendly filter UI (drawer instead of sidebar)

---

### 2. Financial Reports & Analytics
**Business Value:** HIGH - Required for management decisions  
**Effort:** 4-5 days  
**Priority:** 2

**Description:**
- Inventory Report: Value by location, by item type, aging
- Debt Report: Aging, by party, by status, overdue ranking
- Movement Report: Transfer volume, trends, by location
- Export to PDF/Excel for sharing

**Benefits:**
- Provides visibility into financial position
- Enables data-driven decisions
- Supports external reporting requirements
- Identifies problem areas (slow-moving inventory, overdue debts)

**Implementation Outline:**
```
apps/web/src/features/reports/report-builder.tsx
- Report type selector
- Date range picker
- Filter options (location, status, etc.)
- Preview/export buttons

apps/web/src/features/reports/report-hooks.ts
- Query aggregated data from API
- Support PDF export via library (pdfkit or similar)
- Support CSV/Excel export

apps/api/src/rpc/handlers/reports.ts (NEW)
- inventoryValueReport
- debtAgingReport
- movementTrendReport
```

**Technical Considerations:**
- Create aggregate endpoints on API (don't fetch all details client-side)
- Cache report queries with longer TTL
- Scheduled reports (email daily/weekly summary)

---

### 3. Batch Operations
**Business Value:** MEDIUM-HIGH - UX improvement  
**Effort:** 2-3 days  
**Priority:** 3

**Description:**
- Bulk select items from lists
- Batch operations: delete, export, bulk status change
- Confirmation dialogs for destructive operations
- Progress indicator for long operations

**Benefits:**
- Reduces clicks for common operations
- Enables mass cleanup/migration
- Improves user productivity

**Implementation Outline:**
```
apps/web/src/features/shared/batch-operations-toolbar.tsx
- Checkbox select all / clear
- Selected count display
- Action buttons (delete, export, change status)
- Confirmation modal

apps/web/src/hooks/use-batch-selection.ts
- Manage selected IDs
- Bulk mutation support
- Progress tracking

Updates to list pages:
- Add checkboxes to each row
- Show toolbar when items selected
- Implement row selection on click
```

**Technical Considerations:**
- Limit batch size to prevent API overload (max 100 at a time)
- Show progress bar during bulk operations
- Provide rollback/undo option where possible
- Handle partial failures gracefully

---

### 4. Dashboard Enhancements
**Business Value:** MEDIUM - Improves visibility  
**Effort:** 3-4 days  
**Priority:** 4

**Description:**
- Inventory value summary (total DZD value of all assets)
- Debt aging breakdown (0-30, 31-60, 60+ days overdue)
- Movement trends (chart of transfers over last 30 days)
- Quick action cards (new invoice, new transfer, etc.)
- Top debtors/creditors ranking

**Benefits:**
- Provides at-a-glance system health
- Shows financial position
- Identifies urgent issues
- Reduces need for reports

**Implementation Outline:**
```
apps/web/src/features/dashboard/
├── dashboard-metrics.ts (hooks for metric queries)
├── value-summary-card.tsx
├── debt-aging-card.tsx
├── movement-trends-card.tsx
├── top-debtors-card.tsx
└── quick-actions-card.tsx

Update home-view.tsx to show dashboard cards
```

**Metrics to Track:**
- Total inventory value
- Outstanding debt total
- Overdue debt amount
- Monthly transfer volume
- Average days to pay

---

## PHASE 2: MEDIUM BUSINESS VALUE (2-3 weeks)

### 5. Recurring Transactions
**Business Value:** MEDIUM - Reduces manual entry  
**Effort:** 3-4 days  
**Priority:** 5

**Description:**
- Define recurring payment patterns (monthly salary, weekly supply order)
- Auto-create entries on schedule
- Manual review option before creation
- Disable/modify recurring patterns

**Benefits:**
- Eliminates repetitive data entry
- Ensures consistent employee compensation
- Reduces data entry errors

**Implementation Outline:**
```
apps/web/src/features/debts/recurring-pattern-dialog.tsx
- Pattern type (daily, weekly, monthly, custom)
- Amount (fixed or based on formula)
- Active date range
- Next occurrence display

apps/web/src/features/debts/recurring-patterns-page.tsx
- List of active patterns
- Edit/delete options
- Manual trigger for next occurrence

Backend: Add recurring logic to debt/salary processing
```

---

### 6. Audit Trail Viewer
**Business Value:** MEDIUM - Compliance & debugging  
**Effort:** 2-3 days  
**Priority:** 6

**Description:**
- View who changed what, when, why
- Filter by domain (inventory, debts, employees)
- Show before/after values
- Export audit logs

**Benefits:**
- Compliance with audit requirements
- Debugging issues ("who deleted this?")
- Accountability for actions
- Regulatory compliance

**Implementation Outline:**
```
apps/web/src/features/audit/audit-log-page.tsx
- Paginated log display
- Filter: actor, domain, date, action type
- Timeline view option
- Export button

apps/api/src/rpc/handlers/audit.ts (NEW)
- auditLogList endpoint (paginated)
- Support for filtering, sorting
- Role-based access control (admins only)
```

**Note:** System already logs via audit context - this just adds UI to view.

---

### 7. Multi-Tab Session Sync
**Business Value:** LOW-MEDIUM - Better UX for multi-window usage  
**Effort:** 1-2 days  
**Priority:** 7

**Description:**
- When user logs out in one tab, other tabs detect it
- When data changes in one tab, others see updates
- Synchronize filter/navigation state across tabs

**Benefits:**
- Better multi-window experience
- Prevents stale data across tabs
- Automatic logout propagation

**Implementation Outline:**
```
apps/web/src/hooks/use-tab-sync.ts
- Detect storage changes (localStorage events)
- Notify other tabs of important changes
- Sync authentication state
- Broadcast queryClient invalidations
```

---

## PHASE 3: QUALITY OF LIFE (1-2 weeks)

### 8. Mobile Improvements
**Business Value:** LOW-MEDIUM - Enables field teams  
**Effort:** 2-3 days  
**Priority:** 8

**Description:**
- Single-column form layouts on mobile
- Drawer-based dialogs (vs. centered modals)
- Touch-friendly button sizes
- Bottom sheet for actions
- Swipe-to-delete in lists

**Benefits:**
- Enables field teams to use app
- Better mobile-first experience
- Reduces scrolling/zooming

**Implementation Outline:**
- Add mobile layout variants using Tailwind breakpoints
- Create `useMobileLayout` hook for breakpoint detection
- Update form components for single column on mobile
- Add swipe gestures for common actions

---

### 9. Keyboard Shortcuts & Command Palette
**Business Value:** LOW - Power user feature  
**Effort:** 2 days  
**Priority:** 9

**Description:**
- Cmd/Ctrl + K to open command palette
- Quick shortcuts for common actions
- Searchable action list
- Show available shortcuts help

**Benefits:**
- Faster workflow for frequent users
- Professional app feel
- Reduces mouse usage

**Implementation Outline:**
```
apps/web/src/features/shared/command-palette.tsx
- Hotkey listener
- Action registry
- Search filtering
- Keyboard navigation

Common actions:
- New Invoice (Cmd + I)
- New Transfer (Cmd + T)
- Search (Cmd + K)
- Quick Payment (Cmd + P)
```

---

### 10. Export/Import with Validation
**Business Value:** MEDIUM - Data migration, backups  
**Effort:** 3-4 days  
**Priority:** 10

**Description:**
- Export data to CSV/JSON
- Import with validation using existing schemas
- Handle conflicts (duplicates, invalid rows)
- Progress indicator for large imports

**Benefits:**
- Enable data migration between systems
- Backup capability
- Bulk updates via spreadsheet
- Integration with external systems

**Implementation Outline:**
```
apps/web/src/features/shared/export-import-dialog.tsx
- Format selector (CSV, JSON, Excel)
- Template download
- File upload
- Validation report
- Conflict resolution UI

apps/web/src/features/shared/use-import-mutation.ts
- Use existing Zod schemas for validation
- Atomic import (all or nothing)
- Detailed error reporting

apps/api/src/rpc/handlers/import-export.ts (NEW)
- Batch create endpoints
- Validation on server-side
```

---

## PHASE 4: ADVANCED FEATURES (3-4 weeks)

### 11. Offline Mode (Desktop)
**Business Value:** MEDIUM - Field operations  
**Effort:** 4-5 days  
**Priority:** 11

**Description:**
- Queue mutations when offline
- Show offline status in UI
- Auto-retry when online
- Sync conflict resolution

**Benefits:**
- Desktop app works without internet
- Reduces data loss risk
- Better field team experience

**Implementation Outline:**
```
apps/web/src/features/offline/offline-manager.ts
- Detect network status
- Queue mutations
- Persist queue to localStorage
- Auto-retry with exponential backoff

apps/web/src/features/offline/offline-indicator.tsx
- Show offline status
- Retry button
- Queue status display
```

---

### 12. Inventory Reconciliation
**Business Value:** HIGH - Financial accuracy  
**Effort:** 4-5 days  
**Priority:** 12

**Description:**
- Import physical count data
- Compare vs. system records
- Show discrepancies
- Create adjustment entries
- Generate reconciliation report

**Benefits:**
- Ensures inventory accuracy
- Identifies theft/loss
- Supports financial audits

**Implementation Outline:**
```
apps/web/src/features/inventory/reconciliation-page.tsx
- Upload physical count CSV
- Match against system records
- Show variances (missing, extra, wrong quantity)
- Approve adjustments
- Generate report

apps/api/src/rpc/handlers/reconciliation.ts (NEW)
- reconciliationImport
- reconciliationReport
```

---

### 13. Barcode/QR Scanning
**Business Value:** MEDIUM - Warehouse efficiency  
**Effort:** 3-4 days  
**Priority:** 13

**Description:**
- Scan asset barcode to view/transfer
- Scan to complete transfers
- Generate barcodes for new assets
- Thermal printer integration (desktop)

**Benefits:**
- Faster warehouse operations
- Reduces data entry errors
- Better asset tracking

**Implementation Outline:**
```
apps/web/src/features/inventory/barcode-scanner.tsx
- Barcode input detection
- Quick asset lookup
- Transfer completion
- History of scanned items

For desktop:
- Barcode printer support
- Generate printable labels with QR codes
```

---

### 14. Scheduled Reports Email
**Business Value:** MEDIUM - Automated insights  
**Effort:** 2-3 days  
**Priority:** 14

**Description:**
- Schedule daily/weekly report emails
- Send to multiple recipients
- Include key metrics
- Customizable report format

**Benefits:**
- Reduces need for manual reporting
- Keeps stakeholders informed
- Automated insights delivery

**Implementation Outline:**
```
Backend (API):
- Schedule email job
- Generate report PDF
- Send via SMTP
- Track delivery

Frontend:
- Scheduled report config page
- Recipient management
- Report template selection
```

---

## NICE-TO-HAVE FEATURES

### 15. Dark Mode
**Effort:** 1-2 days  
**Current:** Already has theme toggle  
**Note:** Check if Tailwind dark mode is fully utilized

### 16. Localization Beyond Arabic
**Effort:** 2-3 days  
**Note:** Currently Arabic-only. Add English if needed for international teams.

### 17. Two-Factor Authentication
**Effort:** 2-3 days  
**Note:** For high-security environments. Can use email/SMS/TOTP.

### 18. Role-Based Access Control (RBAC) Enhancements
**Effort:** 2-3 days  
**Note:** Currently has basic roles. Add field-level permissions if needed.

---

## IMPLEMENTATION ROADMAP

**Month 1:**
- Phase 1 (search, reports, batch operations) → 1-2 weeks
- Phase 2 (audit, recurring) → 1 week

**Month 2:**
- Phase 3 (mobile, shortcuts) → 1 week
- Phase 4 Start (offline mode) → 1 week

**Month 3:**
- Complete Phase 4 (barcode, reconciliation)
- Nice-to-have features

---

## ESTIMATED TOTAL EFFORT

- All Phase 1-2 features: **4-5 weeks**
- All Phase 1-3 features: **6-7 weeks**
- All Phase 1-4 features: **10-12 weeks**

Prioritize based on:
1. **User impact** (how many people benefit?)
2. **Effort** (can we ship in 2-3 days?)
3. **Business value** (does it solve a real problem?)

---

## CRITERIA FOR ADDING NEW FEATURES

Before implementing a new feature, verify:

1. ✓ **Real Problem** - Does it solve a documented pain point?
2. ✓ **User Research** - Have actual users asked for it?
3. ✓ **ROI** - Does benefit justify implementation effort?
4. ✓ **Maintenance** - Will it need ongoing support?
5. ✓ **Technical Debt** - Does it add complexity?
6. ✓ **Testing** - Can we add tests to prevent regressions?

Avoid adding features that:
- ❌ Duplicate existing functionality
- ❌ Add one-off customization (slippery slope)
- ❌ Require continuous maintenance
- ❌ Slow down core workflows
- ❌ Are rarely used

---

## Questions for Product Decisions

When considering a feature:

1. Who benefits? (How many users? What roles?)
2. What does success look like? (Metrics)
3. What happens if we don't build it? (Real consequence?)
4. Can we solve it differently? (Cheaper approach?)
5. Can we do it incrementally? (MVP approach?)
