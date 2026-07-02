# Implementation Plan: Shopify App Store Compliance Matrix

**Branch**: `010-shopify-app-store-compliance` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

## Summary

Create a compliance matrix that maps the Shopify App Store best-practices documentation to the real app surfaces in this repo, then back it with local tests, manual evidence docs and explicit skipped-family rationale.

## Technical Context

**Language/Version**: TypeScript / Node.js  
**Primary Dependencies**: Vitest, Playwright, React Router, Shopify App Bridge React, Shopify App Router, Prisma  
**Storage**: PostgreSQL via Prisma, plus static TOML/docs in-repo  
**Testing**: Vitest integration/unit tests, existing Playwright E2E suites, static file assertions  
**Target Platform**: Shopify embedded app + storefront theme app extension  
**Project Type**: Web application with admin app and storefront extension  
**Performance Goals**: Compliance checks should run as part of the existing test suite without external Shopify network access for static assertions  
**Constraints**: Preserve current app behavior; do not invent payments/purchase-option/POS flows that the app does not ship  
**Scale/Scope**: App manifest, auth shell, billing, privacy, theme extension, docs and tests

## Constitution Check

*GATE: Existing repo rules already require OpenSpec/SpecKit traceability and local QA. This feature must add documentation and tests without breaking the current Shopify app boundaries.*

## Project Structure

### Documentation (this feature)

```text
specs/010-shopify-app-store-compliance/
├── spec.md
├── plan.md
├── checklists/
│   └── requirements.md
├── tasks.md
└── manual-evidence.md
```

### Source Code (repository root)

```text
apps/shopify-admin-app/
├── shopify.app.toml
├── app/
│   ├── root.tsx
│   ├── shopify.server.ts
│   ├── routes/
│   │   ├── app.tsx
│   │   ├── app._index.tsx
│   │   ├── app.billing.tsx
│   │   ├── app.privacy.tsx
│   │   └── app.widget-publish.tsx
│   ├── services/
│   │   └── billing.server.ts
│   └── utils/
│       └── authenticate-admin.server.ts
├── test/
│   └── integration/
│       └── shopify-app-store-compliance.test.ts
└── tests/e2e/
    └── ...
```

**Structure Decision**: Reuse the existing Shopify app repo, add a dedicated compliance test file and keep the feature docs under `specs/010-shopify-app-store-compliance/` plus `specs/features/shopify-app-store-compliance/`.
