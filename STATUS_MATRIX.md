# Implementation Status Matrix (Canonical)

Last updated: 2026-03-10

This is the only source of truth for implementation status across phases.

Rules:
- Update this file when a capability changes state.
- `README.md` and `PHASE_*.md` must reference this matrix instead of duplicating checklists.
- Status values are: `DONE`, `IN_PROGRESS`, `PLANNED`, `BLOCKED`.

Validation snapshot (2026-03-10):
- `npm run typecheck` ✅
- `npm test` ✅ (`39/39` files, `812/812` tests, including Phase 0 `68/68`)

## Matrix

| Phase | Capability | Status | Evidence | Next Step |
| --- | --- | --- | --- | --- |
| Phase 0 | Foundation regression contract (auth/navigation/env/build/shopify connection) | DONE | `apps/shopify-admin-app/test/phase0/` | Keep green on every production change with `npm test` |
| Phase 1 | Shopify embedded app shell + admin routes | DONE | `apps/shopify-admin-app/app/routes/app.tsx`, `apps/shopify-admin-app/app/routes/app._index.tsx` | Continue feature hardening inside existing shell |
| Phase 1 | Chat + RAG baseline (conversation flow, retrieval, AI orchestration) | DONE | `apps/shopify-admin-app/app/routes/api.chat.ts`, `apps/shopify-admin-app/app/services/ai-orchestration.server.ts` | Improve accuracy and evaluation datasets |
| Phase 1 | Order lookup (read-only baseline) | IN_PROGRESS | `apps/shopify-admin-app/app/services/ai-orchestration.server.ts`, `infra/prisma/schema.prisma` | Expose explicit order lookup tool endpoint and verification flow |
| Phase 2 | Behavioral tracking + trigger evaluation | DONE | `apps/shopify-admin-app/app/routes/api.events.track.ts`, `apps/shopify-admin-app/app/routes/api.triggers.evaluate.ts` | Tune trigger quality and reduce false positives |
| Phase 2 | Add-to-cart from chat | DONE | `apps/shopify-admin-app/app/services/commerce-actions.server.ts`, `apps/shopify-admin-app/app/routes/api.cart.add.ts`, `apps/shopify-admin-app/app/services/ai-orchestration.server.ts` | Add storefront UX wiring for one-click commit path |
| Phase 2 | Human handoff | DONE | `apps/shopify-admin-app/app/services/handoff.server.ts`, `apps/shopify-admin-app/app/routes/api.handoff.ts`, `apps/shopify-admin-app/app/services/ai-orchestration.server.ts` | Connect external helpdesk adapters (Zendesk/Gorgias/Inbox) |
| Phase 2 | Advanced reranking + conversion analytics dashboard | IN_PROGRESS | `apps/shopify-admin-app/app/services/embeddings.server.ts`, `apps/shopify-admin-app/app/routes/api.stats.messages.tsx` | Add reranker provider adapter + merchant dashboard views |
| Phase 3 | Omnichannel delivery (WhatsApp/Instagram/SMS/Email) | DONE | `apps/shopify-admin-app/app/services/omnichannel-bridge.server.ts`, `apps/shopify-admin-app/app/services/delivery.server.ts`, `apps/shopify-admin-app/app/routes/api.omnichannel.delivery-callback.ts` | Add provider-specific adapters and onboarding controls |
| Phase 3 | AEO / `llms.txt` generation | DONE | `apps/shopify-admin-app/app/services/llms-txt.server.ts`, `apps/shopify-admin-app/app/routes/api.llms-txt.ts`, `apps/shopify-admin-app/app/routes/llms[.]txt.ts` | Add scheduled refresh and merchant visibility controls |
| Phase 3 | Marketing automations + advanced multilingual flows | PLANNED | `infra/prisma/schema.prisma`, `apps/shopify-admin-app/app/services/proactive-messaging.server.ts` | Implement campaign orchestration and locale-aware templates |
| Phase 4 | Enterprise compliance (residency, retention automation, governance) | IN_PROGRESS | `apps/shopify-admin-app/app/routes/api.compliance.enterprise.ts`, `infra/prisma/schema.prisma` | Add regional data controls and compliance reporting UI |

## Documentation Alignment

The files below are non-canonical and must not maintain independent phase state:
- `README.md`
- `apps/shopify-admin-app/README.md`
- `PHASE_2_STATUS.md`
- `PHASE_3_PROGRESS.md`
- Other `PHASE_*.md` documents
