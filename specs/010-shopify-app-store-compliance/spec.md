# Feature Specification: Shopify App Store Compliance Matrix

**Feature Branch**: `010-shopify-app-store-compliance`  
**Created**: 2026-07-02  
**Status**: Draft  
**Input**: User description: "Implement a set of tests and documentation that verifies the repo satisfies the Shopify App Store best practices that apply to this app, and document the rest in OpenSpec and SpecKit."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install, auth and embedded shell compliance (Priority: P1)

As a maintainer, I want a repeatable compliance gate for install/auth/session-token behavior so that the embedded app can be reviewed and used without auth dead-ends.

**Why this priority**: Auth and embedded navigation are the first review blockers and the first place merchants get stuck.

**Independent Test**: Run the compliance suite and verify the app manifest, auth bounce logic, App Bridge shell and onboarding gating are all represented by tests or documented manual evidence.

**Acceptance Scenarios**:

1. **Given** an install/reinstall document request, **When** Shopify requires reauth, **Then** the app rebuilds a clean session-token bounce path.
2. **Given** the embedded shell loads, **When** the app renders, **Then** it uses Shopify embedded providers and does not rely on manual shop entry.

### User Story 2 - Billing, APIs and theme extension compliance (Priority: P1)

As a maintainer, I want the billing, GraphQL Admin, and theme app extension behavior documented and tested so that app-store review can verify we are using Shopify’s supported surfaces.

**Why this priority**: Billing, API usage and theme handling are core App Store review topics and directly affect rejection risk.

**Independent Test**: Run the compliance suite and confirm the billing service uses Shopify Billing API, the app uses the theme app extension manifest, and the storefront config is documented as canonical.

**Acceptance Scenarios**:

1. **Given** the billing service is inspected, **When** the code is read, **Then** billing creation goes through Shopify Billing API.
2. **Given** the app submission form is prepared, **When** pricing is reviewed, **Then** pricing information matches the current in-app plans and charge behavior.
3. **Given** a merchant is on one paid plan, **When** they change plans, **Then** the flow supports both upgrade and downgrade without manual support intervention.
4. **Given** any app charge is created, **When** billing processing is inspected, **Then** it is processed through Shopify Billing API.
5. **Given** the widget extension is inspected, **When** the manifest is read, **Then** it is a theme app extension rather than a direct theme edit.

### User Story 3 - Privacy and submission evidence (Priority: P2)

As a maintainer, I want privacy, support, listing copy and manual evidence tracked in the repo so the final submission package is not assembled from memory.

**Why this priority**: These items are review-ready, but many are human artifacts that should be kept adjacent to the code.

**Independent Test**: Read the compliance docs and verify that the manual evidence checklist exists and the non-applicable Shopify families are explicitly skipped.

**Acceptance Scenarios**:

1. **Given** a reviewer opens the compliance docs, **When** they scan the checklist, **Then** they find support, privacy, listing and screenshot evidence items.
2. **Given** a reviewer checks the skipped families, **When** they compare them with the app capabilities, **Then** payments, purchase-option, POS and payment-facilitator families are explicitly excluded.

## Edge Cases

- A requirement is applicable to Shopify in general but not to this app family.
- A requirement needs browser/runtime or merchant-review evidence that cannot be asserted by unit tests.
- A future feature adds a new Shopify review family and needs a new compliance section.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repo MUST keep a compliance matrix for the Shopify App Store best-practices items that apply to this app.
- **FR-002**: The repo MUST keep OpenSpec and SpecKit aligned on the same compliance umbrella requirement.
- **FR-003**: The repo MUST provide automated tests for the static app surfaces that can be verified locally.
- **FR-004**: The repo MUST document manual evidence for submission artifacts that are not fully automatable.
- **FR-005**: The repo MUST explicitly mark unsupported Shopify review families as skipped with rationale.
- **FR-006**: The repo MUST keep the compliance docs close to the existing Shopify app specs rather than in an unrelated root doc.
- **FR-007**: The compliance suite MUST cover app manifest, embedded auth, billing, theme extension, privacy and factual-copy surfaces.
- **FR-008**: The compliance requirements MUST explicitly enforce Shopify Billing API as the only allowed processing path for app charges.
- **FR-009**: The compliance requirements MUST explicitly enforce that merchants can switch plans (upgrade/downgrade) from the app billing flow.
- **FR-010**: The compliance requirements MUST explicitly enforce that submission-form pricing information remains aligned with current app pricing.

### Key Entities

- **ComplianceRequirement**: A requirement derived from Shopify documentation that maps to test, manual evidence or skip rationale.
- **ManualEvidence**: A submission artifact that must be checked by a human before review.
- **SkippedFamily**: A Shopify review family that does not apply to this app and should be documented as excluded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every applicable Shopify App Store best-practice item has either an automated test or a documented manual evidence entry.
- **SC-002**: The compliance command and docs can be discovered from the app repo entrypoints without reading hidden context.
- **SC-003**: Unsupported families are explicitly named so no reviewer has to infer scope.
- **SC-004**: A contributor can update the compliance baseline without editing unrelated app features.

## Assumptions

- The app is an embedded Shopify Admin app with one theme app extension and no payments or purchase-option products.
- The repo will treat manual evidence as documentation, not as a fake automated browser harness.
- Existing onboarding, privacy and billing flows are reused rather than rebuilt for the compliance matrix.
