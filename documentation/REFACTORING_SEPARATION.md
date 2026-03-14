# Especificaciones de Refactorizacion del Separation Plan

## 1. Objetivo

Definir una especificacion tecnica unica para mantener y cerrar correctamente la separacion entre:

- `fluxbot-studio-ia` (frontend Shopify + dominio Shopify/compliance)
- `fluxbot-studio-back-ia` (backend IA + orquestacion LLM + RAG + embeddings)

Esta version reemplaza la version previa (2026-03-10) con una auditoria actualizada al estado real del codigo en 2026-03-14.

---

## 2. Resultado de Auditoria (2026-03-14)

### 2.1 Hallazgos verificados en `fluxbot-studio-ia`

1. Existe capa gateway remota y versionada:
- `apps/shopify-admin-app/app/services/ia-backend.server.ts`
- `apps/shopify-admin-app/app/services/ia-gateway.server.ts`
- `apps/shopify-admin-app/app/services/ia-backend.client.ts` (compat)

2. Las rutas principales ya consumen gateway remoto (remote-first):
- `apps/shopify-admin-app/app/routes/api.chat.ts`
- `apps/shopify-admin-app/app/routes/api.intent.analyze.ts`
- `apps/shopify-admin-app/app/routes/api.triggers.evaluate.ts`
- `apps/shopify-admin-app/app/routes/api.llms-txt.ts`

3. La separacion de datos esta aplicada:
- Frontend no contiene `AIProviderConfig`, `EmbeddingRecord`, `KnowledgeChunk` en `infra/prisma/schema.prisma`.
- Backend IA mantiene esos modelos y su runtime tecnico.

4. El frontend ya no requiere provider keys para modo remoto:
- `apps/shopify-admin-app/app/config.server.ts` exige `IA_BACKEND_URL` y `IA_BACKEND_API_KEY` en `IA_EXECUTION_MODE=remote`.
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` quedan solo para `IA_EXECUTION_MODE=local`.

5. Sincronizacion inicial de tenant resuelta:
- Frontend sincroniza `Shop` al backend IA automaticamente.
- Endpoint backend: `POST /api/v1/shops/sync`.
- Script de backfill: `npm run shops:sync:ia`.

6. Smoke release unificado implementado:
- Script: `npm run smoke:release`.
- Valida health + llms + intent + triggers + chat en una pasada.

### 2.2 Conclusiones de auditoria

- **Estado de separacion frontend-backend:** OK a nivel de arquitectura, ownership y wiring principal.
- **Estado de release comercial:** NO-GO por bloqueos operativos, no por deuda estructural de separacion.

Bloqueos operativos actuales:
1. `chat` falla en smoke por credencial de proveedor IA invalida (`OPENAI_API_KEY`).
2. `llms.txt` sigue vacio cuando no hay conocimiento indexado en backend IA.

---

## 3. Alcance del Refactor

### 3.1 Incluido

- Separacion completa de ejecucion IA al backend externo.
- Clarificacion de ownership por dominio y base de datos.
- Migracion incremental (strangler pattern) con compatibilidad controlada.
- Contratos HTTP versionados entre frontend y backend.
- Hardening de seguridad y observabilidad cross-repo.

### 3.2 No Incluido

- Reescritura total del frontend Shopify.
- Cambio de framework (Remix/React Router/Polaris se mantiene).
- Big-bang migration en una sola release.

---

## 4. Principios de Diseno

1. `Shopify-first`: OAuth, sessions y Admin API en frontend.
2. `Provider-agnostic`: proveedor LLM solo en backend IA.
3. `Contract-first`: ningun modulo cruza repos sin contrato.
4. `Multi-tenant`: toda llamada lleva contexto de tienda.
5. `Observability by default`: request/conversation/shop correlation.
6. `Safe migration`: feature flags y rollback por ruta.

---

## 5. Arquitectura Objetivo

### 5.1 Frontend (`fluxbot-studio-ia`)

Responsable de:

- Embedded Admin App (Polaris/App Bridge)
- OAuth y sesiones Shopify
- Integracion Admin GraphQL
- Webhooks Shopify y sync operacional
- Proyecciones de catalogo/politicas/pedidos
- Conversaciones y auditoria de negocio
- Consentimiento, compliance y data governance
- Delivery/handoff/omnichannel bridge
- Gateway HTTP hacia backend IA

### 5.2 Backend IA (`fluxbot-studio-back-ia`)

Responsable de:

- Orquestacion de chat y tools IA
- Intent detection y trigger decisioning
- Retrieval semantico + RAG + reranking
- Embeddings y vector search
- Seleccion proveedor/modelo y guardrails
- Generacion `llms.txt`
- IA analytics (latencia, coste, tokens, calidad)
- Gestion segura de API keys de proveedores

### 5.3 Integracion entre repos

- Protocolo: HTTP JSON (`/api/v1/*`)
- Seguridad minima: `Authorization: Bearer`, `X-Shop-Domain`
- Header recomendado: `X-Correlation-Id`
- Timeouts obligatorios por endpoint
- Retries solo en operaciones idempotentes

---

## 6. Matriz de Ownership por Modulo

| Modulo | Owner final | Estado actual | Accion |
|---|---|---|---|
| `sync-service.server.ts` | Frontend | Frontend | Mantener |
| `commerce-actions.server.ts` | Frontend | Frontend | Mantener |
| `delivery.server.ts` | Frontend | Frontend | Mantener |
| `consent-management.server.ts` | Frontend | Frontend | Mantener |
| `analytics.server.ts` (negocio) | Frontend | Frontend | Mantener |
| `handoff.server.ts` | Frontend | Frontend | Mantener |
| `omnichannel-bridge.server.ts` | Frontend | Frontend | Mantener |
| `ai-orchestration.server.ts` | Backend IA | Backend IA runtime | Migrado |
| `embeddings.server.ts` | Backend IA | Backend IA runtime | Migrado |
| `rag-builder.server.ts` | Backend IA | Backend IA runtime | Migrado |
| `vector-retrieval.server.ts` | Backend IA | Gateway remoto + fallback local compat | Migrado (compat activa) |
| `intent-detection.server.ts` | Backend IA | Backend IA runtime | Migrado |
| `trigger-evaluation.server.ts` | Backend IA | Backend IA runtime | Migrado |
| `proactive-messaging.server.ts` (decisioning IA) | Compartido | Decisioning back / dispatch front | Split aplicado |
| `llms-txt.server.ts` | Compartido | Generacion back / publicacion front | Split aplicado |
| `event-tracking.server.ts` | Compartido | Front captura / back analiza | Split aplicado |
| `ia-backend.client.ts` | Frontend | Gateway oficial en uso | Activo |

---

## 7. Ownership de Datos

### 7.1 Base `fluxbot_dev` (frontend)

Contiene datos Shopify, operacionales y compliance:

- `Shop`, `Session`, `User`, `ShopInstallation`
- `ChatbotConfig` (sin secrets de proveedores)
- `Conversation`, `ConversationMessage`, `ConversationEvent`
- `CustomerIdentity`, `HandoffRequest`
- `KnowledgeSource`, `KnowledgeDocument`
- `ProductProjection`, `PolicyProjection`, `OrderProjection`
- `ConsentRecord`, `AuditLog`, `WebhookEvent`, `SyncJob`
- `BehaviorEvent`, `ConversionEvent`
- `OmnichannelCallbackReceipt`, `DeadLetterCallback`

### 7.2 Base `fluxbot_ia` (backend)

Contiene datos de ejecucion IA:

- `Shop` (referencia de tenant)
- `AIProviderConfig` (apiKeys)
- `KnowledgeChunk`, `EmbeddingRecord`
- `IntentSignal`, `ProactiveTrigger`
- `ToolInvocation` tecnico
- `AIAnalytics`

### 7.3 Decision sobre `ToolInvocation`

- Backend guarda detalle tecnico (`input`, `output`, `duration`, `provider`).
- Frontend guarda resumen auditable por mensaje (`toolName`, `success`, `durationMs`, `correlationId`).

---

## 8. Contratos API (Contract-First)

### 8.1 Reglas generales

- Prefijo: `/api/v1`
- Response envelope: `{ data, requestId, timestamp }`
- Error envelope: `{ error: { code, message, details? }, requestId, timestamp }`
- Timeouts por llamada frontend: 3s-8s segun endpoint

### 8.2 Endpoints minimos (estado actual)

- `POST /api/v1/chat`
- `POST /api/v1/chat/stream`
- `POST /api/v1/intent/analyze`
- `GET /api/v1/intent/session/:id`
- `GET /api/v1/triggers`
- `POST /api/v1/triggers`
- `POST /api/v1/triggers/evaluate`
- `POST /api/v1/rag/search`
- `POST /api/v1/rag/index`
- `POST /api/v1/embeddings/generate`
- `POST /api/v1/embeddings/generate/batch`
- `POST /api/v1/embeddings/search`
- `POST /api/v1/analytics`
- `GET /api/v1/analytics`
- `POST /api/v1/llms-txt/generate`
- `POST /api/v1/shops/sync`

### 8.3 Headers obligatorios

- `Authorization: Bearer <IA_BACKEND_API_KEY>`
- `X-Shop-Domain: <shop>.myshopify.com`
- `Content-Type: application/json`

Header recomendado:
- `X-Correlation-Id: <uuid>`

---

## 9. Estrategia de Migracion (estado)

### Oleada 0: Baseline de seguridad y contrato

- **Estado:** DONE
- Contratos `/api/v1` y error envelope alineados.

### Oleada 1: Chat orchestration remota

- **Estado:** DONE
- `api.chat.ts` usa gateway remoto; persistencia de conversacion sigue en frontend.

### Oleada 2: Intent + triggers

- **Estado:** DONE
- `api.intent.analyze.ts` y `api.triggers.evaluate.ts` consumen backend IA.

### Oleada 3: RAG, embeddings y llms.txt

- **Estado:** DONE (integracion)
- RAG/embeddings/llms en backend IA con consumo frontend por contrato.

### Oleada 4: Limpieza final de compat legacy

- **Estado:** IN_PROGRESS
- Falta retirar completamente paths locales de compat donde ya no sean necesarios.

---

## 10. Cambios Especificos (estado)

Frontend:
1. `IAGateway` introducido y en uso.
2. Rutas IA principales migradas a adapter remoto.
3. Config remota aplicada; provider keys solo para modo local.
4. Sincronizacion de `Shop` frontend -> backend automatizada.

Backend IA:
1. Auth por API key + `X-Shop-Domain` activa.
2. Ruta `POST /api/v1/shops/sync` activa.
3. Persistencia IA ya no depende de fallback por FK cuando `Shop` esta sincronizada.

---

## 11. Seguridad y Cumplimiento

1. Secrets de proveedores IA solo en backend.
2. Frontend no debe enviar PII no necesaria.
3. Logs sin secretos en nivel `info`.
4. Trazabilidad minima por accion:
- `shopId`
- `conversationId`
- `requestId`
- `toolName`
- `outcome`
- `latencyMs`

Pendiente recomendado V2:
- Enforce estricto de `X-Correlation-Id` end-to-end.

---

## 12. Testing y Validacion

### 12.1 Regresion obligatoria

Tras cambios de codigo de produccion frontend:
- Ejecutar `npm test` en `apps/shopify-admin-app`.
- Phase 0 debe permanecer verde.

### 12.2 Estado verificado actual

- Frontend: `npm run typecheck` y `npm test` verdes (snapshot mas reciente en `STATUS_MATRIX.md`).
- Backend IA: `npm run build` y `npm test` verdes.
- Smoke release: health/intent/triggers OK; bloqueo real en chat por provider key invalida.

---

## 13. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| Drift de contratos entre repos | Alto | Versionado `/api/v1` + contract tests |
| Latencia extra por llamada remota | Medio | Timeouts + retries idempotentes + cache |
| Doble escritura de telemetria | Medio | Ownership claro por evento |
| Rollback incompleto | Alto | Feature flags + compat controlada |
| Exposicion de secrets en frontend | Critico | Mantener provider keys fuera de runtime remoto |

---

## 14. Criterios de Aceptacion Global

1. Rutas frontend IA principales usan gateway remoto. ✅
2. `IAGateway` es punto unico de acceso IA en frontend. ✅
3. Frontend no requiere provider keys en modo remoto. ✅
4. Conversaciones/compliance/auditoria siguen operativas en frontend. ✅
5. Contratos `/api/v1` cubiertos por pruebas de integracion/contrato. ✅
6. `npm test` frontend sigue verde tras cambios productivos. ✅
7. Smoke release completo (incluye chat sin fallback por error de proveedor). ❌ Pendiente operacional.

---

## 15. Checklist de Ejecucion (auditado)

### Frontend (`fluxbot-studio-ia`)

- [x] Introducir `IAGateway` y feature flags de migracion
- [x] Migrar `api.chat.ts` a gateway remoto
- [x] Migrar `api.intent.analyze.ts` y `api.triggers.evaluate.ts`
- [x] Migrar `api.llms-txt.ts`
- [x] Limpiar `config.server.ts` para modo remoto por defecto
- [ ] Eliminar completamente paths IA legacy de compat
- [x] Ejecutar suite de pruebas tras cambios productivos

### Backend (`fluxbot-studio-back-ia`)

- [x] Publicar contratos `/api/v1` estables
- [x] Implementar auth por `IA_BACKEND_API_KEY` + `X-Shop-Domain`
- [ ] Enforce estricto de `X-Correlation-Id`
- [ ] Cifrado robusto de credenciales de proveedor (hardening final)
- [x] Exponer metricas base de runtime IA
- [ ] Completar indexacion de conocimiento para `llms.txt` no vacio
- [ ] Configurar provider key valida para cerrar smoke de chat

---

## 16. Gobernanza de Documentacion

- `SEPARATION_PLAN.md`: plan operativo por fases y tracking.
- `documentation/REFACTORING_SEPARATION.md` (este archivo, ubicado en `documentation/`): especificacion tecnica y auditoria de separacion.
- `STATUS_MATRIX.md`: fuente canonica de estado de implementacion en este repo.

Si hay conflicto de estado, prevalece `STATUS_MATRIX.md`.
Si hay conflicto de criterios tecnicos de separacion, prevalece este archivo.
