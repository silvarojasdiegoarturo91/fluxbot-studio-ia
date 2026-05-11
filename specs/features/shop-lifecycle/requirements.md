# Shop Lifecycle Requirements (Frontend)

## Functional requirements

- **FR-SL-FE-001:** Frontend auth/bootstrap flows MUST restore access for existing shops after reinstall.
- **FR-SL-FE-002:** Frontend MUST treat uninstalled/reinstalled shops as requiring onboarding re-completion.
- **FR-SL-FE-003:** Frontend MUST not show normal app navigation until onboarding is completed again after reinstall.

## Acceptance criteria

1. Given a shop that was marked cancelled after uninstall, when the merchant reinstalls and opens the app, then onboarding is required.
2. Given a reinstalled shop without completed onboarding, when navigating to non-onboarding routes, then redirect to onboarding occurs.
