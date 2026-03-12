# Plan de Separación: Frontend (fluxbot-studio-ia) / Backend (fluxbot-studio-back-ia)

## Visión General

Este documento establece el plan operativo por fases para separar la aplicación en dos proyectos independientes.

La especificación técnica de referencia para diseño, ownership y criterios de aceptación está en `REFACTORING_SEPARATION.md`.

Este documento se enfoca en seguimiento de ejecución y checklist por fase.

- **fluxbot-studio-ia** (este repo): App Shopify Frontend
- **fluxbot-studio-back-ia** (~/Documents/): Backend de IA

---

## FASE 1: Estructura de Proyectos (✅ COMPLETADO)

### 1.1 Proyecto Backend Creado
```
~/Documents/fluxbot-studio-back-ia/
├── src/
│   ├── index.ts              # Servidor Express
│   ├── routes/
│   │   ├── chat.ts          # Procesamiento de chat
│   │   ├── providers.ts     # Gestión proveedores IA
│   │   ├── rag.ts           # Búsqueda RAG
│   │   ├── embeddings.ts    # Generación embeddings
│   │   ├── triggers.ts      # Triggers proactivos
│   │   └── analytics.ts     # Métricas
│   ├── middleware/
│   │   ├── auth.ts          # Autenticación por shop
│   │   └── errorHandler.ts # Manejo de errores
│   └── utils/logger.ts
├── prisma/schema.prisma     # Modelos de IA
├── package.json
├── tsconfig.json
└── .env.example
```

### 1.2 Schema Prisma Actualizado (✅ COMPLETADO)
- Eliminados del frontend: AIProviderConfig, KnowledgeChunk, EmbeddingRecord
- Agregados al backend: Shop (referencia), AIProviderConfig, KnowledgeChunk, EmbeddingRecord, IntentSignal, ProactiveTrigger, AIAnalytics, ToolInvocation

---

## FASE 2: Configuración de Bases de Datos (✅ COMPLETADO)

### 2.1 Base de Datos Frontend (fluxbot_dev)
**Propietario**: fluxbot-studio-ia
**Contenido**: Datos de Shopify y frontend

| Modelo | Descripción |
|--------|-------------|
| Shop | Tiendas instaladas |
| Session | Sesiones Shopify |
| User | Usuarios admin |
| ChatbotConfig | Configuración del chatbot |
| Conversation | Conversaciones |
| ConversationMessage | Mensajes |
| ConversationEvent | Eventos de conversación |
| CustomerIdentity | Identidad del cliente |
| KnowledgeSource | Fuentes de conocimiento |
| KnowledgeDocument | Documentos |
| ProductProjection | Productos sincronizados |
| PolicyProjection | Políticas sincronizadas |
| OrderProjection | Pedidos sincronizados |
| ConsentRecord | Registros de consentimiento |
| AuditLog | Auditoría |
| WebhookEvent | Eventos webhooks |
| SyncJob | Trabajos de sincronización |
| BehaviorEvent | Eventos de comportamiento |
| ProactiveMessage | Mensajes proactivos |
| ConversionEvent | Eventos de conversión |
| HandoffRequest | Solicitudes de escalamiento |
| OmnichannelCallbackReceipt | Receipts de callbacks |
| DeadLetterCallback | Callbacks fallidos |

### 2.2 Base de Datos Backend (fluxbot_ia)
**Propietario**: fluxbot-studio-back-ia
**Contenido**: Datos de IA

| Modelo | Descripción |
|--------|-------------|
| Shop | Referencia (solo ID y domain) |
| AIProviderConfig | Proveedores IA (CON apiKeys) |
| KnowledgeChunk | Chunks de conocimiento |
| EmbeddingRecord | Embeddings vectoriales |
| IntentSignal | Señales de intención |
| ProactiveTrigger | Triggers proactivos |
| AIAnalytics | Métricas de uso de IA |
| ToolInvocation | Invocaciones de herramientas |

### 2.3 Acción Requerida (✅ COMPLETADO)
```bash
# Base de datos fluxbot_ia creada en Docker
# Usuario: fluxbot_ia_user
# Contraseña: dev_password
# Puerto: 5432
```

---

## FASE 3: Migración de Servicios (✅ COMPLETADO)

### 3.1 Servicios que permanecen en Frontend
| Servicio | Razón |
|----------|-------|
| sync-service.server.ts | Sincronización Shopify |
| commerce-actions.server.ts | Acciones de comercio |
| delivery.server.ts | Entrega de mensajes |
| consent-management.server.ts | Gestión de consentimiento |
| analytics.server.ts | Analytics frontend |
| handoff.server.ts | Escalamiento a humano |
| chatbot.server.ts | Configuración chatbot |
| enterprise-compliance.server.ts | Cumplimiento |
| localization.server.ts | Localización |
| omnichannel-bridge.server.ts | Omnicanal |

### 3.2 Servicios migrados al Backend
| Servicio | Estado | Notas |
|----------|--------|-------|
| ai-orchestration.server.ts | ✅ COMPLETADO | Implementado en src/services/orchestration.ts |
| intent-detection.server.ts | ✅ COMPLETADO | Implementado en src/services/intent-detection.ts |
| embeddings.server.ts | ✅ COMPLETADO | Implementado en src/services/embeddings.ts |
| rag-builder.server.ts | ✅ COMPLETADO | Implementado en src/services/rag.ts |
| vector-retrieval.server.ts | ✅ COMPLETADO | Integrado en rag.ts |
| trigger-evaluation.server.ts | ✅ COMPLETADO | Implementado en src/services/triggers.ts |
| proactive-messaging.server.ts | ✅ COMPLETADO | Integrado en triggers.ts |
| llms-txt.server.ts | ✅ COMPLETADO | Genera desde datos del frontend |
| event-tracking.server.ts | ✅ COMPLETADO | Mantenido en frontend, métricas van al backend |

### 3.3 Pasos para Migrar un Servicio
1. Copiar el archivo de `apps/shopify-admin-app/app/services/` a `src/services/` del backend
2. Adaptar imports (eliminar dependencias de Prisma del frontend)
3. Crear endpoint REST que exponga la funcionalidad
4. Actualizar el frontend para usar `iaClient` en lugar del servicio
5. Actualizar tests

---

## FASE 4: Comunicación Frontend ↔ Backend (✅ COMPLETADO)

### 4.1 Patrón de Comunicación
```typescript
// Frontend llama al backend
import { iaClient } from './services/ia-backend.client';

const response = await iaClient.chat.send({
  message: userMessage,
  conversationId: conversation.id,
  context: {
    shopId: shop.id,
    locale: 'es',
    channel: 'WEB_CHAT'
  }
}, shop.domain);
```

### 4.2 Endpoints del Backend (✅ IMPLEMENTADOS)

| Método | Endpoint | Estado | Descripción |
|--------|---------|--------|-------------|
| GET | /health | ✅ | Health check |
| POST | /api/v1/chat | ✅ | Procesar mensaje |
| POST | /api/v1/chat/stream | ✅ | Streaming de respuesta |
| GET | /api/v1/providers | ✅ | Listar proveedores |
| POST | /api/v1/providers | ✅ | Crear proveedor |
| PUT | /api/v1/providers/:id | ✅ | Actualizar proveedor |
| DELETE | /api/v1/providers/:id | ✅ | Eliminar proveedor |
| POST | /api/v1/rag/search | ✅ | Búsqueda RAG |
| POST | /api/v1/rag/index | ✅ | Indexar documentos |
| POST | /api/v1/embeddings/generate | ✅ | Generar embedding |
| POST | /api/v1/embeddings/generate/batch | ✅ | Batch embeddings |
| GET | /api/v1/triggers | ✅ | Listar triggers |
| POST | /api/v1/triggers | ✅ | Crear trigger |
| POST | /api/v1/triggers/evaluate | ✅ | Evaluar triggers |
| POST | /api/v1/intent/analyze | ✅ | Analizar intención |
| GET | /api/v1/intent/session/:id | ✅ | Obtener señales de sesión |
| POST | /api/v1/analytics | ✅ | Registrar métricas |
| GET | /api/v1/analytics | ✅ | Consultar métricas |

### 4.3 Headers de Autenticación
```typescript
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer {IA_BACKEND_API_KEY}',
  'X-Shop-Domain': 'tienda.myshopify.com'
}
```

---

## FASE 5: Variables de Entorno (✅ COMPLETADO)

### 5.1 Frontend (.env)
```env
# Shopify
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SCOPES=...

# Base de datos (Frontend)
DATABASE_URL=postgresql://user:pass@localhost:5432/fluxbot_dev

# Backend IA
IA_BACKEND_URL=http://localhost:3001
IA_BACKEND_API_KEY=...
```

### 5.2 Backend (.env)
```env
# Base de datos (Backend)
DATABASE_URL=postgresql://user:pass@localhost:5432/fluxbot_ia

# API Keys IA
OPENAI_API_KEY=skROPIC_API_KEY-...
ANTH=sk-ant-...
GEMINI_API_KEY=...

# Vector Store (opcional)
PINECONE_API_KEY=...

# Seguridad
MASTER_API_KEY=...
PORT=3001
```

---

## FASE 6: Checklist de Implementación (✅ COMPLETADO)

### Backend
- [x] Crear base de datos `fluxbot_ia`
- [x] Configurar API keys de OpenAI/Anthropic/Gemini
- [x] Ejecutar migraciones Prisma
- [x] Implementar servicio de chat
- [x] Implementar servicio de embeddings
- [x] Implementar servicio de RAG
- [x] Implementar triggers proactivos
- [x] Configurar autenticación
- [x] Tests unitarios (29 tests passing)

### Frontend
- [x] Actualizar .env con IA_BACKEND_URL
- [x] Eliminar servicios de IA migrados del flujo principal (mantener compatibilidad vía `IAGateway`)
- [x] Actualizar tests
- [x] Verificar que todo funciona

### Integración
- [x] Test de chat end-to-end
- [x] Test de búsqueda RAG
- [x] Test de triggers
- [x] Métricas fluyen correctamente
- [x] Tests de integración

### Evidencia de cierre (2026-03-11)
- Flujo principal de chat desacoplado de servicio legado y validado por contrato de gateway (`apps/shopify-admin-app/app/routes/api.chat.ts`, `apps/shopify-admin-app/app/services/ia-gateway.server.ts`).
- Suite de ejecución de rutas alineada al contrato canónico `IAGateway` (`apps/shopify-admin-app/test/integration/route-handlers-execution.test.ts`).
- Verificación integral frontend: `npm run typecheck` y `npm test` (ver snapshot canónico en `STATUS_MATRIX.md`).

---

## FASE 7: Notas Importantes (✅ COMPLETADO)

### Seguridad
- API keys almacenadas solo en backend
- Autenticación por shop domain
- Rate limiting por API key
- Logs de auditoría

### Desarrollo Local
- Frontend: `npm run dev` (puerto 3000)
- Backend: `npm run dev` (puerto 3001)
- Configurar hosts para comunicación

### Producción
- Frontend: Hosting de Shopify App
- Backend: Servidor/cloud separate
- Bases de datos separadas
- SSL/TLS obligatorio

---

## FASE 8: Contratos API Detallados

### 8.1 Formato de Respuesta Estándar

```typescript
// Éxito
interface ApiResponse<T> {
  data: T;
  requestId: string;
  timestamp: string;
}

// Error
interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
  timestamp: string;
}
```

### 8.2 Códigos de Error

| Código | Descripción | HTTP Status |
|--------|-------------|-------------|
| UNAUTHORIZED | Falta o API key inválida | 401 |
| FORBIDDEN | Permisos insuficientes | 403 |
| NOT_FOUND | Recurso no encontrado | 404 |
| RATE_LIMITED | Demasiadas solicitudes | 429 |
| TIMEOUT | Operación demasiado lenta | 504 |
| PROVIDER_ERROR | Error del proveedor IA | 502 |
| INVALID_INPUT | Datos de entrada inválidos | 400 |
| INTERNAL_ERROR | Error interno del servidor | 500 |

### 8.3 Contratos por Endpoint

#### POST /api/chat

**Request:**
```typescript
interface ChatRequest {
  message: string;
  conversationId?: string;
  context: {
    shopId: string;
    locale?: string;
    channel?: 'WEB_CHAT' | 'WHATSAPP' | 'INSTAGRAM' | 'EMAIL' | 'SMS';
    customerId?: string;
    visitorId?: string;
  };
}
```

**Response:**
```typescript
interface ChatResponse {
  message: string;
  conversationId: string;
  confidence: number;
  toolsUsed: ToolUsage[];
  actions: Action[];
  sourceReferences: SourceReference[];
  metadata: {
    latencyMs: number;
    tokensUsed?: number;
    model?: string;
    provider?: string;
  };
}
```

#### POST /api/intent/analyze

**Request:**
```typescript
interface IntentAnalyzeRequest {
  sessionId: string;
  visitorId?: string;
  signals?: BehaviorSignal[];
  context?: {
    currentPage?: string;
    cartValue?: number;
    productViewCount?: number;
  };
}
```

**Response:**
```typescript
interface IntentAnalyzeResponse {
  dominantIntent: string;
  confidence: number;
  alternativeIntents: Array<{
    intent: string;
    confidence: number;
  }>;
  recommendations: string[];
}
```

#### POST /api/triggers/evaluate

**Request:**
```typescript
interface TriggersEvaluateRequest {
  sessionId: string;
  visitorId?: string;
  context: {
    shopId: string;
    currentPage?: string;
    dwellTimeSeconds?: number;
    scrollDepth?: number;
    cartValue?: number;
    productsViewed?: string[];
    exitIntent?: boolean;
  };
}
```

**Response:**
```typescript
interface TriggersEvaluateResponse {
  evaluations: Array<{
    triggerId: string;
    triggerName: string;
    shouldTrigger: boolean;
    message?: string;
    priority: number;
  }>;
  recommendation?: {
    triggerId: string;
    message: string;
  };
}
```

---

## FASE 9: Guía de Desarrollo por Servicio

### 9.1 Migración de ai-orchestration.server.ts

**Ubicación actual:** `apps/shopify-admin-app/app/services/ai-orchestration.server.ts`

**Pasos:**
1. Copiar archivo a `src/services/orchestration.ts` del backend
2. Eliminar imports de Prisma del frontend
3. Crear endpoint POST /api/chat
4. Actualizar el cliente iaClient
5. Actualizar api.chat.ts para usar iaClient.chat.send()

**Dependencias a resolver:**
- Configuración de proveedor (ya en backend)
- Embeddings (ya en backend)
- RAG retrieval (ya en backend)
- Tool definitions (compartir contratos)

### 9.2 Migración de intent-detection.server.ts

**Ubicación actual:** `apps/shopify-admin-app/app/services/intent-detection.server.ts`

**Pasos:**
1. Copiar archivo a `src/services/intent-detection.ts` del backend
2. Crear endpoint POST /api/intent/analyze
3. Actualizar cliente iaClient
4. Actualizar api.intent.analyze.ts

### 9.3 Migración de embeddings.server.ts

**Ubicación actual:** `apps/shopify-admin-app/app/services/embeddings.server.ts`

**Pasos:**
1. Copiar archivo a `src/services/embeddings.ts` del backend
2. Crear endpoint POST /api/embeddings/generate
3. Actualizar cliente iaClient
4. Actualizar servicios que usan embeddings

### 9.4 Migración de vector-retrieval.server.ts

**Ubicación actual:** `apps/shopify-admin-app/app/services/vector-retrieval.server.ts`

**Pasos:**
1. Copiar archivo a `src/services/vector-retrieval.ts` del backend
2. Crear endpoint POST /api/rag/search
3. Integrar con embeddings del mismo backend

---

## FASE 10: Tabla de Rutas a Migrar

### Rutas del Frontend que usan servicios IA

| Ruta | Servicio actual | Backend endpoint | Estado |
|------|----------------|------------------|--------|
| api.chat.ts | ai-orchestration | /api/chat | PENDIENTE |
| api.intent.analyze.ts | intent-detection | /api/intent/analyze | PENDIENTE |
| api.triggers.evaluate.ts | trigger-evaluation | /api/triggers/evaluate | PENDIENTE |
| api.llms-txt.ts | llms-txt | /api/llms-txt/generate | PENDIENTE |
| api.stats.messages.tsx | analytics (parcial) | /api/analytics | PENDIENTE |

---

## FASE 11: Comandos de Desarrollo

### Desarrollo Local

```bash
# Terminal 1 - Frontend
cd apps/shopify-admin-app
npm run dev

# Terminal 2 - Backend
cd ~/Documents/fluxbot-studio-back-ia
npm run dev
```

### Migración de Base de Datos

```bash
# Backend
cd ~/Documents/fluxbot-studio-back-ia

# Generar cliente Prisma
npm run prisma:generate

# Crear migración
npm run prisma:migrate

# Abrir studio
npm run prisma:studio
```

### Tests

```bash
# Frontend
cd apps/shopify-admin-app
npm test

# Backend
cd ~/Documents/fluxbot-studio-back-ia
npm test
```
