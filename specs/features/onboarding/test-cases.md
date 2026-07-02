# Onboarding Transition Test Cases

## Step transition continuity

1. Given onboarding is on step 1, when the merchant clicks to step 2, then the shell stays visible and the step body swaps without a blank screen.
2. Given onboarding is on step 2, when the merchant navigates back to step 1, then the shared shell stays mounted and the merchant does not see a full refresh.
3. Given step 3 is loading, when the UI is checked mid-transition, then a skeleton or loading placeholder is visible.
4. Given the loading placeholder is visible, when the next step finishes loading, then the placeholder disappears without collapsing the layout.

## Visual and motion behavior

5. Given the loading state is rendered, then it includes a robot/icon treatment or equivalent branded placeholder.
6. Given the merchant prefers reduced motion, when a step loads, then the loading state remains understandable without relying on animation.
7. Given the transition is slow, when the step body remains pending, then the existing shell and progress context remain visible.

## Accessibility and failure recovery

8. Given assistive technology is active, when a transition starts, then a loading status is announced.
9. Given the next step fails to load, when the error is returned, then the current shell stays mounted and an error recovery state is shown.
10. Given the error recovery state is shown, when the merchant retries, then the next step can load without a full page reload.

## Bug confirmado: redireccion rota (CRITICO)

11. [BUG] Given the merchant is on the final onboarding step, when they click "Activar Fluxbot en mi tienda", then the merchant MUST NOT remain on /app/onboarding — they MUST be redirected to /app.
12. [BUG] Given the merchant clicks "Activar...", when the page does not redirect, then this is a BLOCKING BUG that must be fixed before any other onboarding work continues.
13. [BUG] Given the merchant clicks "Activar...", when the redirect happens, then the merchant MUST NOT need to click any other button, link, or control to reach /app — the redirect MUST be fully automatic.

## Gating and route protection

14. Given onboarding is not completed, when the merchant navigates to any route other than /app/onboarding, then they are redirected to /app/onboarding.
15. Given onboarding is not completed, when the app shell loads, then the side navigation menu and all app controls are hidden.
16. Given onboarding is not completed, when the merchant attempts to access a feature page directly via URL, then the redirect to onboarding is permanent and cannot be bypassed.

## Activation button ("Activar...") and auto-redirect

17. Given the merchant is on the final onboarding step, then the primary action button text MUST start with "Activar..." (e.g. "Activar Fluxbot en mi tienda").
18. Given the merchant clicks the "Activar..." button, when the completion action succeeds, then onboarding is marked complete.
19. Given onboarding is marked complete, when the merchant is redirected, then the side navigation menu and all app sections become visible and accessible.
20. Given the merchant clicks "Activar...", when the redirect fires, then the merchant lands on /app without requiring an additional click or manual refresh.
21. Given the merchant clicks "Activar...", when the redirect completes, then the merchant sees the Panel/dashboard as the landing page — NOT a blank page, NOT an error, NOT the onboarding page.

## Panel content visibility post-activation (CRITICO - NUEVOS)

22. [BUG] Given the merchant clicks "Activar Fluxbot en mi tienda" on the final onboarding step, when the redirect to /app completes, then the Panel content (dashboard cards, stats, shop connection, menu, header) MUST be fully rendered and visible — NOT a blank page, NOT an error boundary, NOT a never-resolving skeleton, NOT the onboarding page.
23. [BUG] Given the merchant arrives at /app after activation, when the page finishes loading, then the side navigation menu MUST be visible with all items (Dashboard, Configure, Growth, Operations) clickable and functional — WITHOUT requiring a manual refresh or any additional click.
24. [BUG] Given the merchant arrives at /app after activation, when the dashboard data queries execute, then ALL of the following MUST load successfully: Shopify Admin API connection, 7-day analytics report, chatbot configuration, active/total knowledge sources, active campaigns, failed/running sync jobs, open handoffs, and last completed sync. If any query fails, the dashboard MUST still render with partial data and an alert message — NOT crash into an error boundary.
25. Given the merchant arrives at /app?onboarding=done after activation, when the dashboard renders, then the success banner "Asistente activado" / "Assistant activated" MUST be visible at the top of the page with tone="success".
26. Given the merchant arrives at /app after activation, when the app.tsx loader runs, then the URL query parameters (shop, host, embedded, onboarding=done) MUST be preserved and the loader MUST NOT redirect back to /app/onboarding.
27. [BUG] Given the merchant has completed onboarding and is redirected to /app, when the app.tsx loader reads onboardingCompleted from getMerchantAdminConfig, then the value MUST be `true`. If the value is (incorrectly) `false`, the system MUST tolerate this discrepancy and NOT redirect the merchant back to onboarding.
28. Given the merchant completes onboarding and reaches /app, when they navigate to other routes (settings, analytics, data sources, etc.), then all routes MUST be accessible and the menu MUST remain visible — the activation state must persist across all navigations.
29. Given the merchant completes onboarding and reaches /app, when the dashboard loader encounters a GraphQL or database error, then the loader MUST return fallback data with an alert message instead of throwing an unhandled exception — the Panel shell must remain visible.
30. Given the merchant completes onboarding and reaches /app, when the `onboarding=done` URL param is present, then the success banner MUST be rendered using `showOnboardingSuccess` from the loader data — NOT relying on client-side state or local storage.
31. Given the merchant clicks "Activar Fluxbot en mi tienda", when the form submits, then the transition from /app/onboarding to /app MUST NOT show any intermediate Shopify "Handling response" screen, blank page, or loading spinner that requires manual intervention to resolve.
32. Given the merchant's onboarding is completed and they refresh the /app page, then the dashboard MUST load normally with the menu visible, all sections accessible, and showOnboardingSuccess=false (since `onboarding=done` is removed on refresh).

## Regression guardrails

33. Given a step transition occurs, then the DOM should not fully remount the onboarding shell container.
34. Given a step transition occurs, then shared heading/progress elements should keep their layout stable.
