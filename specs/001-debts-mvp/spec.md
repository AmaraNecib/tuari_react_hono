# Feature Specification: Debt Management MVP

**Feature Branch**: `001-debts-mvp`  
**Created**: 2026-03-27  
**Status**: Draft  
**Input**: User description: "Add MVP debt management for internal workers and external counterparties with balances, settlements, and money-only ledger tracking"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Track internal worker debts (Priority: P1)

As a manager, I want to track money balances with existing workers so I always know whether a worker still owes the company money or the company still owes the worker money.

**Why this priority**: Internal worker balances are the most immediate need and reuse existing worker records, making this the smallest valuable MVP slice.

**Independent Test**: Can be fully tested by opening a worker debt page, creating an opening balance, adding offsetting entries, and confirming the net balance, colors, and settlement behavior update correctly.

**Acceptance Scenarios**:

1. **Given** an existing worker with no debt account, **When** the manager creates a worker debt with a positive amount, **Then** the worker shows an open balance that is marked as money owed to the company.
2. **Given** an existing worker with an open positive balance, **When** the manager records a payment that reduces that balance, **Then** the remaining balance updates correctly and the ledger shows both entries.
3. **Given** a worker with both positive and negative entries, **When** the manager settles the account, **Then** the system records a closing entry and the balance becomes zero with a settled status.

---

### User Story 2 - Track external counterparties and their debts (Priority: P2)

As a manager, I want to create and reuse external counterparties so I can track repeated money-based debt relationships with people or companies outside the worker list.

**Why this priority**: External debt tracking is the second half of the requested MVP and must be reusable because the same person may be used many times.

**Independent Test**: Can be fully tested by creating an external counterparty, opening its debt page, adding a debt entry and a payment entry, and confirming the running balance and ledger are correct.

**Acceptance Scenarios**:

1. **Given** no external counterparty exists, **When** the manager creates one from the dedicated create page, **Then** the system stores the person and returns the manager to the debt flow without requiring inline creation.
2. **Given** an external counterparty exists, **When** the manager opens that person’s page, **Then** the page shows the person’s combined balance and the list of separate debt cases linked to that person.
3. **Given** an external counterparty already has one debt case, **When** the manager creates another debt case for the same person, **Then** both debts remain individually visible and the person total reflects the sum of both.

---

### User Story 3 - Review debt balances in one debts hub (Priority: P3)

As a manager, I want a single debts page that summarizes internal and external balances so I can quickly see which parties owe us money and which parties we owe money.

**Why this priority**: A summary page is useful only after at least one debt workflow exists, so it follows the internal and external management slices.

**Independent Test**: Can be fully tested by creating internal and external balances, visiting the debts page, and confirming each party appears with the correct sign, color, balance label, and link to details.

**Acceptance Scenarios**:

1. **Given** open worker and external debt accounts exist, **When** the manager visits the debts page, **Then** the page lists both internal and external debt records with net balance and status.
2. **Given** a positive balance means money owed to the company, **When** the debts page renders balances, **Then** positive balances appear as green and negative balances appear as red.

---

### Edge Cases

- What happens when a worker or external counterparty has no debt entries yet? The UI should show a zero/empty state, not a broken detail page.
- What happens when a settlement is attempted on an already-settled zero balance? The system should reject the action or no-op safely.
- What happens when a positive and negative series of entries offset each other? The system should calculate and display only the net remaining balance.
- What happens when the manager creates an external counterparty and then cancels the debt action? The counterparty remains saved, but no debt account is created implicitly.
- What happens when an invalid amount or empty name is submitted? The system should return field-level validation errors without partial writes.
- What happens when a person has multiple separate debts? The system should show an aggregate total for the person while preserving each debt case and its own ledger.
- What happens when one debt is closed against another debt for the same person? The system should preserve the closure event and leave only the difference open when balances do not cancel exactly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support a debt account linked either to an existing internal worker or to an external counterparty, but never both at once.
- **FR-002**: System MUST allow managers to create external counterparties with full name, phone number, and note from a dedicated creation flow.
- **FR-003**: System MUST allow managers to create internal worker debt accounts without entering a separate worker name because workers already exist in the system.
- **FR-004**: System MUST store debt movement as append-only money ledger entries with amount, date, note, actor identity, and resulting debt balance.
- **FR-005**: System MUST calculate and display the net balance so that positive values mean the party owes the company and negative values mean the company owes the party.
- **FR-006**: System MUST display positive balances using the “owed to us” meaning and negative balances using the “owed by us” meaning in both text and color, not color alone.
- **FR-007**: System MUST allow managers to record new debt entries, payment entries, and settlement entries for internal and external debt accounts.
- **FR-008**: System MUST allow managers to settle a debt case by recording a compensating entry that closes that debt case to zero.
- **FR-009**: System MUST expose internal worker debt details from the existing worker record experience.
- **FR-010**: System MUST expose external counterparties through their own detail page and reusable listing flow.
- **FR-011**: System MUST provide a debts hub page listing internal and external accounts with status, balance, type, and links to detail pages.
- **FR-012**: System MUST audit debt mutations using the existing actorUserId / actorLabel / transactionId pattern already used elsewhere in the system.
- **FR-013**: System MUST reject invalid debt mutations, including missing linked party, invalid signed amount, invalid dates, and malformed phone numbers for external counterparties.
- **FR-014**: System MUST keep the MVP scope money-only and MUST NOT include inventory, asset, invoice-item, or warehouse-material debt tracking in this feature.
- **FR-015**: System MUST allow more than one debt case to be linked to the same worker or external counterparty.
- **FR-016**: System MUST show both the aggregate balance for a person and the list of separate debt cases attached to that person.
- **FR-017**: System MUST preserve closure history when one debt case is closed against another debt case, including note and date.

### Key Entities *(include if feature involves data)*

- **External Counterparty**: A reusable outside person or company contact identified by full name, phone number, and note.
- **Debt Case**: One specific money obligation relationship that has its own balance, status, and ledger, and belongs to one worker or one external counterparty.
- **Debt Entry**: An append-only signed ledger row representing a debt increase, payment, adjustment, or settlement with note and date.
- **Debt Closure Link**: A record that explains when one debt case was closed against another debt case and how much value was netted between them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A manager can create an internal worker debt and see the resulting balance on the worker debt view in one uninterrupted flow.
- **SC-002**: A manager can create an external counterparty and begin recording debt entries for that counterparty without inline ad hoc party creation.
- **SC-003**: A manager can create multiple separate debt cases for the same person and still see both the combined total and each separate debt case.
- **SC-004**: Positive and negative balances are consistently rendered with the intended business meaning across hub and detail pages.
- **SC-005**: The feature ships with passing automated tests and no critical or high-severity code or security findings in review.

## Assumptions

- Existing employee records remain the source of truth for internal worker identity.
- All debt amounts are stored in Algerian dinars for MVP.
- The current authenticated manager account is the actor for all debt mutations.
- Debt ledger entries are immutable in MVP; corrections are represented by additional compensating entries.
- External counterparties are created and reused from dedicated pages, not inline inside debt entry forms.
