# Shopify App Store Manual Evidence

This document captures the evidence items that cannot be proven purely from local code.

## Required before submission

- [ ] App listing screenshots for the merchant-facing UI: onboarding, dashboard, widget configuration, Theme Editor enablement, billing and privacy pages.
- [ ] Short product video or screen recording of install, onboarding, storefront widget setup and dashboard usage.
- [ ] App name, app description, listing copy and screenshots reviewed for factual language only.
- [ ] Public support contact email and public support URL, both tested while logged out.
- [ ] Public privacy policy URL and data-handling summary, both tested while logged out.
- [ ] Pricing in the Partner Dashboard matches every in-app Shopify billing plan, including trial, recurring amount and usage charges where applicable.
- [ ] Reviewer credentials for a clean development store, including an administrator account and the exact installation URL.
- [ ] Reviewer instructions: install, approve scopes, complete onboarding, enable the app embed, send a storefront message, verify product/order answers, open privacy controls and exercise billing in test mode.
- [ ] Emergency reviewer contact: monitored email plus name, timezone and response commitment during the review window.
- Confirmation that the theme app extension is enabled in a development store.
- Confirmation that the merchant can reach the app through the standard Shopify install flow.

## Access-scope justification

The production manifest requests only the minimum scopes below. The reviewer instructions must point to the corresponding feature so that each permission can be verified.

| Scope | Merchant-facing purpose | Code surface / review demonstration |
| --- | --- | --- |
| `read_products` | Builds the AI knowledge base and gives storefront product recommendations. | Catalog sync worker and app-proxy product fallback; run catalog sync and ask the widget for a product. |
| `read_orders` | Lets the configured AI answer a customer's verified order-status question and projects paid/fulfilled order events. | Order lookup service and order sync worker; use a test order after identity verification. |
| `read_content` | Ingests published store content for grounded answers. | Content sync worker; show a synced article or blog entry. |
| `read_online_store_pages` | Ingests published Online Store pages for grounded answers. | Page sync worker; show a synced page answer. |
| `read_themes` | Finds the active theme only to open Shopify's Theme Editor deep link for enabling the theme app extension. | Widget Publish page; click “Open Theme Editor”. |

`write_products`, `read_customers` and `read_locales` were removed on 2026-07-19 because the current application has no direct Admin API mutation/query that needs them. Shopify's access-scope guidance requires requesting only the minimum data needed. If a future feature needs one, it must add its code path, a test, this matrix entry and a new merchant approval before the scope returns.

## GDPR processor and deletion evidence

The Shopify compliance webhooks are registered in the production manifest. Before submission, retain evidence that a request propagates from Shopify to the IA backend and results in deletion/export of every in-scope tenant record. Do not place customer identifiers, payloads, exports or API keys in this repository.

- [ ] Backend request/audit reference for `customers/data_request`, `customers/redact` and `shop/redact`, including a successful retry scenario.
- [ ] Data inventory showing every IA-backend table, vector store/embedding index, object storage location and analytics/log sink that can contain Shopify personal data, with its deletion owner and retention period.
- [ ] Written LLM/provider confirmation of whether prompts, completions and abuse-monitoring logs are retained, the opt-out/configuration used, and the deletion/escalation path.
- [ ] Backup and disaster-recovery policy proving the retention/expiry window and how redacted data is made inaccessible until backup expiry.
- [ ] Current subprocessors list, DPA/terms links, data regions and deletion/retention commitments.
- [ ] Public privacy policy matches the implemented collection, purpose, processors, retention, export and deletion behavior.

## Review notes

- Payments app, purchase option, payment facilitator and POS review families do not apply to this repo.
- If a future feature introduces those surfaces, the compliance matrix must grow a new section instead of reusing the current one.
