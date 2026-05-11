# Admin ↔ Storefront Widget Config Sync Requirements

## Objective

Guarantee strict parity between merchant settings configured in Admin and the widget rendered in Storefront.

## User stories

### US-ASC-001 (P1)
As a merchant, when I set the chatbot primary color in Admin, I want the Storefront widget to use exactly that color so my brand is consistent.

### US-ASC-002 (P1)
As a merchant, when I set the launcher position (left/right) in Admin, I want the Storefront widget to appear in the same position so behavior matches my configuration.

### US-ASC-003 (P1)
As a merchant, when I edit visible widget copy in Admin (greeting, launcher label, bot name), I want the Storefront widget to show the same text so customers see the intended messaging.

### US-ASC-004 (P2)
As a merchant, when I update multiple settings and publish, I want all related visual changes applied together (no mixed old/new state) so the widget is coherent.

### US-ASC-005 (P2)
As a merchant, after reinstall and re-onboarding, I want the widget to remain blocked or use safe defaults until onboarding is complete again, then reflect the latest saved config.

## Functional requirements

- **FR-ASC-001:** The system MUST store widget-facing Admin settings in a canonical config source for each shop.
- **FR-ASC-002:** The storefront widget MUST read and apply the latest published canonical config for that shop.
- **FR-ASC-003:** Color values configured in Admin MUST be rendered identically in storefront (same final computed color token/hex).
- **FR-ASC-004:** Launcher position configured in Admin (`left` or `right`) MUST map 1:1 to storefront layout placement.
- **FR-ASC-005:** Text settings configured in Admin (launcher label, greeting, bot name) MUST match storefront output.
- **FR-ASC-006:** Config updates MUST be atomic from storefront perspective (all changed fields become visible together).
- **FR-ASC-007:** If config is invalid/incomplete, widget rendering MUST fall back to explicit safe defaults and expose a diagnostic signal for observability.
- **FR-ASC-008:** After uninstall/reinstall, onboarding gating rules MUST be enforced; storefront must not expose incomplete/unsafe config while onboarding is incomplete.

## Non-functional requirements

- **NFR-ASC-001:** P95 propagation time from Admin save to storefront effective config should be <= 5s in normal operation.
- **NFR-ASC-002:** Visual parity checks must be deterministic across supported themes/viewports/browsers in CI.
- **NFR-ASC-003:** Config parity failures must be traceable by `shopId`, config version/hash, and timestamp.

## Acceptance criteria

1. **Given** Admin color is set to `#2563EB`, **When** storefront widget loads, **Then** computed launcher/chat primary color is `#2563EB` (or equivalent normalized RGB).
2. **Given** Admin sets position to `left`, **When** storefront widget loads, **Then** launcher is rendered on the left and not on the right.
3. **Given** Admin updates greeting and launcher label, **When** widget reloads after publish, **Then** both strings match Admin exactly.
4. **Given** Admin updates color + position in one save, **When** storefront receives the update, **Then** both changes appear together.
5. **Given** app is uninstalled and reinstalled, **When** onboarding is still incomplete, **Then** storefront must follow onboarding gating/safe state and not expose stale active config.
6. **Given** onboarding is completed again after reinstall, **When** storefront loads, **Then** the latest valid config is applied with full parity.
