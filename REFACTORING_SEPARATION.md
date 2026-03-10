# Especificación de Refactorización: Separación Frontend/Backend

## Visión General

Separar el proyecto en dos repositorios independientes:

1. **fluxbot-studio-ia** (este repo) → Solo Shopify Frontend App
2. **fluxbot-studio-back-ia** → Backend de IA con API Keys, LLMs y lógica de IA

---

## Arquitectura Propuesta

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FLUXBOT-STUDIO-IA                              │
│                         (Shopify Frontend App)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│   │   Admin UI   │    │   Widget     │    │  Shopify     │                  │
│   │  (Polaris)   │    │  Storefront  │    │  Admin API   │                  │
│   └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                    FRONTEND SERVICES                                │   │
│   │  - sync-service.server.ts (sincronización Shopify)                │   │
│   │  - commerce-actions.server.ts (acciones de comercio)              │   │
│   │  - delivery.server.ts (entrega de mensajes)                        │   │
│   │  - consent-management.server.ts                                    │   │
│   │  - analytics.server.ts (analítica agregada)                       │   │
│   │  - handoff.server.ts (escalamiento a humano)                     │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                    DATABASE (PostgreSQL)                          │   │
│   │  - Shop, Session, User                                            │   │
│   │  - ChatbotConfig (SIN apiKeys)                                    │   │
│   │  - Conversation, Message, Events                                  │   │
│   │  - KnowledgeSource, KnowledgeDocument                             │   │
│   │  - ProductProjection, PolicyProjection, OrderProjection           │   │
│   │  - ConsentRecord, AuditLog, WebhookEvent, SyncJob                 │   │
│   │  - BehaviorEvent, IntentSignal, ProactiveTrigger                  │   │
│   │  - ConversionEvent, HandoffRequest                                │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTP/REST
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FLUXBOT-STUDIO-BACK-IA                             │
│                         (Backend IA - Nuevo Repo)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                       CORE AI SERVICES                              │   │
│   │  - ai-orchestration.server.ts (orquestación LLM)                  │   │
│   │  - intent-detection.server.ts (detección de intención)            │   │
│   │  - rag-builder.server.ts (construcción RAG)                       │   │
│   │  - vector-retrieval.server.ts (recuperación vectorial)           │   │
│   │  - embeddings.server.ts (generación de embeddings)               │   │
│   │  - trigger-evaluation.server.ts (evaluación de triggers)          │   │
│   │  - proactive-messaging.server.ts (mensajería proactiva)          │   │
│   │  - llms-txt.server.ts (generación llms.txt)                      │   │
│   │  - event-tracking.server.ts                                       │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                    API KEYS & PROVIDERS                            │   │
│   │  - OpenAI API Key                                                 │   │
│   │  - Anthropic API Key                                              │   │
│   │  - Google Gemini API Key                                         │   │
│   │  - Vector Store (pinecone, weaviate, pgvector)                  │   │
│   │  - Moderation APIs                                                │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                    DATABASE (PostgreSQL)                          │   │
│   │  - AIProviderConfig (CON apiKeys)                                 │   │
│   │  - EmbeddingRecord                                                │   │
│   │  - KnowledgeChunk                                                │   │
│   │  - ToolInvocation                                                 │   │
│   │  - IntentSignal                                                  │   │
│   │  - ProactiveTrigger                                              │   │
│   │  - AIAnalytics (métricas de IA)                                  │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                         APIs EXPUESTAS                             │   │
│   │  POST /api/chat - Procesar mensaje de chat                        │   │
│   │  POST /api/intent - Detectar intención                           │   │
│   │  POST /api/rag/search - Búsqueda RAG                             │   │
│   │  POST /api/embeddings/generate - Generar embeddings              │   │
│   │  POST /api/triggers/evaluate - Evaluar triggers                  │   │
│   │  GET  /api/providers - Listar proveedores configurados           │   │
│   │  POST /api/providers - Configurar proveedor                      │   │
│   │  POST /api/llms-txt/generate - Generar llms.txt                  │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Modelos de Base de Datos

### Frontend (fluxbot-studio-ia)

**Se quedan:**
- Shop, Session, User
- ChatbotConfig (SIN apiKey - solo configuración pública)
- Conversation, ConversationMessage, ConversationEvent
- CustomerIdentity
- KnowledgeSource, KnowledgeDocument
- ProductProjection, PolicyProjection, OrderProjection
- ConsentRecord, AuditLog
- WebhookEvent, SyncJob
- BehaviorEvent, IntentSignal, ProactiveTrigger, ProactiveMessage
- ConversionEvent, HandoffRequest
- OmnichannelCallbackReceipt, DeadLetterCallback

**Se eliminan:**
- AIProviderConfig (se mueve al back)
- EmbeddingRecord (se mueve al back)
- KnowledgeChunk (se mueve al back)

### Backend (fluxbot-studio-back-ia)

**Modelos propios:**
- AIProviderConfig (CON apiKeys cifradas)
- EmbeddingRecord
- KnowledgeChunk
- IntentSignal (recibido del front)
- ProactiveTrigger (configuración)
- AIAnalytics (métricas de uso de IA)

---

## Comunicación Frontend ↔ Backend

### Patrón de Comunicación

```typescript
// FRONTEND: Llamada al backend de IA
const response = await fetch('https://api.fluxbot-back.ia/v1/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shop-Domain': shop.domain,
    'Authorization': `Bearer ${shop.apiKey}` // API key del merchant
  },
  body: JSON.stringify({
    message: userMessage,
    conversationId: conversation.id,
    context: {
      shopId: shop.id,
      locale: conversation.locale,
      channel: conversation.channel
    }
  })
});
```

### Endpoints del Backend

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/chat` | POST | Procesar mensaje y obtener respuesta |
| `/api/intent` | POST | Detectar intención del mensaje |
| `/api/rag/search` | POST | Buscar en knowledge base |
| `/api/embeddings/generate` | POST | Generar embeddings |
| `/api/triggers/evaluate` | POST | Evaluar triggers proactivos |
| `/api/providers` | GET/POST | Gestionar proveedores IA |
| `/api/llms-txt/generate` | POST | Generar llms.txt |
| `/api/analytics` | POST | Enviar métricas |

---

## Variables de Entorno

### Frontend (.env)

```env
# Shopify
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SHOPIFY_APP_URL=...

# Base de datos (solo datos del front)
DATABASE_URL=postgresql://...

# Backend de IA
IA_BACKEND_URL=https://api.fluxbot-back.ia
IA_BACKEND_API_KEY=... # API key interna para autenticar frente al back
```

### Backend (.env)

```env
# Base de datos (datos de IA)
DATABASE_URL=postgresql://...

# Proveedores IA (API Keys)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...

# Vector Store (opcional)
PINECONE_API_KEY=...
WEAVIATE_URL=...

# Frontend (webhooks, callbacks)
FRONTEND_WEBHOOK_URL=https://admin.fluxbot.ia/webhooks/ia
```

---

## Pasos de Refactorización

### Fase 1: Crear nuevo proyecto

```bash
# Crear estructura del proyecto backend
cd ~/Documents
mkdir -p fluxbot-studio-back-ia
cd fluxbot-studio-back-ia
npm init -y
npm install express prisma @prisma/client openai anthropic google-auth-library
```

### Fase 2: Migrar servicios de IA

Mover de `apps/shopify-admin-app/app/services/`:
- ai-orchestration.server.ts
- intent-detection.server.ts
- embeddings.server.ts
- rag-builder.server.ts
- vector-retrieval.server.ts
- trigger-evaluation.server.ts
- proactive-messaging.server.ts
- llms-txt.server.ts
- event-tracking.server.ts (o parte)

### Fase 3: Crear API REST

Crear endpoints Express que expongan la funcionalidad de los servicios.

### Fase 4: Separar bases de datos

1. Crear nueva base de datos PostgreSQL para el backend
2. Crear nuevo schema Prisma para el backend
3. Modificar schema del frontend para eliminar modelos movidos

### Fase 5: Actualizar Frontend

1. Reemplazar llamadas a servicios IA con HTTP calls al backend
2. Eliminar dependencias de OpenAI/Anthropic/Gemini
3. Mantener sync-service, commerce-actions, delivery, etc.

### Fase 6: Actualizar AGENTS.md

Agregar instrucciones específicas para cada proyecto.

---

## Consideraciones de Seguridad

### Frontend
- No expone API keys de IA
- Autenticación via Shopify OAuth
- Rate limiting en llamadas al backend

### Backend
- API Keys cifradas en BD (AES-256)
- Autenticación por API Key por shop
- Rate limiting por shop
- Logs de auditoría
- Validación de entrada estricta

---

## Recomendaciones de Implementación

1. **Incremental**: No migrar todo de una vez
2. **Contract-first**: Definir contratos de API primero
3. **Mocking**: Mantener servicios mockeados para desarrollo local
4. **Testing**: Tests de integración entre front y back
5. **Documentación**: OpenAPI/Swagger para la API del backend

---

## Archivos a Modificar/Crear

### En fluxbot-studio-ia (Frontend)

- [ ] Actualizar `infra/prisma/schema.prisma` - eliminar AIProviderConfig, EmbeddingRecord, KnowledgeChunk
- [ ] Crear cliente HTTP para llamar al backend
- [ ] Actualizar servicios que usan IA para llamar al backend
- [ ] Actualizar routes de API
- [ ] Actualizar `.env.example` y `.env`
- [ ] Actualizar AGENTS.md

### En fluxbot-studio-back-ia (Backend - Nuevo)

- [ ] Crear estructura de proyecto
- [ ] Crear schema Prisma
- [ ] Migrar servicios de IA
- [ ] Crear API REST/GraphQL
- [ ] Implementar autenticación por shop
- [ ] Configurar logging y métricas
- [ ] Crear Dockerfile
- [ ] Crear AGENTS.md específico
