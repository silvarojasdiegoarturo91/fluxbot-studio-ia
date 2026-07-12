# Feature Specification: Storefront Widget — Theme App Extension

**Feature Branch**: `001-storefront-widget`  
**OpenSpec ID**: REQ-OPEN-001  
**Created**: 2026-04-09  
**Status**: Draft  
**Priority**: High  
**Owner**: Frontend (`fluxbot-studio-ia-shopify`)

## Context

The admin app currently has a "Publish Widget" UI page (`app.widget-publish.tsx`) that shows configuration options, but there is no actual Theme App Extension or App Embed Block registered with Shopify. Merchants cannot install the chat widget on their storefront. This spec covers building the real extension.

---

## User Scenarios & Testing

### User Story 1 — Merchant installs the widget on their storefront (Priority: P1)

A merchant opens their Shopify admin → Sales Channels → Online Store → Customize. They see the FluxBot chat launcher in the App Embeds section, toggle it on, and save. The chat widget appears on their storefront without editing theme code.

**Why this priority**: This is the core delivery mechanism. Without it, the product has no storefront presence.

**Independent Test**: Can be tested by installing the extension on a development theme, enabling the embed block, and verifying the chat launcher renders on the storefront.

**Acceptance Scenarios**:

1. **Given** a Shopify development store with a 2.0 theme, **When** the merchant enables the FluxBot App Embed Block in the theme editor, **Then** the chat launcher icon appears in the bottom-right corner of the storefront.
2. **Given** the embed is enabled, **When** a visitor clicks the launcher, **Then** the chat window opens and connects to the IA backend endpoint.
3. **Given** the embed is enabled, **When** the page loads, **Then** Lighthouse performance score drops less than 5 points compared to baseline (lazy loading verified).

---

### User Story 2 — Merchant configures widget appearance (Priority: P2)

From the FluxBot admin panel, the merchant sets the primary color, greeting message, and language. When they preview the storefront, the widget reflects those settings without re-publishing.

**Why this priority**: Branding control is required for merchant adoption; configures already exist in DB (`ChatbotConfig`).

**Independent Test**: Change `ChatbotConfig.primaryColor` via admin UI → hard-reload storefront → widget color matches.

**Acceptance Scenarios**:

1. **Given** a merchant sets `primaryColor = #FF6B35` in ChatbotConfig, **When** the storefront widget loads, **Then** the launcher button uses that color.
2. **Given** a merchant sets `greetingMessage = "¡Hola! ¿Cómo puedo ayudarte?"`, **When** a visitor opens the chat, **Then** that greeting is displayed as the first message.

---

### User Story 3 — Widget is accessible and mobile-friendly (Priority: P3)

The widget works correctly on mobile viewports and passes basic accessibility requirements (ARIA labels, keyboard navigation, focus trap in chat window).

**Why this priority**: Required for quality and App Store review.

**Independent Test**: Resize viewport to 375px → chat opens → keyboard tab works through controls → ARIA roles verified via axe.

**Acceptance Scenarios**:

1. **Given** a mobile viewport (375×667), **When** the chat window is open, **Then** it fills the viewport without horizontal scroll and close button is accessible.
2. **Given** keyboard navigation, **When** user tabs into the widget, **Then** all interactive elements are reachable and focus order is logical.

---

### Edge Cases

- What happens when `IA_BACKEND_URL` is unreachable? Widget must show a graceful fallback message, not a broken UI.
- What happens when the merchant disables the embed mid-session? Next visitor page load should not render the widget.
- What happens when the theme doesn't support App Embed Blocks (non-2.0 theme)? Extension must degrade gracefully or display guidance.
- What happens when `ChatbotConfig` has not been created for the shop yet? Widget must load with safe defaults.

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST implement a Shopify Theme App Extension with an App Embed Block targeting Online Store 2.0 themes.
- **FR-002**: Extension MUST lazy-load the chat widget JavaScript to minimise render-blocking.
- **FR-003**: Widget MUST connect to the IA backend via the Shopify App Proxy (or direct `IA_BACKEND_URL`) to send/receive chat messages.
- **FR-004**: Widget MUST read configuration (color, greeting, language) from an endpoint served by the Remix app (scoped to shop).
- **FR-005**: All widget interactions MUST be tracked as `BehaviorEvent` records in the frontend DB.
- **FR-006**: Extension MUST register with the Shopify CLI under `extensions/storefront-widget/`.
- **FR-007**: Widget launcher MUST be positioned with a configurable location (bottom-right default).
- **FR-008**: Chat window MUST support keyboard navigation and ARIA roles (role="dialog", aria-live for messages).
- **FR-009**: The storefront chat proxy MUST persist conversations and both user/assistant messages in the app database, and follow-up requests MUST reuse an existing `conversationId` when provided.

### Key Entities

- **ChatbotConfig**: Existing Prisma model — drives widget colors, greeting, language, enabled flag.
- **BehaviorEvent**: Captures widget_open, message_sent, widget_close, recommendation_click.
- **ConversationMessage**: Each chat turn persisted for analytics and handoff.

## Success Criteria

- **SC-001**: Theme App Extension passes `shopify app deploy` without errors.
- **SC-002**: App Embed Block appears under "App Embeds" in Shopify theme editor for a dev store.
- **SC-003**: Lighthouse performance impact ≤ 5 points (measured on Dawn theme, cold load).
- **SC-004**: Widget renders and sends first message in < 2 seconds on a 4G simulated connection.
- **SC-005**: Zero console errors on storefront load when widget is enabled.
- **SC-006**: WCAG 2.1 AA — no critical accessibility violations (axe audit).

## Assumptions

- The Shopify development store uses a 2.0-compatible theme (Dawn or equivalent).
- App Proxy is configured at `/apps/fluxbot` to forward widget API calls.
- `ChatbotConfig` exists for the shop before the widget loads; if not, safe defaults apply.
- The widget JS bundle is < 50 KB gzipped.
- Mobile-first CSS, no external CSS frameworks in the widget bundle.
- The extension is built with vanilla JS + Liquid (no React in the extension itself) to minimise bundle size.

## Implementation Notes

- Extension directory: `apps/storefront-widget/extensions/storefront-widget/`
- Shopify CLI config: `shopify.app.toml` must register the extension
- Widget config endpoint: `GET /api/widget-config?shop=<domain>` (new Remix route, no auth required, cached)
- Chat API proxy: `POST /apps/fluxbot/chat` → Remix action → `iaClient.chat.send()`
- Behavior events: fire-and-forget `POST /api/behavior-events` from widget JS
