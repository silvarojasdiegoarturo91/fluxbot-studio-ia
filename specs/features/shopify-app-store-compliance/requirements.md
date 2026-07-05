# Shopify App Store Compliance Requirements

## OpenSpec trace

- Root requirement: `REQ-IA-SHOPIFY-003`
- Shopify source: [Best practices for apps](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices)
- Shopify source: [App Store AI self-review requirements](https://shopify.dev/docs/apps/launch/app-store-review/app-store-ai-self-review-requirements)

## Goal

Build a repeatable compliance gate for the Shopify app that covers the features this repo actually ships, documents the unsupported families explicitly, and maps the live codebase to tests and manual evidence.

## User stories

### US-CS-001 - Install, auth and embedded shell are review-safe (Priority: P1)

As the Fluxbot team, I want the embedded app to use Shopify-owned install and auth flows, session tokens, and the correct embedded shell behavior so the app can survive App Store review and normal merchant navigation.

### US-CS-002 - Storefront, billing and Shopify API usage are review-safe (Priority: P1)

As the Fluxbot team, I want the billing flow, GraphQL Admin usage, and theme app extension to be documented and tested so the app does not rely on off-platform billing or direct theme edits.

### US-CS-003 - Privacy, support and submission evidence are captured (Priority: P2)

As the Fluxbot team, I want privacy, support, screenshots, and other submission artifacts to be captured as first-class evidence so the final App Store submission does not depend on tribal knowledge.

### US-CS-004 - Unsupported Shopify families are explicitly excluded (Priority: P2)

As the Fluxbot team, I want the compliance matrix to mark payments apps, purchase option apps, payment facilitator apps, POS integrations and other non-applicable families as out of scope so the repository does not accidentally drift into the wrong review surface.

## Functional requirements

### Install and embedded app

- **FR-CS-001**: The app MUST be installable from a Shopify-owned surface and MUST not require manual entry of a `myshopify.com` URL during install.
- **FR-CS-002**: The embedded app MUST authenticate through Shopify OAuth/session token flows before the merchant can interact with the UI.
- **FR-CS-003**: The app MUST preserve embedded context (`shop`, `host`, `embedded`) across auth bounces and reloads.
- **FR-CS-004**: The app MUST redirect back to the app UI after install/reinstall instead of leaving the merchant on a dead-end response page.
- **FR-CS-005**: The app MUST use Shopify session tokens and must not rely on third-party cookies or local storage for embedded auth.
- **FR-CS-032**: Authorization code grant flow MUST exchange the code successfully and persist a valid access token for the shop session before protected app routes are considered authenticated.
- **FR-CS-033**: Redirect URLs used in install/reinstall OAuth MUST land merchants in usable UI (`/app` or `/app/onboarding`) and MUST support reinstalling stores that had previous installations.

### Shopify APIs and billing

- **FR-CS-006**: The app MUST use Shopify APIs for merchant-facing functionality and MUST not operate as a standalone app that bypasses Shopify ownership.
- **FR-CS-007**: The app MUST use GraphQL Admin API for general Shopify admin operations that are part of the app's product surface.
- **FR-CS-008**: If the app charges merchants, billing MUST flow through Shopify Billing API or Shopify App Pricing.
- **FR-CS-009**: The billing experience MUST support plan creation, decline handling, reinstall recovery, and plan changes without requiring support intervention.
- **FR-CS-010**: All app charges MUST be processed through Shopify Billing API for the app's paid functionality; off-platform billing for app charges is not allowed.
- **FR-CS-011**: Merchants MUST be able to switch pricing plans (upgrade and downgrade) from the app billing flow.
- **FR-CS-012**: Pricing information in the App Store submission form MUST stay aligned with the actual in-app billing plans and charge behavior.
- **FR-CS-024**: After Shopify confirms a billing charge/subscription, the app MUST return merchants to an embedded in-app post-purchase section (thank-you) and then to dashboard without showing a manual "Shop domain" login form.
- **FR-CS-025**: Billing return URLs MUST preserve or recover embedded context (`shop`, `host`, `embedded`) in a bounded format compatible with Shopify limits.
- **FR-CS-026**: If a merchant already has the same active plan, the app MUST block duplicate purchase and require selecting a different plan.
- **FR-CS-027**: Upgrade/downgrade plan changes MUST use Shopify-supported replacement behavior so proration/credit handling is delegated to Shopify Billing and duplicate active plans are avoided.
- **FR-CS-028**: The billing change UI MUST show the active plan as status information and MUST NOT render the active plan as a selectable purchase/change option.
- **FR-CS-029**: The billing plan selector UI MUST use pricing cards (not only a dropdown), including plan name, price, direction badge (upgrade/downgrade), key limits/features, and a primary action button.
- **FR-CS-030**: Available plan cards MUST be labeled as `Upgrade` or `Downgrade` based on plan hierarchy/price relative to the active plan.
- **FR-CS-031**: If no alternate plans are available, the UI MUST show an explicit "best available plan" message instead of rendering a purchase action.

### Storefront and theme app extension

- **FR-CS-013**: If the app modifies the storefront theme, it MUST do so through a theme app extension instead of direct theme code edits.
- **FR-CS-014**: The storefront extension MUST expose setup instructions or a deep link to help merchants enable and preview it.
- **FR-CS-015**: Theme-facing configuration MUST be stored canonically in Admin and must not depend on manual file edits in the merchant theme.
- **FR-CS-016**: Storefront configuration must stay consistent with Admin settings for launcher color, position, and copy.

### Privacy, retention and support

- **FR-CS-017**: Customer data collected by Shopify-hosted surfaces MUST be accessible to merchants from Admin or from an in-app dashboard.
- **FR-CS-018**: Data retention, export and deletion flows MUST be documented and testable.
- **FR-CS-019**: The repo MUST contain a submission-ready support/contact and privacy evidence checklist.
- **FR-CS-020**: App listing copy and documentation MUST be factual and must not claim fabricated reviews, sales, traffic or social proof.

### Manual evidence and review readiness

- **FR-CS-021**: The repo MUST enumerate evidence items that require human review, including screenshots, video, support contact, privacy policy, billing plan copy and app listing assets.
- **FR-CS-022**: The repo MUST mark non-applicable Shopify families as skipped with a reason.
- **FR-CS-023**: The repo MUST keep the compliance matrix synchronized with OpenSpec and SpecKit.

## Key entities

- **ComplianceMatrix**: The canonical set of requirements, grouped by Shopify review surface and linked to tests or manual evidence.
- **EvidenceItem**: A human-verifiable artifact required before submission, such as screenshots, support contact or listing copy.
- **SkippedGroup**: A review family that is explicitly not relevant to this app and therefore excluded from automated verification.

## Success criteria

- **SC-CS-001**: Every applicable Shopify App Store best-practice item in this repo is mapped to either an automated test or a documented manual evidence item.
- **SC-CS-002**: A contributor can run one compliance test command and see the current static compliance baseline without reading tribal knowledge.
- **SC-CS-003**: The repo clearly documents which Shopify review families are out of scope and why.
- **SC-CS-004**: OpenSpec and SpecKit both reference the same compliance umbrella requirement.

## Assumptions

- This repo is a Shopify Admin app with one theme app extension and no payment gateway or purchase-option product.
- The compliance matrix should favor precise scope boundaries over trying to model every Shopify review family as if it applied here.
- Manual submission artifacts are tracked in documentation, not hard-coded into runtime tests.
