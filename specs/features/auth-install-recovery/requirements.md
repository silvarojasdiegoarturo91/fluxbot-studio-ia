# Auth Install Recovery Requirements (Frontend)

## Problem statement

Sometimes, after Shopify install authorization, the merchant reaches an intermediate screen that only says **"Handling response"** and the app does not continue until a manual browser refresh.

## User stories

- **US-AIR-001:** Como merchant que instala Fluxbot por primera vez, quiero que la app complete auth y cargue onboarding/dashboard automáticamente para empezar de inmediato sin refrescar.
- **US-AIR-002:** Como merchant que desinstaló y reinstaló Fluxbot, quiero que la app redirija al estado correcto de onboarding obligatorio para que el flujo de ciclo de vida sea confiable sin quedarse en auth handling.
- **US-AIR-003:** Como merchant con sesión embebida expirada, quiero que la recuperación por auth bounce me devuelva a la ruta solicitada para continuar trabajando sin fricción.

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
- **FR-AIR-005:** If Shopify reaches `/` with only `shop` during install/reinstall, the app MUST redirect immediately to `/auth/login?shop=...` to start OAuth grant and MUST NOT attempt a partial app bootstrap first.
- **FR-AIR-006:** The installation flow MUST obtain and persist a valid Shopify access token for the shop session before protected app routes are considered authenticated.
- **FR-AIR-007:** Install/reinstall document requests MUST never terminate in fatal 5xx or a dead-end "Handling response" page; they MUST recover through `/auth/session-token` bounce or explicit OAuth login.
- **FR-AIR-008:** Reinstallation MUST reset onboarding completion state and force onboarding routes until completion is confirmed again.
- **FR-AIR-009:** Redirect URL behavior MUST preserve embedded context params (`shop`, `host`, `embedded`) across login, callback, and session-token bounce when available.
- **FR-AIR-010:** The repo MUST keep automated coverage for install entry redirects, auth bounce reconstruction, reinstall onboarding reset, and token-aware shop recovery.

## Acceptance criteria

1. Given first install authorization, when Shopify redirects to the app, then Fluxbot renders a usable route without user refresh.
2. Given reinstalled shop after uninstall, when merchant enters app, then onboarding is required and app is not stuck on auth handling.
3. Given expired session on document request, when bounce redirect is built, then resulting `shopify-reload` has no nested `shopify-reload`.
4. Given auth catch-all responses, then boundary handling prevents raw response pages ("200" or "Handling response" stuck view) from becoming terminal UI.
5. Given Shopify calls `/?shop=<domain>` from install/reinstall, when root loader runs, then it redirects directly to `/auth/login?shop=<domain>`.
6. Given install auth succeeds, when the app reaches authenticated routes, then a persisted shop access token exists in session-backed flow.
7. Given app was previously uninstalled, when the shop reinstalls, then onboarding is reset and `/app/onboarding` is enforced before normal routes.
8. Given embedded context (`shop`, `host`, `embedded`) is present on entry, when redirects happen through auth/session-token, then context is preserved in resulting route.
