# Admin ↔ Storefront Config Sync Test Plan (0-100)

## Coverage model

- **0-30 (Contract & unit):** Mapping and validation correctness.
- **31-70 (Integration & E2E):** End-to-end parity through Admin save -> storefront render.
- **71-100 (Visual & resilience):** Pixel/visual parity, cross-browser, race conditions, reinstall paths.

## 0-30: Contract and unit tests

### Domain mapping tests
1. Admin `primaryColor` maps to widget style token/field exactly.
2. Admin `launcherPosition` (`left`/`right`) maps 1:1 to widget placement enum.
3. Text fields (`botName`, `greeting`, `launcherLabel`) preserve exact string value.
4. Invalid color values trigger safe default + validation error signal.
5. Unknown position values are rejected and never rendered as active config.

### Versioning/consistency tests
6. Config payload includes version/hash for storefront consumption.
7. Storefront ignores stale versions when newer version already applied.
8. Partial update payload is normalized into full canonical config before publish.

## 31-70: Integration and E2E tests

### Core parity journeys (Playwright/Cypress E2E)
1. Merchant sets color to blue in Admin -> storefront widget renders blue.
2. Merchant sets position left -> storefront launcher appears left.
3. Merchant sets position right -> storefront launcher appears right.
4. Merchant edits greeting text -> storefront welcome message matches.
5. Merchant edits launcher label -> storefront launcher text matches.
6. Merchant updates multiple fields in one save -> storefront applies all fields in same refresh cycle.

### Gating and lifecycle journeys
7. New install with incomplete onboarding -> storefront follows safe/onboarding-gated state.
8. Completed onboarding -> storefront renders active configured widget.
9. Uninstall + reinstall -> onboarding reset enforced.
10. Reinstall before onboarding completion -> storefront does not show active old config.
11. Reinstall + onboarding completion -> storefront renders latest valid config.

### Negative/error-path E2E
12. Simulated config fetch failure -> widget uses explicit safe defaults.
13. Corrupted config payload -> widget does not crash and logs diagnostic metadata.
14. Rapid consecutive admin saves -> storefront ends in latest version only.

## 71-100: Visual and resilience tests

### Visual regression matrix
1. Baseline screenshots per theme + viewport:
   - Desktop: 1440x900
   - Tablet: 1024x768
   - Mobile: 390x844
2. Browser matrix:
   - Chromium
   - WebKit
   - Firefox
3. Compare launcher position (left/right) snapshots.
4. Compare primary color snapshots (at least 3 representative colors).
5. Compare key text snapshots (launcher label + greeting visible states).

### Interaction visual tests
6. Closed launcher state visual match.
7. Opened chat modal visual match.
8. Hover/focus states preserve configured color semantics.
9. Animation end-state remains in configured position (no drift).

### Resilience/performance checks
10. P95 Admin-save-to-storefront-visible latency <= 5s.
11. Concurrent merchant sessions keep same final config output.
12. Theme switch does not break configured parity fields.

## Exit criteria

- 100% pass in P1 parity E2E cases (color, position, text).
- 0 unresolved visual diffs in approved baseline scope.
- 0 critical mismatches between Admin canonical config and storefront effective config.
