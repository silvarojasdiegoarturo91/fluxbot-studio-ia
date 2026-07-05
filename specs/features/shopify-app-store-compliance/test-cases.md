# Shopify App Store Compliance Test Cases

## Core app installation and auth

1. Given a document request after install or reinstall, when Shopify returns a reauth response, then the app rewrites the request through the session-token bounce path without nested `shopify-reload`.
2. Given the embedded app shell loads, when the route renders, then the app uses Shopify embedded providers and the navigation menu only appears after onboarding is complete.
3. Given the app is installed or reinstalled, when the merchant reaches the app UI, then onboarding-gated routes remain protected and the merchant is not asked to enter a shop domain manually.
4. Given Shopify calls `/?shop=<domain>` during install/reinstall, when root loader runs, then the app redirects immediately to `/auth/login?shop=<domain>`.
5. Given authorization code grant completes, when auth/session is established, then a valid shop access token is persisted for protected route usage.

## Billing and Shopify API usage

4. Given the billing service is loaded, when the codebase is inspected, then merchant charges route through Shopify Billing API / App Pricing and the plan mutation uses `appSubscriptionCreate`.
5. Given the dashboard loader reads shop connection data, when the code is inspected, then the app uses GraphQL Admin API rather than REST for the primary dashboard flow.
6. Given the app uses Shopify APIs, when the manifests are inspected, then the required scopes are explicit and remain aligned with the declared functionality.
7. Given a merchant confirms billing in Shopify, when Shopify returns to the app, then Fluxbot lands on an embedded thank-you route and continues to dashboard without manual shop-domain login.
8. Given billing return URL generation runs, when host/shop context is present or partially missing, then the URL keeps bounded embedded params and never exceeds Shopify return URL limits.
9. Given a merchant already has the same active plan, when they attempt to buy it again, then the app blocks duplicate purchase and prompts upgrade/downgrade instead.
10. Given a merchant changes plan (upgrade/downgrade), when the billing mutation is sent, then Shopify replacement behavior supports proration and only one active plan remains.
11. Given a merchant has no active plan, when billing loads, then all plans are rendered as initial purchase options.
12. Given a merchant has an unknown/free active baseline, when billing loads, then only upgrade options are presented.
13. Given a merchant has Starter, when billing options render, then Starter is hidden and only higher plans are shown as upgrades.
14. Given a merchant has Growth, when billing options render, then lower plans appear as downgrades and higher plans as upgrades.
15. Given a merchant has the top plan, when billing options render, then only downgrade options are shown.
16. Given there are no alternative plans, when billing options render, then the UI shows "best available plan" message and no purchase button.
17. Given the pricing surface is rendered, when inspected, then it uses cards with icon marker, direction badge, price, feature list, and primary action button.

## Storefront and theme extension

18. Given the storefront widget extension is inspected, when the extension manifest is read, then it declares a theme app extension and does not ask merchants to edit theme files directly.
19. Given the widget publish page is inspected, when the code builds the theme editor URL, then merchants receive a direct deep link to the published theme editor context.
20. Given admin widget settings are changed, when the config is saved, then the storefront-facing config remains canonical and aligned with the Admin values.

## Privacy, support and evidence

21. Given the privacy route is inspected, when the loaders and actions are reviewed, then data export/delete/retention flows are documented and testable.
22. Given the repository documentation is inspected, when the compliance docs are read, then support/contact and factual listing evidence are explicitly tracked.
23. Given the app submission readiness checklist is reviewed, when unsupported Shopify families are listed, then payments, purchase-option, payment-facilitator, POS and other non-applicable families are marked as skipped with rationale.

## Manual review items

24. Given Shopify listing content is prepared, then screenshots, video, app description, pricing copy and support contact are required as manual evidence.
25. Given the best-practices guide asks for a specific browser/runtime condition, then that item is recorded as evidence or manual verification instead of a brittle code assertion.

## Exit criteria

- The compliance suite can be run from the app repo and reports the static baseline.
- Every applicable item has a test reference or a manual evidence reference.
- Every skipped family has a written reason.
