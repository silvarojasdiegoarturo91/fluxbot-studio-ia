# Assistant config catalog sync error requirements

## Objective

Prevent confusing merchant-facing errors when the owner clicks "Sincronizar catálogo" from `/app/assistant-config`.

## Traceability

- Root: `REQ-ROOT-009`
- Shopify Admin: `REQ-IA-AI-002`
- Related: `REQ-IA-AI-001`, `REQ-IA-SHOPIFY-001`

## Functional requirements

- **FR-ACCS-FE-001:** The IA backend client MUST parse nested JSON error payloads from `error.message`, `error.code`, `message`, `details` and fallback text.
- **FR-ACCS-FE-002:** Merchant-facing errors MUST never include `[object Object]`.
- **FR-ACCS-FE-003:** The catalog sync UI MUST use backend `durationMs` for elapsed time.
- **FR-ACCS-FE-004:** Partial sync errors returned in `errors[]` MUST be visible as localized warning/error feedback.
- **FR-ACCS-FE-005:** Internal diagnostic hints may be logged but MUST not be the primary merchant-facing message.
- **FR-ACCS-FE-006:** Shop registration to `fluxbot-studio-back-ia` MUST propagate the Shopify access token when available, and token-bearing syncs MUST bypass the domain throttle so a newly available token reaches the backend before catalog import.
- **FR-ACCS-FE-007:** The IA backend client MUST unwrap successful catalog sync envelopes and send the `X-Shop-Domain` header with the catalog sync request.
- **FR-ACCS-FE-008:** When the App Proxy fallback catalog (`ProductProjection`) returns products and backend IA message says catalog is unavailable, the final assistant message MUST be rewritten to a positive catalog-found message in the shopper locale.
- **FR-ACCS-FE-009:** The persisted assistant message and API response `message` MUST be exactly the same resolved message after fallback arbitration.
- **FR-ACCS-FE-010:** Local development guidance for agents MUST document that Shopify storefront traffic enters through `/apps/fluxbot/chat`, and backend IA local execution requires `IA_EXECUTION_MODE=remote` with `IA_BACKEND_URL=http://127.0.0.1:3001`.

## Acceptance criteria

1. Given the backend responds `{ "error": { "code": "SYNC_ERROR", "message": "Error al sincronizar el catálogo" } }`, when the action catches the failure, then the UI shows the message text and no object serialization.
2. Given sync succeeds with `{ durationMs: 1234 }`, when the UI renders the result, then it displays `1.2s`.
3. Given sync returns `errors[]`, when the action returns, then the merchant sees that sync completed with warnings instead of silent success.
4. Given a valid Shopify session includes `accessToken`, when the shop reference is synchronized to the IA backend, then the payload includes the token and uses `force: true` to bypass throttle.
5. Given `/api/v1/catalog/sync` returns a success envelope, when `iaClient.catalog.sync()` resolves, then the caller receives the inner catalog result and the backend request includes `X-Shop-Domain`.
6. Given backend IA returns “no tengo el catálogo” and proxy fallback finds products, when `/apps/fluxbot/chat` responds, then `message` uses a positive catalog-found sentence and `metadata.catalogSource` is `shopify_proxy_catalog_fallback`.
7. Given proxy fallback products were used, when assistant message is persisted, then DB `conversationMessage.content` matches the response `message` and does not keep the negative catalog sentence.
