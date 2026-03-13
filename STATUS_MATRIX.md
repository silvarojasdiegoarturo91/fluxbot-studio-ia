# Implementation Status Matrix (Canonical)

Last updated: 2026-03-13

This is the only source of truth for implementation status in `fluxbot-studio-ia`.

Important scope rule:
- This matrix now reflects the separated architecture between `fluxbot-studio-ia` and `fluxbot-studio-back-ia`.
- When a capability is owned by `fluxbot-studio-back-ia`, the status here refers to the migration and integration state from the frontend repo, not the global completion of the backend repo.

Rules:
- Update this file when a capability changes state.
- `README.md` and `PHASE_*.md` must reference this matrix instead of duplicating checklists.
- Status values are: `DONE`, `IN_PROGRESS`, `PLANNED`, `BLOCKED`.

Validation snapshot (2026-03-13):
- `npm run typecheck` ✅
- `npm test` ✅ (`52/52` files, `965/965` tests, including Phase 0 `68/68`)
- `fluxbot-studio-back-ia`: `npm run build` ✅ and `npm test` ✅ (`3/3` files, `29/29` tests)

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
| Phase 3 | Marketing automations and advanced multilingual decisioning | Shared (frontend campaign surfaces, backend audience decisioning) | Frontend campaign CRUD/dispatch + multilingual template resolution + automatic campaign dispatch hook from remote trigger decisioning | DONE | `infra/prisma/schema.prisma`, `apps/shopify-admin-app/app/services/campaign.server.ts`, `apps/shopify-admin-app/app/routes/api.campaigns.ts`, `apps/shopify-admin-app/app/routes/api.campaigns.$id.ts`, `apps/shopify-admin-app/app/routes/api.campaigns.$id.dispatch.ts`, `apps/shopify-admin-app/app/routes/app.campaigns.tsx`, `apps/shopify-admin-app/app/services/proactive-messaging.server.ts`, `apps/shopify-admin-app/test/unit/campaign-service.test.ts`, `apps/shopify-admin-app/test/integration/campaigns-routes.test.ts`, `apps/shopify-admin-app/test/unit/proactive-messaging.test.ts` | Backend IA should continue emitting `campaignId`/campaign metadata in trigger recommendation payloads to maximize campaign-level dispatch coverage |
| Phase 4 | Enterprise compliance, governance and regional controls | Frontend | Frontend | DONE | `apps/shopify-admin-app/app/routes/api.compliance.enterprise.ts`, `apps/shopify-admin-app/app/routes/app.privacy.tsx`, `apps/shopify-admin-app/app/services/enterprise-compliance.server.ts`, `apps/shopify-admin-app/app/jobs/scheduler.server.ts`, `apps/shopify-admin-app/test/integration/enterprise-compliance.test.ts`, `infra/prisma/schema.prisma` | Expand enterprise connectors (SIEM/export pipelines, legal hold workflows, and regional deployment controls) |
| Phase 5 | Enterprise connector hardening (SIEM export pipeline, legal hold workflow, regional deployment controls) | Frontend | Frontend | DONE | `apps/shopify-admin-app/app/services/enterprise-compliance.server.ts`, `apps/shopify-admin-app/app/routes/api.compliance.enterprise.ts`, `apps/shopify-admin-app/app/routes/app.privacy.tsx`, `apps/shopify-admin-app/test/integration/enterprise-compliance.test.ts`, `apps/shopify-admin-app/test/integration/enterprise-compliance-route.test.ts` | Integrate external SIEM adapters (Datadog/Splunk), persist legal holds/deployment policies in DB, and add legal-hold scoped retention exclusions per data class |
| Phase 6 | Separation closure checklist (legacy IA services out of primary flow, compatibility preserved, tests aligned) | Frontend | Remote-first via `IAGateway` with explicit local compatibility path | DONE | `SEPARATION_PLAN.md`, `apps/shopify-admin-app/app/services/ia-gateway.server.ts`, `apps/shopify-admin-app/app/routes/api.chat.ts`, `apps/shopify-admin-app/test/integration/route-handlers-execution.test.ts` | Keep compatibility paths only for controlled fallback workflows and continue contract-first gateway tests |
| Phase 7 | Storefront widget publication operations in Admin (status, theme linkage, publish/reset controls) | Frontend | Frontend | DONE | `apps/shopify-admin-app/app/routes/app.widget-publish.tsx`, `apps/shopify-admin-app/test/integration/widget-publish-route.test.ts`, `apps/shopify-admin-app/app/routes/app.tsx` | Replace manual confirmation with automatic Theme App Embed verification via Shopify Admin API/App Extension status checks |
| Phase 8 | Remote vector retrieval contract completed (`/api/v1/embeddings/search`) and remote-first retrieval wiring | Shared (frontend gateway + backend IA retrieval) | Remote-first with local fallback compatibility | DONE | `apps/shopify-admin-app/app/services/vector-retrieval.server.ts`, `apps/shopify-admin-app/app/services/ia-gateway.server.ts`, `apps/shopify-admin-app/test/contracts/vector-retrieval-gateway-contract.test.ts`, `fluxbot-studio-back-ia/src/routes/embeddings.ts` | Evolve storage from JSON embeddings to pgvector/ANN index for high-scale retrieval latency |

## Documentation Alignment

Aligned on 2026-03-11:
- `README.md` now points to this matrix for repo status
- `apps/shopify-admin-app/README.md` now uses this matrix instead of keeping its own V2/V3 checklist
- `PROJECT_STATUS.md`, `ARCHITECTURE.md` and `SEPARATION_PLAN.md` are now explicitly marked as historical or non-canonical for phase tracking
- Historical `PHASE_*.md` documents must remain implementation diaries only

Phase coverage reference:
- Phase 0: `apps/shopify-admin-app/test/README.md` and `apps/shopify-admin-app/test/phase0/` provide regression evidence only; status remains canonical here.
- Phase 1: `PHASE_1_COMPLETE.md`, `PHASE_1_SETUP.md` and `apps/shopify-admin-app/test/phase1/README.md` are historical/setup references only.
- Phase 2: `PHASE_2_PLAN.md`, `PHASE_2_PROGRESS.md`, `PHASE_2_PROGRESS_FINAL.md`, `PHASE_2_STATUS.md` and `PHASE_2_SUMMARY.md` are non-canonical and must defer to this matrix.
- Phase 3: `PHASE_3_PROGRESS.md` is non-canonical and must defer to this matrix.
- Phase 4: `PHASE_4_PLAN.md` is a planning artifact only and must not define live status.
- Phase 5: no standalone `PHASE_5_*.md` document exists today; Phase 5 status is maintained only in this matrix until one is created.
- Phase 6: closure checklist tracked in `SEPARATION_PLAN.md` (non-canonical for runtime status; canonical state remains this matrix).
- Phase 7: widget publication operations are implemented in `app.widget-publish.tsx` and verified by `widget-publish-route.test.ts`.
- Phase 8: remote vector retrieval contract is implemented via `IAGateway.searchEmbeddings` + backend `/api/v1/embeddings/search` and verified by `vector-retrieval-gateway-contract.test.ts`.

The files below are non-canonical and must not maintain independent phase state:
- `README.md`
- `apps/shopify-admin-app/README.md`
- `PROJECT_STATUS.md`
- `ARCHITECTURE.md`
- `SEPARATION_PLAN.md`
- `PHASE_1_COMPLETE.md`
- `PHASE_1_SETUP.md`
- `PHASE_2_PLAN.md`
- `PHASE_2_PROGRESS.md`
- `PHASE_2_PROGRESS_FINAL.md`
- `PHASE_2_STATUS.md`
- `PHASE_2_SUMMARY.md`
- `PHASE_3_PROGRESS.md`
- `PHASE_4_PLAN.md`
- `PHASE_6_*` documents if created later
- Other `PHASE_*.md` documents
