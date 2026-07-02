# Onboarding Design Decisions

## Scope

This file captures implementation choices that make the onboarding transition requirement testable and stable.

## Decisions

- The onboarding route stays mounted across step changes; only the step body swaps.
- A shared shell owns headings, navigation state, and progress context.
- Loading states must be visible immediately during async step resolution.
- The loading UI should use a branded skeleton with a robot or equivalent placeholder.
- The loading container must reserve stable height and width to avoid layout shift.
- Accessibility must be explicit: loading status is announced to assistive tech, and reduced motion must not remove the loading signal.
- If step loading fails, the current shell remains visible and the UI shows a recoverable error state instead of blanking the page.

## Out of Scope

- Redesigning the actual onboarding content copy.
- Changing final completion redirect behavior.
- Changing Shopify auth bounce handling.
