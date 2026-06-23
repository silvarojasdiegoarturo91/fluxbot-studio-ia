# Onboarding Requirements (Frontend)

## OpenSpec trace

- Root requirement: `REQ-ROOT-001`
- Shopify requirement: `REQ-OPEN-009`
- Covered behavior: final onboarding completion must persist completion state and redirect automatically to `/app` (Panel).

## Functional requirements

- **FR-ONB-001:** A merchant with incomplete onboarding MUST be redirected to `/app/onboarding` when trying to access protected app routes.
- **FR-ONB-002:** A merchant with completed onboarding MUST see the normal dashboard and navigation.
- **FR-ONB-003:** If the app is uninstalled and later reinstalled for the same shop, onboarding MUST be required again before normal operation.
- **FR-ONB-004:** Completing onboarding MUST persist onboarding completion state and redirect automatically to `/app` (Panel) after the final onboarding action.
- **FR-ONB-005:** After install/reinstall OAuth authorization, onboarding/dashboard load MUST complete without leaving the merchant stuck on a "Handling response" intermediate screen.

## Acceptance criteria

1. Given a shop with onboarding incomplete, when opening `/app`, then onboarding is shown.
2. Given a shop with onboarding complete, when opening `/app`, then dashboard is shown.
3. Given a previously completed shop, when `app/uninstalled` happens and app is reinstalled, then onboarding is shown again.
4. Given auth completes after install/reinstall, when the app route resolves, then the merchant sees usable UI without manual refresh.
5. Given a merchant clicks the final onboarding button, when the completion action succeeds, then the merchant is redirected automatically to `/app` without refreshing or clicking another control.
