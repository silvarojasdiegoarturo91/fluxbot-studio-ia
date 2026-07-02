# Shopify App Store Compliance Test Cases

## Core app installation and auth

1. Given a document request after install or reinstall, when Shopify returns a reauth response, then the app rewrites the request through the session-token bounce path without nested `shopify-reload`.
2. Given the embedded app shell loads, when the route renders, then the app uses Shopify embedded providers and the navigation menu only appears after onboarding is complete.
3. Given the app is installed or reinstalled, when the merchant reaches the app UI, then onboarding-gated routes remain protected and the merchant is not asked to enter a shop domain manually.

## Billing and Shopify API usage

4. Given the billing service is loaded, when the codebase is inspected, then merchant charges route through Shopify Billing API / App Pricing and the plan mutation uses `appSubscriptionCreate`.
5. Given the dashboard loader reads shop connection data, when the code is inspected, then the app uses GraphQL Admin API rather than REST for the primary dashboard flow.
6. Given the app uses Shopify APIs, when the manifests are inspected, then the required scopes are explicit and remain aligned with the declared functionality.

## Storefront and theme extension

7. Given the storefront widget extension is inspected, when the extension manifest is read, then it declares a theme app extension and does not ask merchants to edit theme files directly.
8. Given the widget publish page is inspected, when the code builds the theme editor URL, then merchants receive a direct deep link to the published theme editor context.
9. Given admin widget settings are changed, when the config is saved, then the storefront-facing config remains canonical and aligned with the Admin values.

## Privacy, support and evidence

10. Given the privacy route is inspected, when the loaders and actions are reviewed, then data export/delete/retention flows are documented and testable.
11. Given the repository documentation is inspected, when the compliance docs are read, then support/contact and factual listing evidence are explicitly tracked.
12. Given the app submission readiness checklist is reviewed, when unsupported Shopify families are listed, then payments, purchase-option, payment-facilitator, POS and other non-applicable families are marked as skipped with rationale.

## Manual review items

13. Given Shopify listing content is prepared, then screenshots, video, app description, pricing copy and support contact are required as manual evidence.
14. Given the best-practices guide asks for a specific browser/runtime condition, then that item is recorded as evidence or manual verification instead of a brittle code assertion.

## Exit criteria

- The compliance suite can be run from the app repo and reports the static baseline.
- Every applicable item has a test reference or a manual evidence reference.
- Every skipped family has a written reason.
