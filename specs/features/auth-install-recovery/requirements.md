# Auth Install Recovery Requirements (Frontend)

## Problem statement

Sometimes, after Shopify install authorization, the merchant reaches an intermediate screen that only says **"Handling response"** and the app does not continue until a manual browser refresh.

## User stories

- **US-AIR-001:** As a merchant installing Fluxbot for the first time, I want the app to finish auth and load onboarding/dashboard automatically, so I can start immediately without refreshing.
- **US-AIR-002:** As a merchant who uninstalled and reinstalled Fluxbot, I want the app to redirect to the correct onboarding-required state without getting stuck on auth handling, so the lifecycle flow is reliable.
- **US-AIR-003:** As a merchant with an expired embedded session, I want auth bounce recovery to return me to the requested app route, so I can continue working seamlessly.

## Use cases

### UC-AIR-001 — Fresh install from zero

1. Merchant installs Fluxbot in Shopify.
2. Merchant grants required scopes.
3. Shopify redirects to embedded app.
4. Fluxbot resolves auth bounce and loads `/app` or `/app/onboarding`.

**Expected:** No permanent "Handling response" screen and no manual reload required.

### UC-AIR-002 — Uninstall + reinstall

1. Merchant uninstalls Fluxbot.
2. Backend receives `app/uninstalled` and resets onboarding metadata.
3. Merchant reinstalls Fluxbot and grants scopes again.
4. Fluxbot redirects to onboarding-required flow.

**Expected:** Merchant lands in onboarding path directly; no auth stuck screen.

### UC-AIR-003 — Session recovery bounce

1. Merchant opens embedded app with invalid/expired session.
2. Shopify requires `/auth/session-token` bounce.
3. Fluxbot builds clean `shopify-reload` value (no recursive nested params).
4. App Bridge reloads target route.

**Expected:** Recovery finishes without loops, blank screen, or manual refresh.

## Functional requirements

- **FR-AIR-001:** Auth bounce URL generation MUST remove stale `id_token` and stale `shopify-reload` params.
- **FR-AIR-002:** Auth catch-all route MUST expose Shopify boundary headers and error boundary handling.
- **FR-AIR-003:** Post-install redirects MUST resolve to usable routes (`/app` or `/app/onboarding`) in one flow.
- **FR-AIR-004:** Uninstall + reinstall lifecycle MUST preserve onboarding-required behavior and avoid auth dead-ends.

## Acceptance criteria

1. Given first install authorization, when Shopify redirects to the app, then Fluxbot renders a usable route without user refresh.
2. Given reinstalled shop after uninstall, when merchant enters app, then onboarding is required and app is not stuck on auth handling.
3. Given expired session on document request, when bounce redirect is built, then resulting `shopify-reload` has no nested `shopify-reload`.
4. Given auth catch-all responses, then boundary handling prevents raw response pages ("200" or "Handling response" stuck view) from becoming terminal UI.
