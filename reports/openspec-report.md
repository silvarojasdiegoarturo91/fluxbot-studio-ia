# Fluxbot Studio IA

**Status:** in-development

| Phase | Total | Completed | In Progress | Planned | Blocked |
| --- | ---: | ---: | ---: | ---: | ---: |
| phase0 | 2 | 2 | 0 | 0 | 0 |
| phase1 | 5 | 5 | 0 | 0 | 0 |
| phase2 | 5 | 5 | 0 | 0 | 0 |
| phase3 | 3 | 3 | 0 | 0 | 0 |
| phase4 | 1 | 1 | 0 | 0 | 0 |
| phase5 | 1 | 1 | 0 | 0 | 0 |
| phase6 | 1 | 1 | 0 | 0 | 0 |
| phase7 | 1 | 1 | 0 | 0 | 0 |
| phase8 | 1 | 1 | 0 | 0 | 0 |
| backend_ia | 8 | 8 | 0 | 0 | 0 |
| open_items | 6 | 6 | 0 | 0 | 0 |

## phase0

- **REQ-P0-001** (completed, critical) - Foundation regression contract (auth / navigation / env / build / Shopify connection)
- **REQ-P0-002** (completed, critical) - Frontend configuration decoupled from provider secrets

## phase1

- **REQ-P1-001** (completed, critical) - Shopify embedded app shell + admin routes
- **REQ-P1-002** (completed, critical) - HTTP gateway and contract toward fluxbot-studio-back-ia
- **REQ-P1-003** (completed, critical) - Chat orchestration and retrieval migrated to backend IA
- **REQ-P1-004** (completed, high) - Order lookup — read-only commerce capability
- **REQ-P1-005** (completed, critical) - PostgreSQL + Prisma ORM — multi-tenant schema

## phase2

- **REQ-P2-001** (completed, high) - Behavioral event capture and conversion signal storage
- **REQ-P2-002** (completed, high) - Intent detection and trigger decisioning — migrated to backend IA
- **REQ-P2-003** (completed, high) - Commerce execution layer (add-to-cart, handoff persistence)
- **REQ-P2-004** (completed, high) - Proactive messaging — decisioning in backend, dispatch in frontend
- **REQ-P2-005** (completed, high) - Advanced reranking and RAG quality pipeline

## phase3

- **REQ-P3-001** (completed, medium) - Omnichannel delivery and callback operations
- **REQ-P3-002** (completed, medium) - llms.txt generation and publication
- **REQ-P3-003** (completed, medium) - Marketing automations and multilingual campaigns

## phase4

- **REQ-P4-001** (completed, high) - Enterprise compliance and governance

## phase5

- **REQ-P5-001** (completed, medium) - Enterprise connector hardening (SIEM, legal hold workflow, regional deployment)

## phase6

- **REQ-P6-001** (completed, critical) - Architecture separation closure

## phase7

- **REQ-P7-001** (completed, high) - Storefront widget publication admin surface

## phase8

- **REQ-P8-001** (completed, high) - Remote vector retrieval contract (/api/v1/embeddings/search)

## backend_ia

- **REQ-BACK-001** (completed, critical) - Express API server with authentication and rate limiting
- **REQ-BACK-002** (completed, critical) - LLM orchestration — provider-agnostic chat
- **REQ-BACK-003** (completed, critical) - RAG — retrieval augmented generation pipeline
- **REQ-BACK-004** (completed, high) - Intent detection and trigger decisioning
- **REQ-BACK-005** (completed, high) - Knowledge graph, commerce tools and analytics
- **REQ-BACK-006** (completed, high) - Shop reference sync and AI provider config management
- **REQ-BACK-007** (completed, medium) - llms.txt content generation
- **REQ-BACK-008** (completed, medium) - Enterprise compliance and omnichannel routes in backend

## open_items

- **REQ-OPEN-001** (completed, high) - Storefront widget — Theme App Extension (real embed)
- **REQ-OPEN-002** (completed, high) - Product & catalog synchronization (initial + incremental)
- **REQ-OPEN-003** (completed, medium) - Vector store upgrade to pgvector / ANN index
- **REQ-OPEN-004** (completed, low) - External SIEM adapter integration (Datadog / Splunk)
- **REQ-OPEN-005** (completed, low) - Phase 1 E2E chat test (needs running PostgreSQL)
- **REQ-OPEN-006** (completed, high) - Frontend admin alignment with local UI/UX skills

