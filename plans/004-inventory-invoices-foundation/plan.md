# Plan 004 - Inventory Items, Assets, and Invoice Foundation

**Date:** 2026-04-05  
**Status:** Draft  
**Priority:** High  
**Scope:** Backend-first inventory foundation with typed item definitions, invoice grouping, attachment storage, and minimal UI hooks

---

## Overview

This plan adds a real inventory domain to the current system.

The current codebase has warehouses, but they represent workplace/location management and employee assignment history, not stock or inventory movement. There is currently no inventory, asset, invoice, or file attachment backend model.

This phase introduces:

1. Inventory item definitions with two item types:
   - consumable
   - asset
2. Invoice-level grouping so many items can be added together under one invoice
3. Attachment storage for invoice files with database metadata and filesystem storage
4. Minimal inventory/invoice navigation so the UI can list invoices and open invoice details
5. A structure that can later support stock movements, asset assignment, depreciation, and richer UI without reworking the base tables

---

## Goals

1. Allow creating reusable inventory item definitions.
2. Allow each item definition to declare whether it is `CONSUMABLE` or `ASSET`.
3. For consumables, require a unit of measure.
4. For assets, support asset-specific item entry fields.
5. Allow adding many inventory entries in one operation under one invoice.
6. Allow uploading and saving an invoice attachment.
7. Allow listing invoices and seeing the items that were added from each invoice.
8. Keep the first implementation backend-first and UI-light.

---

## Non-Goals For This Phase

1. Full stock movement history between warehouses/projects.
2. Asset depreciation/accounting rules.
3. Supplier normalization as a dedicated master-data domain.
4. OCR or invoice data extraction.
5. Advanced permissions beyond existing authenticated workspace behavior.

---

## Recommended Domain Shape

### 1. Item Definition

Reusable catalog/master record used when creating inventory entries.

Suggested fields:

- `id`
- `name`
- `itemType` = `CONSUMABLE | ASSET`
- `unit` nullable, required when `itemType = CONSUMABLE`
- `description` nullable
- `isActive`
- `createdAt`
- `updatedAt`

### 2. Invoice Group

Represents one invoice or purchase/import batch.

Suggested fields:

- `id`
- `invoiceNumber` nullable
- `supplierName` nullable
- `invoiceDate` nullable
- `warehouseId` nullable
- `note` nullable
- `createdAt`
- `updatedAt`

### 3. Invoice Attachment

Stores metadata in DB and file bytes on disk.

Suggested fields:

- `id`
- `invoiceGroupId`
- `originalName`
- `mimeType`
- `byteSize`
- `storageKey`
- `relativePath`
- `sha256` nullable
- `createdAt`

### 4. Inventory Entry

Represents what was actually added under the invoice.

Suggested shared fields:

- `id`
- `invoiceGroupId`
- `itemDefinitionId`
- `warehouseId` nullable
- `itemTypeSnapshot`
- `itemNameSnapshot`
- `quantity`
- `unitSnapshot` nullable
- `unitPrice`
- `totalPrice`
- `note` nullable
- `createdAt`
- `updatedAt`

Suggested asset-specific fields for first phase:

- `assetName` nullable
- `assetSerialNumber` nullable
- `assetCondition` nullable
- `purchaseDate` nullable

---

## Recommended First-Phase Rules

### Item Definition Rules

1. `name` is always required.
2. `itemType` is always required.
3. If `itemType = CONSUMABLE`, `unit` is required.
4. If `itemType = ASSET`, `unit` must be null.

### Inventory Entry Rules

1. Every entry belongs to exactly one invoice group.
2. Every entry references one item definition.
3. `quantity > 0`.
4. `unitPrice >= 0`.
5. `totalPrice >= 0`.
6. For consumables:
   - total price can be computed from quantity x unit price
   - editing total price should be allowed and should back-calculate unit price in UI
7. For assets:
   - the first phase will support asset-specific fields, but we need a final decision on whether one line may represent multiple assets or only one asset per entry

---

## Recommended Backend Modules

Do not extend `CompanyService` further for this feature.

Create a new `inventory` module with:

1. `inventory.types.ts`
2. `inventory.repository.ts`
3. `inventory.repository-mappers.ts`
4. `inventory.service.ts`
5. `inventory.service.test.ts`

Contracts and router additions:

1. `packages/contracts/src/index.ts`
2. `apps/api/src/rpc/router.ts`

Database touch points:

1. `apps/api/prisma/schema.prisma`
2. `apps/api/src/infrastructure/database/schema-definitions.ts`
3. `apps/api/src/infrastructure/database/schema.ts`

---

## Storage Recommendation

Store invoice files on disk, not inside SQLite blobs.

Suggested location:

- `data/attachments/invoices/<invoiceGroupId>/<attachmentId>-<safeFileName>`

Store only metadata and path in the database.

Why:

1. Keeps SQLite small and healthy.
2. Works well for PDF/image invoice files.
3. Allows future file cleanup and replacement rules.

---

## API Surface - First Phase

### Item Definitions

1. `inventoryItemDefinitionsList`
2. `inventoryItemDefinitionsGet`
3. `inventoryItemDefinitionsCreate`
4. `inventoryItemDefinitionsUpdate`

### Invoice Groups

1. `inventoryInvoiceGroupsList`
2. `inventoryInvoiceGroupsGet`
3. `inventoryInvoiceGroupsCreate`

### Inventory Entries

1. `inventoryEntriesList`
2. `inventoryEntriesGet`

### Attachments

First phase decision needed:

1. upload through API as multipart/base64
2. upload through desktop/local bridge and save metadata through API

Recommended: start with one simple API-backed upload path if current stack already supports it cleanly; otherwise create invoice first, then attach file metadata through a small dedicated endpoint.

---

## Minimal UI Scope

### Page 1 - Create Item Definition

Required fields:

1. item name
2. item type
3. unit, only when consumable

Minimal behavior:

1. If type changes to `CONSUMABLE`, show unit field.
2. If type changes to `ASSET`, hide unit field.

### Page 2 - Add Inventory By Invoice

Required flow:

1. choose warehouse
2. create or identify invoice group
3. upload invoice attachment
4. add many line items under that invoice
5. submit once

Consumable entry fields:

1. item definition
2. quantity
3. unit price
4. total price

Behavior:

1. quantity x unit price updates total
2. editing total recalculates unit price

Asset entry fields:

1. item definition
2. quantity or count, depending on final decision
3. asset-specific fields matching the allocation UI pattern in the screenshots
4. purchase price data

### Page 3 - Invoice List / Sidebar Access

Required behavior:

1. show invoices in navigation or as a secondary inventory list view
2. opening an invoice shows:
   - invoice metadata
   - linked file
   - all entries created from it

---

## Open Product Decisions

These must be confirmed before implementation is finished.

### Decision 1 - Asset granularity

Options:

1. One asset entry can represent many assets with per-asset details nested under it.
2. One asset entry always represents one physical asset.
3. One invoice line can create many asset records automatically from `quantity`.

Recommended:

3. One invoice line can create many asset records automatically from `quantity`, because it matches your current asset-entry screenshots while still producing one real record per asset.

### Decision 2 - Asset-specific first-phase fields

Options:

1. Keep only the screenshot fields: asset name, serial number, condition, purchase date, notes.
2. Add asset tag/code now as well.
3. Add supplier warranty / expected lifetime now.

Recommended:

2. Add asset tag/code now if available, because it is low cost and useful for future tracking.

### Decision 3 - Invoice relationship to warehouse

Options:

1. The whole invoice belongs to one warehouse.
2. Each entry chooses its own warehouse.
3. Support both invoice default warehouse and per-entry override.

Recommended:

3. Support both, with invoice-level default warehouse and optional per-entry override.

### Decision 4 - Attachment count

Options:

1. One invoice file only.
2. Multiple files per invoice.

Recommended:

2. Multiple files per invoice, because it is only slightly more work and avoids rework later.

---

## Security and Reliability Checklist

1. Validate MIME type and file extension on upload.
2. Enforce file size limit.
3. Sanitize stored file names and never trust the client path.
4. Store files outside publicly writable web paths.
5. Validate `quantity`, `unitPrice`, and `totalPrice` server-side.
6. Reject inconsistent item type payloads.
7. Use DB transaction for invoice group plus entries plus attachment metadata.
8. If file save succeeds and DB write fails, clean up orphaned files.
9. If DB write succeeds and later file work fails, return a clear recoverable error.
10. Keep warehouse FK optional only if the business rule truly allows it.

---

## Implementation Milestones

### Milestone 1 - Contracts and Schema

- [ ] Add inventory enums and schemas to shared contracts.
- [ ] Add item definition, invoice group, invoice attachment, and inventory entry tables.
- [ ] Update both Prisma schema and raw SQL schema definitions.
- [ ] Add indexes and check constraints.

### Milestone 2 - Backend Module

- [ ] Create `inventory` module types, repository, mappers, and service.
- [ ] Add list/get/create/update flows for item definitions.
- [ ] Add create/list/get flows for invoice groups and entries.
- [ ] Add attachment metadata handling.

### Milestone 3 - File Storage

- [ ] Add local storage helper for invoice attachments.
- [ ] Add validation for type, size, and safe path naming.
- [ ] Add failure cleanup behavior.

### Milestone 4 - Minimal UI Wiring

- [ ] Add item definition create page.
- [ ] Add invoice-based inventory create page.
- [ ] Add invoice list/detail page.
- [ ] Add sidebar entry or inventory section navigation.

### Milestone 5 - Review and Hardening

- [ ] Add tests for type validation and money calculation rules.
- [ ] Add tests for invoice group creation with many entries.
- [ ] Add tests for attachment metadata and cleanup behavior.
- [ ] Run security and maintainability review.

---

## UI Generation Prompt Seed

Use this later with your UI-focused model:

```text
Build a minimal RTL inventory UI inside the existing web app using the current component library and route patterns.

Context:
- Existing app is a TanStack Router + React + TypeScript workspace shell.
- Preserve the current dark theme, RTL layout, spacing language, and sidebar patterns.
- Do not redesign the whole app.
- Keep UI minimal and consistent with existing cards, inputs, buttons, and detail pages.

Pages to create:
1. Item definition create page
2. Inventory add by invoice page
3. Invoice list page
4. Invoice detail page

Behavior:
- Item definition form must support two types: CONSUMABLE and ASSET.
- Show `unit` only for consumables.
- Inventory add page must allow many line items under one invoice.
- Consumable lines need quantity, unit price, total price with two-way recalculation.
- Asset lines should mirror the existing asset-entry form language and field density from the current warehouse allocation screenshots.
- Invoice detail page should show invoice metadata, attachment links, and all linked items.

Constraints:
- Use existing shared UI primitives first.
- Keep labels in Arabic-ready form and follow existing translation/i18n patterns where available.
- Avoid introducing a brand new design system.
- Favor clean data-entry UX over decorative visuals.
```

---

## Current Recommendation

Proceed with a backend-first `inventory` module and implement:

1. item definitions
2. invoice groups
3. invoice attachments
4. inventory entries

Then add only the smallest UI needed to create item definitions, create invoice batches, and browse invoices.

---

## Phase Extension - Movements And Settlement

Confirmed follow-up decisions:

1. Keep both movement history and current-location snapshots.
2. Consumables move by quantity.
3. Assets move one unit at a time.
4. If an external partner exists and part of the invoice is unpaid, create debt automatically from the unpaid balance.
5. Purchase payment may be entered as amount or percent.

Minimal targets for this extension:

- [ ] Add `inventory_movement` for purchase and transfer history
- [ ] Add asset current-location snapshots
- [ ] Add consumable balances per location
- [ ] Show current contents on warehouse/project detail pages
- [ ] Show movement history and transfer actions on invoice detail pages
- [ ] Link unpaid invoice balance to external partner debt creation
