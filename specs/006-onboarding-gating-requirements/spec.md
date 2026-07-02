# Onboarding Gating & UI Visibility Requirements

**Status:** Active  
**Version:** 1.0.0  
**Last Updated:** 2026-05-07

## OpenSpec Trace

- Root requirement: `REQ-ROOT-001`
- Shopify requirement: `REQ-OPEN-009`
- Covered behavior:
  - Pre-onboarding gating: incomplete users cannot access any route except /app/onboarding
  - Menu and controls hidden until onboarding is complete
  - Final step button MUST say "Activar..." to signal activation moment
  - After clicking "Activar...", onboarding marks complete, ALL app sections/pages/elements activate
  - Merchant is redirected automatically to `/app` (Panel)

## Executive Summary

The Fluxbot Studio application implements strict onboarding gating to ensure merchants complete all setup steps before accessing core features. Incomplete users see **only** the onboarding flow with no navigation menu or access to other app features.

## Product Requirements

### PRD-001: Onboarding Completion Gating
**Goal:** Prevent incomplete setup users from accessing app features.

**User Stories:**
- **USR-001:** As a new merchant, I must complete all onboarding steps before seeing the dashboard or menu options
- **USR-002:** As a merchant who reinstalls the app, I must re-complete onboarding to access features
- **USR-003:** As a merchant who completed setup, I should never see onboarding again
- **USR-004:** As a merchant with incomplete setup, I should not be able to navigate away from onboarding via URL

### PRD-002: UI Behavior Based on Onboarding Status

#### For Completed Users (`onboardingCompleted === true`)
- ✅ Side navigation menu **VISIBLE**
- ✅ All menu items **ACCESSIBLE** (Dashboard, Configure, Growth, Operations)
- ✅ Onboarding link **HIDDEN** from menu
- ✅ Can navigate freely between all routes
- ✅ Dashboard and features **VISIBLE**

#### For Incomplete Users (`onboardingCompleted === false`)
- ❌ Side navigation menu **HIDDEN**
- ❌ Dashboard and feature pages **NOT ACCESSIBLE** (redirected to onboarding)
- ❌ Only onboarding route `/app/onboarding` **ACCESSIBLE**
- ❌ Cannot navigate to other routes (hard redirect)
- ❌ All app options and controls **HIDDEN**

### PRD-001a: "Activar..." Button Trigger
**Goal:** The final onboarding step must have a clearly identifiable activation button.

**User Stories:**
- **USR-005:** As a merchant, I want the last onboarding button to say "Activar..." so I know this is the point of no return that activates the app
- **USR-006:** As a merchant, clicking "Activar..." should immediately unlock all app features and take me to the dashboard

**Button Requirements:**
- The primary action button on the final onboarding step MUST start with "Activar..." text
- Example: "Activar Fluxbot en mi tienda"
- The button MUST signal to the merchant that this action activates the app and completes onboarding
- After clicking, completion state is persisted, all app sections/pages/elements become active, and the merchant is redirected to /app

### PRD-001b: Full App Activation Post-Onboarding
**Goal:** All app pages, sections, navigation elements and controls must be inaccessible before completion and fully active after.

**User Stories:**
- **USR-007:** As a merchant with incomplete onboarding, I should not be able to see or reach any app feature, menu option, or page outside the onboarding flow
- **USR-008:** As a merchant who just completed onboarding, I should immediately see the full navigation menu and all app sections

**Activation Rules:**
- Pre-onboarding: menu hidden, all routes (except /app/onboarding) redirect to onboarding, all controls invisible
- Post-onboarding: menu visible, all routes accessible, all controls shown, dashboard is the landing page

### PRD-003: Onboarding Reset Scenarios

**New Installation:**
- User installs app for first time
- `onboardingCompleted` = `false` (implicit via `null`)
- User sees onboarding flow

**Reinstallation:**
- User uninstalls app (webhook: `APP_UNINSTALLED`)
- `onboardingCompletedAt` is set to `null`
- User reinstalls app
- `ensureShopRecord()` detects previous uninstall (status: "CANCELLED")
- User must re-complete onboarding

**Onboarding Completion:**
- User completes all 4 steps
- `onboardingCompletedAt` timestamp is set
- Backend sync triggered in background
- User redirected automatically to `/app` (Panel) without requiring a manual refresh or an additional click
- Menu becomes visible
- User cannot return to onboarding

## Acceptance Criteria

### AC-001: Menu Visibility
```gherkin
Given a user with completed onboarding
When they load the app
Then the side navigation menu is visible
And all menu items are clickable

Given a user with incomplete onboarding  
When they load the app
Then the side navigation menu is NOT visible
And no menu items are accessible
```

### AC-002: Route Protection
```gherkin
Given a user with incomplete onboarding
When they try to access any route except /app/onboarding
Then they are redirected to /app/onboarding
And the redirect is permanent (cannot navigate back)

Given a user with completed onboarding
When they access /app/onboarding
Then they are allowed to see it (for reference)
But it does not appear in the menu navigation
```

### AC-003: Onboarding Item Filtering
```gherkin
Given the navigation groups are generated
When onboardingCompleted is true
Then /app/onboarding is excluded from all nav groups

When onboardingCompleted is false
Then /app/onboarding is included in nav groups
```

### AC-004: Reset on Reinstall
```gherkin
Given a user who previously completed onboarding
When they uninstall the app
Then the onboarding flag is reset via APP_UNINSTALLED webhook

When they reinstall the app
Then ensureShopRecord() detects the previous uninstall
And resets the onboarding state
And the user must re-complete onboarding
```

### AC-005: [BUG] "Activar..." Button Must Trigger Auto-Redirect (Currently Broken)
```gherkin
# BUG: Currently, clicking "Activar Fluxbot en mi tienda" does NOT redirect.
# The merchant stays on /app/onboarding with no way to proceed.
# This is a blocking bug that MUST be fixed.
#
# BUG 2: Even when the redirect DOES happen, the Panel content (dashboard, menu, stats,
# cards, success banner) is NOT visible. The merchant sees a blank/incomplete page.
# This is ALSO a blocking bug that MUST be fixed.

Given a merchant is on the final onboarding step
Then the primary button text starts with "Activar..."
When they click the "Activar..." button
And the completion action persists onboarding state
Then onboarding is marked complete
And ALL app pages, sections, and navigation elements become active
And the side navigation menu becomes visible
And the app redirects AUTOMATICALLY to /app
And the merchant sees the Panel WITHOUT clicking any other button, link, or control
And the merchant does NOT refresh manually
And the redirect happens immediately — no extra click, no manual navigation required
And required Shopify embedded app context is preserved

### NUEVO: Panel Content Visibility

# BUG: Currently, even after the redirect is fixed, the Panel content (dashboard cards,
# stats table, shop connection status, sidebar menu, success banner) is NOT rendering.
# The user arrives at /app but sees no usable content. This is a blocking bug.

Given the merchant is redirected to /app after clicking "Activar..."
When the /app page loads
Then the FULL dashboard content MUST be rendered immediately
And the side navigation menu MUST be visible and fully functional
And ALL dashboard data queries (shop connection, analytics, chatbotConfig, knowledgeSources, campaigns, syncJobs, handoffs) MUST load without error
And the success banner "Asistente activado" / "Assistant activated" MUST be visible
And the `onboarding=done` URL param MUST be preserved
And the merchant MUST NOT be redirected back to /app/onboarding
And if any data query fails, the dashboard MUST still render with partial data and an alert — NOT crash into an error boundary
And the merchant MUST NOT see a blank page, a never-resolving spinner, or any intermediate error screen
```

### AC-006: Pre-Completion Gating
```gherkin
Given a merchant with incomplete onboarding
When they try to access /app/dashboard or any route except /app/onboarding
Then they are redirected to /app/onboarding
And the redirect is permanent (cannot navigate back)
And the side navigation menu is NOT visible
And no app controls or sections are accessible

Given a merchant with incomplete onboarding
When the app shell renders
Then the only visible UI is the onboarding flow
And all app features are hidden
```

## Technical Implementation

### Database
- **Model:** `Shop`
- **Field:** `onboardingCompletedAt?: DateTime`
- **Logic:** 
  - `null` = onboarding not completed
  - `Date` = onboarding completed timestamp
  - Reset to `null` on `APP_UNINSTALLED` webhook

### Route Logic (app/routes/app.tsx - Loader)
```typescript
// Pass onboardingCompleted status to component
return {
  onboardingCompleted: adminConfig.onboardingCompleted,
  // ... other data
};

// Hard redirect incomplete users
if (!requestUrl.pathname.startsWith("/app/onboarding") && !adminConfig.onboardingCompleted) {
  throw redirect(buildOnboardingRedirectPath(...));
}
```

### Navigation Rendering (app/routes/app.tsx - Component)
```typescript
// Conditionally render menu only if onboarding is complete
{onboardingCompleted && (
  <NavMenu>
    {navItems.map(item => <a href={item.url}>{item.label}</a>)}
  </NavMenu>
)}
```

### Navigation Filtering (app/utils/admin-navigation.ts)
```typescript
export function getAdminNavGroups(language: AdminLanguage, onboardingCompleted: boolean) {
  return NAV_ORDER.map(group => ({
    items: group.routes
      .filter(route => !(route === "/app/onboarding" && onboardingCompleted))
      .map(route => ({ label: ROUTE_COPY[route][language].title, url: route }))
  }));
}
```

### Onboarding Completion (app/routes/app.onboarding.tsx - Action)
```typescript
// When user completes onboarding
if (intent === "complete") {
  // Update completion timestamp
  await prisma.shop.update({
    where: { id: shop.id },
    data: { onboardingCompletedAt: new Date() }
  });
  
  // Trigger backend sync (fire-and-forget)
  syncShopReferenceToIABackend({...}, { force: true })
    .catch(error => console.error("Sync failed:", error));

  // Redirect immediately after completion
  return redirect("/app");
}
```

## Metrics & Validation

### Metrics to Track
- Users completing onboarding (conversion rate)
- Average time to complete onboarding
- Reinstall rate and re-onboarding frequency
- Menu visibility duration (from completion to first nav click)

### Validation Points
- ✅ Unit tests: `onboardingCompleted` flag properly passed through component tree
- ✅ Integration tests: Routes properly redirect incomplete users
- ✅ Regression tests: Final onboarding action redirects completed users to `/app`
- ✅ E2E tests: Menu appears/disappears based on onboarding state
- ✅ E2E tests: User cannot escape onboarding flow via URL manipulation

## Dependencies

### Database Migration
- `migrations/20260506223346_add_onboarding_tracking/migration.sql`
- Adds `onboardingCompletedAt` field to Shop model

### API Endpoints
- `POST /app/onboarding` (action) - updates completion timestamp
- `GET /app/webhooks` (listener) - handles APP_UNINSTALLED event

### External Services
- Shopify Admin API (for session & shop data)
- Backend IA sync service (fire-and-forget)

## Files Modified

- `apps/shopify-admin-app/app/routes/app.tsx`
- `apps/shopify-admin-app/app/utils/admin-navigation.ts`
- `apps/shopify-admin-app/app/routes/app.onboarding.tsx`
- `apps/shopify-admin-app/app/routes/api.webhooks.ts`
- `apps/shopify-admin-app/infra/prisma/schema.prisma`
- `apps/shopify-admin-app/infra/prisma/migrations/20260506223346_add_onboarding_tracking/migration.sql`

## Testing Strategy

### Unit Tests
- [ ] `getAdminNavGroups()` filters onboarding item when `onboardingCompleted=true`
- [ ] `getAdminNavGroups()` includes onboarding item when `onboardingCompleted=false`
- [ ] Loader returns correct `onboardingCompleted` status

### Integration Tests  
- [ ] App loader redirects incomplete users away from non-onboarding routes
- [ ] Menu renders conditionally based on `onboardingCompleted` prop
- [ ] Onboarding completion action returns redirect to `/app`

### E2E Tests
- [ ] New user sees only onboarding, no menu
- [ ] After completing onboarding, menu appears
- [ ] After clicking the final onboarding button, user lands on `/app`
- [ ] Reinstalled user sees onboarding again
- [ ] URL manipulation cannot bypass onboarding

## Glossary

- **Onboarding**: 4-step guided setup flow (Magic Setup)
- **Gating**: Route protection + UI visibility control
- **Completion**: User finished all 4 onboarding steps
- **Reinstall**: App uninstalled and reinstalled by same shop
- **Frontend**: React Router app running in Shopify embedded context

## References

- App Loader: `apps/shopify-admin-app/app/routes/app.tsx`
- Navigation Utility: `apps/shopify-admin-app/app/utils/admin-navigation.ts`
- Onboarding Route: `apps/shopify-admin-app/app/routes/app.onboarding.tsx`
- Webhook Handler: `apps/shopify-admin-app/app/routes/api.webhooks.ts`
- Database Schema: `infra/prisma/schema.prisma`
