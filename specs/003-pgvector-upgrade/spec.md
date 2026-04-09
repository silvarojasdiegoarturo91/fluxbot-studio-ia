# Feature Specification: Vector Store Upgrade to pgvector / ANN Index

**Feature Branch**: `003-pgvector-upgrade`  
**OpenSpec ID**: REQ-OPEN-003  
**Created**: 2026-04-09  
**Status**: Draft  
**Priority**: Medium  
**Owner**: Backend IA (`fluxbot-studio-back-ia`)

## Context

The current embedding store in the backend (`fluxbot-studio-back-ia`) persists vectors as JSON arrays in a regular PostgreSQL column. Similarity search is done via full-table scan with cosine distance computed in application code. This works for small catalogs but will degrade significantly at > 50k chunks. This spec covers the upgrade to `pgvector` with an ANN (Approximate Nearest Neighbor) index.

---

## User Scenarios & Testing

### User Story 1 — Merchant with a large catalog gets fast semantic search (Priority: P1)

A merchant with 10,000 products and 50,000 knowledge chunks does a semantic search query from the chat widget. The retrieval completes in under 100ms p99 regardless of catalog size.

**Why this priority**: Directly impacts chat response latency — the most user-visible metric.

**Independent Test**: Load 50,000 synthetic chunks into the DB → run 100 concurrent retrieval queries via `GET /api/v1/embeddings/search` → verify p99 < 100ms.

**Acceptance Scenarios**:

1. **Given** 50,000 EmbeddingRecord rows with pgvector column, **When** a cosine similarity query runs with `top_k=10`, **Then** the query returns in < 50ms (p50) and < 100ms (p99).
2. **Given** an HNSW index on the vector column, **When** a new embedding is inserted, **Then** the index updates automatically without requiring a rebuild.
3. **Given** a shop with embeddings, **When** another shop queries the same endpoint, **Then** results are strictly scoped to the requesting shop (no cross-tenant leakage).

---

### User Story 2 — Backend handles the migration without downtime (Priority: P2)

The migration from JSON vectors to pgvector column runs without dropping existing data. Existing embeddings are converted in-place.

**Why this priority**: Zero-downtime migration is required since the backend is multi-tenant.

**Independent Test**: Run migration on a DB with 1,000 existing rows → verify all rows have non-null `embedding` vector column → verify retrieval works for all shops.

**Acceptance Scenarios**:

1. **Given** existing `EmbeddingRecord` rows with JSON `vector` field, **When** the Prisma migration runs, **Then** data is preserved and the new `embedding` vector column is populated.
2. **Given** the migration is complete, **When** the legacy JSON field is dropped, **Then** no application code references it.

---

### User Story 3 — DevOps can configure index type per deployment (Priority: P3)

The ANN index type (HNSW vs IVFFlat) is configurable via environment variable, allowing tuning for different hardware profiles without code changes.

**Why this priority**: Different deployment environments (Fly.io, Railway, dedicated VM) have different memory/CPU profiles.

**Independent Test**: Set `PGVECTOR_INDEX_TYPE=ivfflat` → restart backend → verify `\d embedding_records` shows IVFFlat index.

**Acceptance Scenarios**:

1. **Given** `PGVECTOR_INDEX_TYPE=hnsw`, **When** the migration runs, **Then** an HNSW index is created with `m=16, ef_construction=64`.
2. **Given** `PGVECTOR_INDEX_TYPE=ivfflat`, **When** the migration runs, **Then** an IVFFlat index is created with `lists=100`.

---

### Edge Cases

- What happens when the PostgreSQL instance doesn't have the `pgvector` extension installed? Migration must fail with a clear error, not a silent crash.
- What happens when a vector dimension mismatch occurs (e.g., model changed from 1536 to 3072 dimensions)? Must be caught at insert time with a typed error.
- What happens when the ANN index build runs out of memory on a small VM? Must fall back gracefully with a warning log.

---

## Requirements

### Functional Requirements

- **FR-001**: The `pgvector` PostgreSQL extension MUST be enabled before running migrations (`CREATE EXTENSION IF NOT EXISTS vector`).
- **FR-002**: `EmbeddingRecord` Prisma model MUST replace the current JSON vector field with a native `vector(N)` column where N matches the embedding model dimension.
- **FR-003**: A Prisma migration MUST convert existing JSON vector data to the `vector` type without data loss.
- **FR-004**: An ANN index (HNSW or IVFFlat, configurable via `PGVECTOR_INDEX_TYPE` env var) MUST be created on the vector column.
- **FR-005**: The retrieval endpoint `GET /api/v1/embeddings/search` MUST use `<=>` (cosine distance) operator for similarity search.
- **FR-006**: All queries MUST include a `shopId` filter before the vector similarity clause (security + performance).
- **FR-007**: Retrieval MUST support configurable `top_k` (default 10, max 50).

### Key Entities

- **EmbeddingRecord** (backend DB): `id`, `shopId`, `chunkId`, `embedding vector(N)`, `model`, `createdAt`
- **KnowledgeChunk** (backend DB): Source chunk text + metadata; linked 1:1 to EmbeddingRecord

## Success Criteria

- **SC-001**: `pgvector` extension enabled and `EmbeddingRecord` migration applies cleanly on fresh DB.
- **SC-002**: Semantic search p99 latency < 100ms at 50,000 chunks with HNSW index.
- **SC-003**: Zero data loss verified: row count before migration == row count after migration.
- **SC-004**: Cross-tenant isolation verified: shop A cannot retrieve shop B embeddings.
- **SC-005**: `npm test` (backend) passes after migration — no broken integration tests.

## Assumptions

- PostgreSQL version >= 15 with pgvector >= 0.5.0 available in the deployment environment.
- Embedding dimension is fixed per shop (currently 1536 for `text-embedding-3-small`). Multi-dimension support is out of scope for this spec.
- Migration is run with `prisma migrate deploy` in the backend repo, not in this repo.
- This spec is owned by `fluxbot-studio-back-ia`; the frontend only consumes the search endpoint contract.

## Implementation Notes

- Install: `pnpm add pgvector` in backend + `CREATE EXTENSION IF NOT EXISTS vector` in migration SQL
- Prisma schema: `embedding Unsupported("vector(1536)")?`
- Raw query for search: `SELECT * FROM embedding_records WHERE shop_id = $1 ORDER BY embedding <=> $2::vector LIMIT $3`
- HNSW index SQL: `CREATE INDEX ON embedding_records USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`
- IVFFlat index SQL: `CREATE INDEX ON embedding_records USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`
