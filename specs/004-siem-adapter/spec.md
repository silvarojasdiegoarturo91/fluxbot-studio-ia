# Feature Specification: External SIEM Adapter Integration (Datadog / Splunk)

**Feature Branch**: `004-siem-adapter`  
**OpenSpec ID**: REQ-OPEN-004  
**Created**: 2026-04-09  
**Status**: Draft  
**Priority**: Low  
**Owner**: Frontend (`fluxbot-studio-ia`)

## Context

Enterprise merchants require audit events to be exported to their Security Information and Event Management (SIEM) system. The frontend already stores `AuditLog` records in PostgreSQL. This spec covers building a configurable export pipeline that ships those events to Datadog Logs or Splunk HEC in near real-time, with support for legal hold exclusions.

---

## User Scenarios & Testing

### User Story 1 — Enterprise merchant exports audit events to Datadog (Priority: P1)

A merchant's security team configures a Datadog API key in the FluxBot admin. All compliance events (consent changes, data exports, handoff requests, PII deletions) appear in their Datadog Log Management dashboard within 60 seconds.

**Why this priority**: Unlocks enterprise sales — compliance teams won't approve a vendor without SIEM integration.

**Independent Test**: Configure Datadog endpoint in DB → trigger an `AuditLog` event → mock Datadog HEC endpoint → verify payload received within 60 seconds.

**Acceptance Scenarios**:

1. **Given** a Datadog endpoint and API key configured for a shop, **When** an `AuditLog` record is created, **Then** the event is exported to Datadog within 60 seconds.
2. **Given** the Datadog endpoint is unreachable, **When** the export job runs, **Then** the event is retried up to 3 times with exponential backoff and marked `FAILED` after exhausting retries.
3. **Given** the export succeeds, **When** querying the admin audit log UI, **Then** the record shows `exported: true` with the export timestamp.

---

### User Story 2 — Merchant configures Splunk HEC as SIEM target (Priority: P2)

Instead of Datadog, the merchant uses Splunk. They configure a Splunk HEC URL and token. Events flow to their Splunk index with the same guarantees.

**Why this priority**: Splunk is common in regulated industries (finance, healthcare, retail enterprise).

**Independent Test**: Configure Splunk HEC endpoint → create AuditLog entry → verify Splunk-formatted JSON payload is sent to mock HEC endpoint.

**Acceptance Scenarios**:

1. **Given** a Splunk HEC URL and token configured, **When** an audit event is created, **Then** a Splunk HEC-compatible JSON payload (`{ time, host, source, sourcetype, event }`) is POSTed to the configured endpoint.
2. **Given** both Datadog and Splunk are configured for the same shop, **When** an event fires, **Then** it is exported to both endpoints independently.

---

### User Story 3 — Legal hold excludes specific data classes from export (Priority: P3)

The merchant's legal team places a hold on conversation data for an active litigation. Events in the `CONVERSATION` data class are excluded from SIEM export during the hold period, while other event classes continue to export normally.

**Why this priority**: Legal hold support is required for enterprise compliance (GDPR, eDiscovery).

**Independent Test**: Set `legalHold: true` on `CONVERSATION` data class → create AuditLog with type `conversation_message_deleted` → verify event is NOT exported to SIEM.

**Acceptance Scenarios**:

1. **Given** a legal hold on `CONVERSATION` data class, **When** a `conversation_*` audit event is created, **Then** it is stored in the DB but excluded from SIEM export with reason `legal_hold`.
2. **Given** the legal hold is lifted, **When** the export job runs next, **Then** previously held events that fall within retention window are exported.

---

### Edge Cases

- What happens when the SIEM API key is rotated? The system must continue with the new key without data loss.
- What happens when the export queue grows beyond 10,000 pending events? Must alert via structured log and apply backpressure.
- What happens when the SIEM rejects an event (4xx)? Non-retryable errors must be logged with the rejection reason and marked permanently failed.
- What happens if the shop uninstalls the app while events are queued? Queued exports must be cancelled and data deleted per retention policy.

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST support at least two SIEM adapters: Datadog Logs API and Splunk HEC.
- **FR-002**: SIEM endpoint configuration (URL, API key) MUST be stored encrypted in the `SIEMConfig` model, scoped to the shop.
- **FR-003**: An async export worker MUST poll for `AuditLog` records with `exported = false` every 30 seconds.
- **FR-004**: Failed exports MUST be retried up to 3 times with exponential backoff (1s, 4s, 16s).
- **FR-005**: Legal hold data class exclusions MUST be checked before each export.
- **FR-006**: Each SIEM adapter MUST be a separate class implementing a common `SIEMAdapter` interface with `export(events: AuditEvent[]): Promise<ExportResult>`.
- **FR-007**: The admin UI MUST show SIEM export status (configured/not-configured, last export timestamp, error count).
- **FR-008**: API keys MUST be stored encrypted at rest (AES-256 via environment-derived key) and NEVER logged.

### Key Entities

- **SIEMConfig** (new Prisma model): `id`, `shopId`, `provider` (DATADOG | SPLUNK), `endpointUrl`, `apiKeyEncrypted`, `enabled`, `lastExportAt`, `errorCount`
- **AuditLog** (existing): Add `exported: Boolean`, `exportedAt: DateTime?`, `exportError: String?` fields
- **LegalHoldRule** (new Prisma model): `id`, `shopId`, `dataClass`, `activeUntil?`, `createdAt`

## Success Criteria

- **SC-001**: Datadog adapter exports a batch of 100 events in < 5 seconds on a standard network.
- **SC-002**: Failed exports retry exactly 3 times and are marked `FAILED` in DB.
- **SC-003**: Legal hold correctly blocks exports for the specified data class.
- **SC-004**: API keys are never present in any log line (verified by log grep in tests).
- **SC-005**: `npm test` passes — unit tests for both adapters and export worker.
- **SC-006**: Admin UI shows "Last exported: X minutes ago" correctly.

## Assumptions

- Merchants self-provision their Datadog/Splunk credentials; FluxBot doesn't manage their SIEM accounts.
- Batch export size is configurable (default 100 events per batch); max 500.
- Export is near-real-time (< 60s delay) but not strictly real-time — polling is acceptable for v1.
- Legal hold rules are set by the merchant admin via the compliance UI; no automatic hold triggers.
- This feature is gated behind a `SIEM_ENABLED` feature flag and only available on enterprise plan.

## Implementation Notes

- New files: `apps/shopify-admin-app/app/services/siem-service.server.ts` (adapters + worker)
- New Prisma models: `SIEMConfig`, `LegalHoldRule`
- New route: `app.compliance.siem.tsx` (admin UI)
- Export worker: extends the existing jobs pattern in `apps/shopify-admin-app/app/jobs/`
- Interface: `interface SIEMAdapter { name: string; export(events: AuditEvent[]): Promise<ExportResult> }`
- Datadog endpoint: `POST https://http-intake.logs.datadoghq.com/api/v2/logs`
- Splunk HEC endpoint: `POST <configured>/services/collector/event`
