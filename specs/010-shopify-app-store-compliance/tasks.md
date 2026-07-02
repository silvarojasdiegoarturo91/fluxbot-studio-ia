# Tasks: Shopify App Store Compliance Matrix

## Phase 1: Documentation and matrix setup

- [ ] T001 Create `specs/features/shopify-app-store-compliance/requirements.md` with grouped Shopify review surfaces.
- [ ] T002 Create `specs/features/shopify-app-store-compliance/test-cases.md` with automated and manual cases.
- [ ] T003 Create `specs/features/shopify-app-store-compliance/manual-evidence.md` for listing/support/screenshots.
- [ ] T004 Create `specs/010-shopify-app-store-compliance/spec.md` and `plan.md` for SpecKit traceability.
- [ ] T005 Add `specs/010-shopify-app-store-compliance/checklists/requirements.md` for spec quality review.

## Phase 2: Automated compliance checks

- [ ] T006 Add a Vitest suite that checks `shopify.app.toml`, the theme app extension manifest, and the auth/session-token shell.
- [ ] T007 [P] Add a Vitest check that verifies billing uses Shopify Billing API and that the billing route is wired to the existing service.
- [ ] T008 [P] Add a Vitest check that verifies the app manifest exposes embedded app behavior and the expected auth redirects.
- [ ] T009 [P] Add a Vitest check that the storefront widget manifest is a theme app extension and that setup guidance exists.
- [ ] T010 [P] Add a Vitest check that privacy/export/delete flows and factual-copy documentation are present.

## Phase 3: Repo-wide documentation alignment

- [ ] T011 Update `apps/shopify-admin-app/TESTING.md` with the compliance test command and scope.
- [ ] T012 Update `specs/features/README.md` to index the new compliance feature folder.
- [ ] T013 Update `OPENSPEC_INDEX.md` with the new compliance umbrella requirement.
- [ ] T014 Update any submission docs to point to the compliance matrix and manual evidence checklist.

## Phase 4: Validation

- [ ] T015 Run the new compliance test command.
- [ ] T016 Run the existing app unit/integration suites that the compliance matrix references.
- [ ] T017 Verify the compliance docs clearly mark skipped Shopify families with rationale.

## Dependencies & Execution Order

- Phase 1 must land before the repo can point to the compliance matrix.
- Phase 2 can start once the test path and manifest assertions are agreed.
- Phase 3 can happen in parallel with Phase 2 if the docs are stable.
- Phase 4 is a final verification pass after the tests and docs land.
