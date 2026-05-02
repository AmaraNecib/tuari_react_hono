# Phase 1-3 Feature Delivery Plan

## Overview

Implementation roadmap for Phase 1-3 features of the Tuari system. Excludes: Offline Mode, Barcode/QR Scanning, Scheduled Reports Email (defer to V2).

**Target Timeline:** 6-7 weeks
**Target Completion:** End of Month 2

---

## Multi-Tab Sync Strategy

### Problem
Users often have multiple tabs open simultaneously (e.g., managing workers in Tab 1, assigning projects in Tab 2). Without sync, changes in one tab don't immediately reflect in another.

### Solution: React Query Cache Sync Engine

Leverage React Query's built-in cache invalidation + browser storage events:

1. **Storage Event Listener** (`use-tab-sync.ts`):
   - Listen to localStorage changes from other tabs
   - Detect when user creates/updates/deletes entities
   - Automatically invalidate affected React Query caches

2. **Implementation**:
   ```tsx
   // When mutation succeeds in Tab 1, broadcast via storage
   onSuccess: () => {
     localStorage.setItem('cache-invalidate-debts', Date.now())
   }

   // Tab 2 listens and invalidates
   useEffect(() => {
     window.addEventListener('storage', (e) => {
       if (e.key === 'cache-invalidate-debts') {
         queryClient.invalidateQueries({ queryKey: ['debts'] })
       }
     })
   }, [])
   ```

3. **Benefits**:
   - No additional server sync needed
   - Real-time cache updates across tabs
   - Uses existing React Query infrastructure
   - Lightweight (just localStorage events)

---

## PHASE 1: CRITICAL BUSINESS VALUE (2-4 weeks)

### Priority 1: Advanced Search & Filtering
**Effort:** 2-3 days | **Value:** HIGH

**Deliverables:**
- `apps/web/src/features/shared/advanced-search-bar.tsx` — search + filter UI
- `apps/web/src/hooks/use-saved-filters.ts` — localStorage persistence
- Integration into all list pages (invoices, transfers, debts, employees)

**Features:**
- Unified search across multiple fields with debounce
- Saved filter presets (max 10)
- Quick filter chips with one-click activation
- Filter history for power users
- Mobile-friendly drawer-based filters

**Dependencies:** None (builds on existing infrastructure)

---

### Priority 2: Financial Reports & Analytics
**Effort:** 4-5 days | **Value:** HIGH

**Deliverables:**
- `apps/web/src/features/reports/report-builder.tsx` — UI for report generation
- `apps/web/src/features/reports/report-hooks.ts` — API queries
- `apps/api/src/rpc/handlers/reports.ts` (NEW) — report endpoints
- Export to PDF/Excel

**Report Types:**
- **Inventory Report:** Value by location, by item type, aging analysis
- **Debt Report:** Aging breakdown (0-30, 31-60, 60+ days), by party, overdue ranking
- **Movement Report:** Transfer volume, trends by location

**Technical:**
- Create aggregate API endpoints (don't fetch all details client-side)
- Cache with longer TTL
- Reuse existing Zod schemas for validation

**Dependencies:** Database schema (reports can aggregate existing data)

---

### Priority 3: Batch Operations
**Effort:** 2-3 days | **Value:** MEDIUM-HIGH

**Deliverables:**
- `apps/web/src/features/shared/batch-operations-toolbar.tsx`
- `apps/web/src/hooks/use-batch-selection.ts`
- Integration into list views

**Features:**
- Bulk select (checkbox per row + "select all" toggle)
- Batch operations: delete, export, change status
- Progress indicator for long operations
- Confirmation dialogs for destructive ops
- Rollback/undo support where possible

**Constraints:**
- Max 100 items per batch (prevent API overload)
- Handle partial failures gracefully

**Dependencies:** Existing mutation hooks

---

### Priority 4: Dashboard Enhancements
**Effort:** 3-4 days | **Value:** MEDIUM

**Deliverables:**
- `apps/web/src/features/dashboard/` — new dashboard cards
- Metrics: total inventory value, debt aging, movement trends, top debtors

**Components:**
- `value-summary-card.tsx` — total DZD value of all assets
- `debt-aging-card.tsx` — 0-30/31-60/60+ breakdown
- `movement-trends-card.tsx` — chart of transfers (last 30 days)
- `top-debtors-card.tsx` — ranking by amount owed
- `quick-actions-card.tsx` — buttons for common workflows

**Technical:**
- Reuse existing aggregate queries from Reports
- Charts via recharts (already in deps)
- Consider prefetching on dashboard mount

**Dependencies:** Financial Reports (shared aggregate endpoints)

---

## PHASE 2: MEDIUM BUSINESS VALUE (2-3 weeks)

### Priority 5: Recurring Transactions
**Effort:** 3-4 days | **Value:** MEDIUM

**Deliverables:**
- `apps/web/src/features/debts/recurring-pattern-dialog.tsx`
- `apps/web/src/features/debts/recurring-patterns-page.tsx`
- Backend recurring schedule logic

**Features:**
- Define patterns (daily, weekly, monthly, custom)
- Fixed amount or formula-based
- Active date ranges
- Manual review before auto-creation
- Disable/modify patterns

**Benefits:**
- Eliminates repetitive data entry
- Ensures consistent employee compensation
- Reduces errors

**Dependencies:** Debt entry infrastructure (mostly exists)

---

### Priority 6: Audit Trail Viewer
**Effort:** 2-3 days | **Value:** MEDIUM

**Deliverables:**
- `apps/web/src/features/audit/audit-log-page.tsx`
- `apps/api/src/rpc/handlers/audit.ts` (NEW)

**Features:**
- Paginated log display
- Filters: actor, domain, date, action type
- Timeline view option
- Before/after value comparison
- Export to CSV

**Note:** System already logs via audit context — this is just viewing UI.

**Dependencies:** Existing audit infrastructure (already in DB)

---

### Priority 7: Multi-Tab Session Sync (INCLUDED)
**Effort:** 1-2 days | **Value:** MEDIUM

**Implementation:**
- `apps/web/src/hooks/use-tab-sync.ts` — localStorage event listener
- Detect logout in one tab → propagate to others
- Sync cache invalidation across tabs (see Multi-Tab Sync Strategy above)
- Broadcast important mutations via storage events

**Benefits:**
- Better multi-window experience
- No stale data across tabs
- Automatic logout propagation
- Real-time updates without server sync

---

## PHASE 3: QUALITY OF LIFE (1-2 weeks)

### Priority 8: Mobile Improvements
**Effort:** 2-3 days | **Value:** LOW-MEDIUM

**Deliverables:**
- Responsive form layouts (single column on mobile)
- Drawer-based dialogs vs. centered modals
- Touch-friendly button sizes (min 48px)
- Bottom sheet for action menus
- Swipe-to-delete in lists

**Technical:**
- Tailwind breakpoints (md: 768px, lg: 1024px)
- `useMobileLayout` hook for breakpoint detection
- Update all form components

**Note:** Low priority for V1 (desktop focus), but improves UX.

---

### Priority 9: Keyboard Shortcuts & Command Palette
**Effort:** 2 days | **Value:** LOW

**Deliverables:**
- `apps/web/src/features/shared/command-palette.tsx`
- Hotkey listener + action registry

**Shortcuts:**
- `Cmd/Ctrl + K` — open palette
- `Cmd + I` — new invoice
- `Cmd + T` — new transfer
- `Cmd + P` — quick payment
- `Cmd + /` — help

**Benefits:**
- Faster workflow for power users
- Professional app feel
- Reduces mouse usage

---

### Priority 10: Export/Import with Validation
**Effort:** 3-4 days | **Value:** MEDIUM

**Deliverables:**
- `apps/web/src/features/shared/export-import-dialog.tsx`
- `apps/web/src/features/shared/use-import-mutation.ts`
- `apps/api/src/rpc/handlers/import-export.ts` (NEW)

**Features:**
- Format selector (CSV, JSON, Excel)
- Template download
- File upload with validation
- Conflict resolution UI
- Progress indicator for large imports
- Atomic import (all or nothing)

**Technical:**
- Reuse existing Zod schemas for validation
- Server-side validation required
- Handle duplicates gracefully

**Benefits:**
- Data migration between systems
- Backup capability
- Bulk updates via spreadsheet
- Integration with external systems

---

## Implementation Timeline

### Week 1-2 (Phase 1, Start)
- Advanced Search & Filtering (Priority 1)
- Start Financial Reports (Priority 2)

### Week 3 (Phase 1, Complete)
- Batch Operations (Priority 3)
- Dashboard Enhancements (Priority 4)
- Complete Financial Reports

### Week 4-5 (Phase 2)
- Recurring Transactions (Priority 5)
- Audit Trail Viewer (Priority 6)
- Multi-Tab Session Sync (Priority 7)

### Week 6 (Phase 3)
- Mobile Improvements (Priority 8)
- Keyboard Shortcuts (Priority 9)

### Week 7 (Phase 3, Complete)
- Export/Import (Priority 10)
- Polish & testing

---

## Testing Strategy

### Unit Tests
- Form validation logic (useFormAmount, useSavedFilters, etc.)
- Hooks (cache invalidation, sync behavior)
- Utility functions

### Integration Tests
- Multi-tab sync via localStorage events
- Cache invalidation after mutations
- Report generation with filters
- Batch operations with partial failures

### Manual Testing
- Each feature in browser before merge
- Multi-tab scenarios (worker tab + project tab)
- Mobile responsiveness
- Keyboard shortcuts

---

## Dependencies & Assumptions

**Database:** No new tables needed (reports aggregate existing data)

**API Endpoints:** 
- New: `reports/*`, `audit/*`, `import-export/*`
- Existing: debts, inventory, employees (sufficient for all features)

**Frontend Libraries:**
- recharts (already in deps) — charts for dashboard/reports
- date-fns (already in deps) — date formatting

**Architecture:**
- React Query cache sync via localStorage (no new packages)
- Existing Zod schemas sufficient for validation
- Existing audit context sufficient for audit trail

---

## Success Metrics

**Phase 1:**
- Users can find data 3x faster (advanced search)
- Financial visibility improves (reports)
- Batch operations reduce clicks by 50%+

**Phase 2:**
- Recurring transactions reduce manual entry by 80%+
- Audit compliance met
- Multi-tab sync eliminates data confusion

**Phase 3:**
- Mobile UX acceptable (load time < 2s)
- Power users adopt shortcuts (>50%)
- Export/import enables data mobility

---

## Rollback Strategy

Features can be rolled back independently:
- Feature flags not needed (clean implementation)
- New pages don't affect existing pages
- Cache invalidation is additive (safe to remove)
- Multi-tab sync can be disabled via `enableTabSync` env var

---

## Notes for Development

1. **Start with Priority 1** — advanced search has lowest risk, high value
2. **Batch Priority 2 & 4** — reports + dashboard share aggregate endpoints
3. **Multi-tab sync** is foundational for all later phases (implement early)
4. **Test multi-tab scenarios** thoroughly (localStorage events are tricky)
5. **Mobile considerations** deferred until Phase 3 (but keep responsive in mind)

---

## Next Steps

1. Approval from stakeholders (current document)
2. Break down into tasks (TaskCreate in Claude Code)
3. Begin Priority 1: Advanced Search & Filtering
4. Save this plan as source of truth for delivery
