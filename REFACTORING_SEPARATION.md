# Especificaciones de Refactorizacion del Separation Plan

## 1. Objetivo

Definir una especificacion tecnica unica para completar la separacion entre:

- `fluxbot-studio-ia` (frontend Shopify + dominio Shopify/compliance)
- `fluxbot-studio-back-ia` (backend IA + orquestacion LLM + RAG + embeddings)

Esta version sustituye la especificacion previa ambigua y alinea el plan con el estado real del codigo (2026-03-10).

---

## 2. Estado Actual Verificado

### 2.1 Hallazgos en `fluxbot-studio-ia`

1. Existe cliente remoto: `apps/shopify-admin-app/app/services/ia-backend.client.ts`.
2. Las rutas principales siguen usando servicios IA locales:
- `apps/shopify-admin-app/app/routes/api.chat.ts`
- `apps/shopify-admin-app/app/routes/api.intent.analyze.ts`
- `apps/shopify-admin-app/app/routes/api.triggers.evaluate.ts`
- `apps/shopify-admin-app/app/routes/api.llms-txt.ts`
3. El schema Prisma ya movio parte de IA fuera del frontend (`AIProviderConfig`, `EmbeddingRecord`, `KnowledgeChunk` no estan en `infra/prisma/schema.prisma`), pero quedan modelos ligados a logica IA en frontend (`IntentSignal`, `ProactiveTrigger`, `ToolInvocation`).
4. La configuracion del frontend sigue exigiendo claves de proveedor IA (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) via `apps/shopify-admin-app/app/config.server.ts`.
5. `.env.example` ya incluye `IA_BACKEND_URL` y `IA_BACKEND_API_KEY`, lo que confirma una arquitectura objetivo remota no finalizada.

### 2.2 Conclusión

El sistema esta en modo hibrido: contrato remoto definido, consumo real aun local.

---

## 3. Alcance del Refactor

### 3.1 Incluido

- Separacion completa de ejecucion IA al backend externo.
- Clarificacion de ownership por dominio y base de datos.
- Migracion incremental sin corte total (strangler pattern).
- Contratos HTTP versionados entre frontend y backend.
- Endurecimiento de seguridad y observabilidad cross-repo.

### 3.2 No Incluido

- Reescritura total del frontend Shopify.
- Cambio de framework (Remix/React Router/Polaris se mantiene).
- Big-bang migration en una sola release.

---

## 4. Principios de Diseño

1. `Shopify-first`: todo lo que depende de OAuth, session y Admin API queda en frontend.
2. `Provider-agnostic`: todo acceso a OpenAI/Anthropic/Gemini vive en backend.
3. `Contract-first`: ningun modulo migra sin contrato de entrada/salida.
4. `Multi-tenant`: toda llamada entre repos incluye contexto de tienda.
5. `Observability by default`: correlacion obligatoria por request/conversation/shop.
6. `Safe migration`: feature flags + rollback por ruta.

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
- Canal de entrega/handoff/omnichannel bridge
- Gateway HTTP hacia backend IA

### 5.2 Backend IA (`fluxbot-studio-back-ia`)

Responsable de:

- Orquestacion de chat y herramientas IA
- Deteccion de intencion y evaluacion de triggers
- Retrieval semantico + RAG + reranking
- Embeddings y vector store
- Seleccion de proveedor/modelo y guardrails
- Generacion `llms.txt`
- Metricas de IA (latencia, coste, tokens, calidad)
- Gestion segura de API keys de proveedores

### 5.3 Integracion entre repos

- Protocolo: HTTP JSON (v1)
- Seguridad: `Authorization: Bearer`, `X-Shop-Domain`, `X-Correlation-Id`
- Timeouts: obligatorios por endpoint
- Retries: solo en operaciones idempotentes

---

## 6. Matriz de Ownership por Modulo

| Modulo | Owner final | Estado actual | Accion |
|---|---|---|---|
| `sync-service.server.ts` | Frontend | Frontend | Mantener |
| `commerce-actions.server.ts` | Frontend | Frontend | Mantener |
| `delivery.server.ts` | Frontend | Frontend | Mantener |
| `consent-management.server.ts` | Frontend | Frontend | Mantener |
| `analytics.server.ts` (negocio) | Frontend | Frontend | Mantener + consumir IA analytics remoto |
| `handoff.server.ts` | Frontend | Frontend | Mantener |
| `omnichannel-bridge.server.ts` | Frontend | Frontend | Mantener |
| `ai-orchestration.server.ts` | Backend IA | Frontend | Migrar |
| `embeddings.server.ts` | Backend IA | Frontend | Migrar |
| `rag-builder.server.ts` | Backend IA | Frontend | Migrar |
| `vector-retrieval.server.ts` | Backend IA | Frontend | Migrar |
| `intent-detection.server.ts` | Backend IA | Frontend | Migrar |
| `trigger-evaluation.server.ts` | Backend IA | Frontend | Migrar |
| `proactive-messaging.server.ts` (decisioning IA) | Backend IA | Frontend | Partir: decisioning back, dispatch front |
| `llms-txt.server.ts` | Backend IA | Frontend | Migrar |
| `event-tracking.server.ts` | Compartido | Frontend | Front captura, Back analiza |
| `ia-backend.client.ts` | Frontend | Frontend | Convertir en gateway oficial |

---

## 7. Ownership de Datos

### 7.1 Base `fluxbot_dev` (frontend)

Debe contener solo datos Shopify, operacionales y compliance:

- `Shop`, `Session`, `User`, `ShopInstallation`
- `ChatbotConfig` (sin secrets)
- `Conversation`, `ConversationMessage`, `ConversationEvent`
- `CustomerIdentity`, `HandoffRequest`
- `KnowledgeSource`, `KnowledgeDocument`
- `ProductProjection`, `PolicyProjection`, `OrderProjection`
- `ConsentRecord`, `AuditLog`, `WebhookEvent`, `SyncJob`
- `BehaviorEvent`, `ConversionEvent`
- `OmnichannelCallbackReceipt`, `DeadLetterCallback`

### 7.2 Base `fluxbot_ia` (backend)

Debe contener solo datos de ejecucion IA:

- `AIProviderConfig` (apiKeys cifradas)
- `KnowledgeChunk`, `EmbeddingRecord`
- `IntentSignal`, `ProactiveTrigger`
- `ToolInvocation` de bajo nivel
- `AIAnalytics` (tokens, coste, latencia, score)

### 7.3 Decision clave sobre `ToolInvocation`

Para evitar join cross-db entre `ConversationMessage` (frontend) y `ToolInvocation` (backend), se define:

- Backend guarda detalle tecnico completo (`tool_input`, `tool_output`, `duration`, `provider`).
- Frontend guarda solo resumen auditable por mensaje (`toolName`, `success`, `durationMs`, `correlationId`).

---

## 8. Contratos API (Contract-First)

### 8.1 Reglas generales

- Prefijo: `/api/v1`
- JSON estricto con `requestId`, `shopDomain`, `conversationId` cuando aplique
- Error envelope unico: `{ error: { code, message, details? } }`
- Timeout por llamada desde frontend: 3s-8s segun endpoint

### 8.2 Endpoints minimos

1. `POST /api/v1/chat`
- Input: `message`, `conversationId?`, `context`
- Output: `message`, `confidence`, `toolsUsed`, `actions`, `sourceReferences`

2. `POST /api/v1/chat/stream`
- Igual que chat, respuesta en stream

3. `POST /api/v1/intent/analyze`
- Input: `sessionId`, `visitorId?`, `signals?`
- Output: `dominantIntent`, `confidence`, `recommendations`

4. `POST /api/v1/triggers/evaluate`
- Input: `sessionId`, `visitorId?`, `context`
- Output: `evaluations[]`, `recommendation`

5. `POST /api/v1/rag/search`
- Input: `query`, `filters`, `locale`
- Output: `results[]` con score y metadata

6. `POST /api/v1/embeddings/generate`
- Input: `text` o `texts[]`
- Output: `embedding` o `embeddings`

7. `POST /api/v1/analytics/ingest`
- Input: eventos IA
- Output: confirmacion + `ingestedCount`

8. `POST /api/v1/llms-txt/generate`
- Input: `shopId`
- Output: contenido y metadatos de version/freshness

### 8.3 Headers obligatorios

- `Authorization: Bearer <IA_BACKEND_API_KEY>`
- `X-Shop-Domain: <shop>.myshopify.com`
- `X-Correlation-Id: <uuid>`
- `Content-Type: application/json`

---

## 9. Estrategia de Migracion (Oleadas)

### Oleada 0: Baseline de seguridad y contrato

1. Versionar contratos en ambos repos (`/api/v1`).
2. Estandarizar error model y correlation id.
3. Agregar feature flags:
- `IA_EXECUTION_MODE=local|remote|hybrid`
- `IA_ROUTE_CHAT_REMOTE=true|false`
- `IA_ROUTE_INTENT_REMOTE=true|false`

### Oleada 1: Chat orchestration remota

1. `api.chat.ts` deja de importar `AIOrchestrationService` local.
2. `api.chat.ts` consume `ia-backend.client.ts`.
3. Persistencia de `Conversation` y `ConversationMessage` se mantiene en frontend.
4. Guardar telemetria minima de tool usage en frontend.

Criterio de salida:

- 100% de requests de chat pasan por backend IA con fallback controlado.

### Oleada 2: Intent + triggers

1. `api.intent.analyze.ts` y `api.triggers.evaluate.ts` pasan a backend.
2. `event-tracking` se mantiene en frontend para captura primaria.
3. Backend consume eventos via endpoint o replicacion asincrona.

Criterio de salida:

- Sin import directo a `intent-detection.server.ts` o `trigger-evaluation.server.ts` desde rutas frontend.

### Oleada 3: RAG, embeddings y llms.txt

1. Mover `embeddings.server.ts`, `rag-builder.server.ts`, `vector-retrieval.server.ts`, `llms-txt.server.ts`.
2. Frontend mantiene solo orquestacion de sync y publicacion operacional.

Criterio de salida:

- Frontend sin dependencias de proveedor LLM en runtime.

### Oleada 4: Limpieza final

1. Eliminar claves `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` del runtime frontend.
2. Actualizar `config.server.ts` para modo remoto obligatorio.
3. Eliminar codigo IA legacy del repo frontend.

Criterio de salida:

- `apps/shopify-admin-app/app/services` sin servicios de ejecucion IA.

---

## 10. Cambios Especificos en Frontend

1. Crear interfaz `IAGateway` con implementaciones:
- `LocalIAGateway` (transitorio)
- `RemoteIAGateway` (`ia-backend.client.ts`)

2. Migrar rutas por adapter, no por `if` dispersos:
- `api.chat.ts`
- `api.intent.analyze.ts`
- `api.triggers.evaluate.ts`
- `api.llms-txt.ts`

3. Desacoplar `config.server.ts` de provider keys cuando `IA_EXECUTION_MODE=remote`.

4. Mantener compatibilidad temporal con `hybrid` hasta cierre de oleada 4.

---

## 11. Seguridad y Cumplimiento

1. Secrets de proveedores IA solo en backend.
2. Frontend nunca debe enviar PII no necesaria al backend.
3. Logs sin prompts completos en nivel `info`.
4. Trazabilidad minima por accion:
- `shopId`
- `conversationId`
- `requestId`
- `toolName`
- `outcome`
- `latencyMs`
5. HMAC opcional para hardening entre repos en V2.

---

## 12. Testing y Validacion

### 12.1 Regresion obligatoria

Tras cambios en codigo de produccion del frontend:

- Ejecutar `npm test` en `apps/shopify-admin-app`.
- Fase 0 debe permanecer verde (`68/68` minimo esperado por contrato actual).

### 12.2 Nuevas pruebas requeridas

1. Contract tests frontend-backend para `/api/v1/chat`, `/intent/analyze`, `/triggers/evaluate`.
2. Tests de fallback (`remote -> local`) solo mientras exista modo `hybrid`.
3. Tests de errores de autenticacion (`401`, `403`) y timeout (`504`).
4. Tests de idempotencia para eventos batch.

---

## 13. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| Drift de contratos entre repos | Alto | Versionado `/api/v1` + contract tests en CI |
| Latencia adicional por llamada remota | Medio | Timeouts + retries idempotentes + cache de contexto |
| Doble escritura de telemetria | Medio | Definir ownership por tabla/evento |
| Rollback incompleto | Alto | Feature flags por ruta + modo `hybrid` |
| Exposicion de secrets en frontend | Critico | Eliminar provider keys del runtime frontend |

---

## 14. Criterios de Aceptacion Global

1. Ninguna ruta frontend invoca servicios de ejecucion IA local.
2. `ia-backend.client.ts` (o `IAGateway`) es unico punto de acceso IA en frontend.
3. Frontend no requiere `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`.
4. Conversaciones, compliance y auditoria siguen funcionando en frontend.
5. Contratos `/api/v1` cubiertos por pruebas de contrato.
6. `npm test` en `apps/shopify-admin-app` pasa tras cada cambio de produccion.

---

## 15. Checklist de Ejecucion

### Frontend (`fluxbot-studio-ia`)

- [ ] Introducir `IAGateway` y feature flags de migracion
- [ ] Migrar `api.chat.ts` a gateway remoto
- [ ] Migrar `api.intent.analyze.ts` y `api.triggers.evaluate.ts`
- [ ] Migrar `api.llms-txt.ts`
- [ ] Limpiar `config.server.ts` para modo remoto
- [ ] Eliminar servicios IA legacy al cierre
- [ ] Ejecutar suite de pruebas despues de cada cambio productivo

### Backend (`fluxbot-studio-back-ia`)

- [ ] Publicar contratos `/api/v1` estables
- [ ] Implementar autenticacion por `IA_BACKEND_API_KEY` + `X-Shop-Domain`
- [ ] Exponer trazabilidad por `X-Correlation-Id`
- [ ] Cifrar credenciales de proveedores
- [ ] Publicar metricas de latencia/coste/token
- [ ] Asegurar retries idempotentes para tareas pesadas

---

## 16. Gobernanza de Documentacion

- `SEPARATION_PLAN.md`: plan operativo por fases y tracking.
- `REFACTORING_SEPARATION.md` (este archivo): especificacion tecnica y criterios de implementacion.
- Si hay conflicto, prevalece este archivo para decisiones tecnicas de separacion.
