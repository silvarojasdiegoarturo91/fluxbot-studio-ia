# Implementation Status Matrix (Canonical)

Last updated: 2026-03-10

This is the only source of truth for implementation status in `fluxbot-studio-ia`.

Important scope rule:
- This matrix now reflects the separated architecture between `fluxbot-studio-ia` and `fluxbot-studio-back-ia`.
- When a capability is owned by `fluxbot-studio-back-ia`, the status here refers to the migration and integration state from the frontend repo, not the global completion of the backend repo.

Rules:
- Update this file when a capability changes state.
- `README.md` and `PHASE_*.md` must reference this matrix instead of duplicating checklists.
- Status values are: `DONE`, `IN_PROGRESS`, `PLANNED`, `BLOCKED`.

Validation snapshot (2026-03-10):
- `npm run typecheck` ✅
- `npm test` ✅ (`47/47` files, `888/888` tests, including Phase 0 `68/68`)

## Ownership Model

Frontend repo (`fluxbot-studio-ia`) owns:
- Shopify OAuth, sessions, Admin GraphQL integration
- Embedded admin UI and storefront delivery surfaces
- Shopify projections (`ProductProjection`, `PolicyProjection`, `OrderProjection`)
- Conversations, audit, consent, compliance and omnichannel delivery
- Commerce execution (`add-to-cart`, handoff persistence, operational callbacks)
- HTTP gateway to the IA backend

Backend repo (`fluxbot-studio-back-ia`) owns:
- LLM orchestration, provider selection and provider secrets
- Retrieval, embeddings, reranking and vector search
- Intent detection, trigger decisioning and proactive AI logic
- `llms.txt` generation logic
- IA analytics (tokens, cost, latency, quality)

## Matrix

| Phase | Capability | Final owner | Current runtime in this repo | Status in `fluxbot-studio-ia` | Evidence | Next step |
| --- | --- | --- | --- | --- | --- | --- |
| Phase 0 | Foundation regression contract (auth/navigation/env/build/shopify connection) | Frontend | Frontend | DONE | `apps/shopify-admin-app/test/phase0/` | Keep green on every production change with `npm test` |
| Phase 0 | Frontend configuration decoupled from provider secrets | Frontend | Remote by default, local fallback | DONE | `apps/shopify-admin-app/app/config.server.ts`, `apps/shopify-admin-app/.env.example`, `apps/shopify-admin-app/test/unit/config-execution.test.ts` | Keep provider keys only for explicit `IA_EXECUTION_MODE=local` workflows |
| Phase 1 | Shopify embedded app shell + admin routes | Frontend | Frontend | DONE | `apps/shopify-admin-app/app/routes/app.tsx`, `apps/shopify-admin-app/app/routes/app._index.tsx` | Continue feature hardening inside existing shell |
| Phase 1 | HTTP gateway and contract toward `fluxbot-studio-back-ia` | Frontend | Remote by default, local fallback | DONE | `apps/shopify-admin-app/app/services/ia-backend.client.ts`, `apps/shopify-admin-app/app/services/ia-gateway.server.ts`, `apps/shopify-admin-app/test/contracts/ia-gateway-contract.test.ts` | Extend the same contract-first pattern to remaining IA-facing routes |
| Phase 1 | Chat orchestration, retrieval and embeddings execution migrated out of frontend | Backend IA | Remote by default, local fallback | DONE | `apps/shopify-admin-app/app/routes/api.chat.ts`, `apps/shopify-admin-app/app/services/ia-gateway.server.ts`, `apps/shopify-admin-app/.env.example` | Remove transitional local implementations when backend migration is fully complete |
| Phase 1 | Order lookup (read-only business capability) | Frontend | Frontend | DONE | `apps/shopify-admin-app/app/services/order-lookup.server.ts`, `apps/shopify-admin-app/app/routes/api.orders.lookup.ts`, `apps/shopify-admin-app/test/integration/order-lookup-route.test.ts` | Let the IA backend consume this tool endpoint for verified order support flows |
| Phase 2 | Behavioral event capture and conversion signal storage | Shared (frontend capture, backend analysis) | Frontend | DONE | `apps/shopify-admin-app/app/routes/api.events.track.ts`, `apps/shopify-admin-app/app/routes/api.events.track-batch.ts`, `infra/prisma/schema.prisma` | Keep capture in frontend and forward analysis inputs to backend |
| Phase 2 | Intent detection and trigger decisioning migrated to backend | Backend IA | Remote-only (no local fallback) | DONE | `apps/shopify-admin-app/app/services/ia-gateway.server.ts`, `apps/shopify-admin-app/app/routes/api.intent.analyze.ts`, `apps/shopify-admin-app/app/routes/api.triggers.evaluate.ts`, `apps/shopify-admin-app/test/contracts/ia-decisioning-contract.test.ts`, `apps/shopify-admin-app/test/integration/decisioning-routes.test.ts` | Keep the versioned `/api/v1/intent/*` and `/api/v1/triggers/*` contracts stable |
| Phase 2 | Commerce execution layer (`add-to-cart`, handoff persistence) | Frontend | Frontend | DONE | `apps/shopify-admin-app/app/services/commerce-actions.server.ts`, `apps/shopify-admin-app/app/services/handoff.server.ts`, `apps/shopify-admin-app/app/routes/api.cart.add.ts`, `apps/shopify-admin-app/app/routes/api.handoff.ts` | Connect widget UX and external support adapters |
| Phase 2 | Proactive messaging orchestration split (decisioning back, dispatch front) | Shared | Decisioning remote-only, dispatch frontend | DONE | `apps/shopify-admin-app/app/services/proactive-messaging.server.ts`, `apps/shopify-admin-app/app/services/ia-gateway.server.ts`, `apps/shopify-admin-app/app/services/delivery.server.ts`, `apps/shopify-admin-app/app/services/omnichannel-bridge.server.ts`, `apps/shopify-admin-app/test/unit/proactive-messaging.test.ts` | Keep delivery retries and cooldown-side effects in frontend until cross-process persistence is needed |
| Phase 2 | Advanced reranking and IA recommendation quality pipeline | Backend IA | Remote-only via gateway with quality params contract | DONE | `apps/shopify-admin-app/app/services/rag-builder.server.ts`, `apps/shopify-admin-app/app/services/ia-backend.client.ts`, `apps/shopify-admin-app/app/routes/api.rag.quality.ts`, `apps/shopify-admin-app/test/integration/rag-remote-gateway.test.ts`, `apps/shopify-admin-app/test/integration/rag-quality-route.test.ts` | Backend implements quality params (`minScore`, `rerankStrategy`, `topK`, `qualityMetadata`) against the versioned `/api/v1/rag/search` contract |
| Phase 3 | Omnichannel delivery and callback operations (WhatsApp/Instagram/SMS/Email) | Frontend | Frontend | DONE | `apps/shopify-admin-app/app/services/delivery.server.ts`, `apps/shopify-admin-app/app/services/omnichannel-bridge.server.ts`, `apps/shopify-admin-app/app/routes/api.omnichannel.delivery-callback.ts` | Add provider-specific onboarding and merchant controls |
| Phase 3 | `llms.txt` publishing surface aligned to separated backend | Shared (backend generates, frontend publishes) | Backend generation + frontend publication only | DONE | `apps/shopify-admin-app/app/services/llms-txt.server.ts`, `apps/shopify-admin-app/app/routes/api.llms-txt.ts`, `apps/shopify-admin-app/app/routes/llms[.]txt.ts`, `apps/shopify-admin-app/test/integration/llms-routes.test.ts`, `REFACTORING_SEPARATION.md` | Keep publishing routes stable and version the backend generator contract |
| Phase 3 | Marketing automations and advanced multilingual decisioning | Backend IA | Not migrated | PLANNED | `apps/shopify-admin-app/app/services/proactive-messaging.server.ts`, `REFACTORING_SEPARATION.md` | Implement campaign decisioning and locale-aware policy in backend |
| Phase 4 | Enterprise compliance, governance and regional controls | Frontend | Frontend | IN_PROGRESS | `apps/shopify-admin-app/app/routes/api.compliance.enterprise.ts`, `infra/prisma/schema.prisma` | Add regional controls, reporting UI and retention automation completion |

## Documentation Alignment

The files below are non-canonical and must not maintain independent phase state:
- `README.md`
- `apps/shopify-admin-app/README.md`
- `PHASE_2_STATUS.md`
- `PHASE_3_PROGRESS.md`
- Other `PHASE_*.md` documents
