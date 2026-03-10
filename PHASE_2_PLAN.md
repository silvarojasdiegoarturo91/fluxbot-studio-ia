# Fase 2: Ventas Proactivas y Optimización - Plan de Implementación

> Canonical status source: [STATUS_MATRIX.md](./STATUS_MATRIX.md). This document is historical context.

## Estado Actual (Fase 1 Completada)

### ✅ Infraestructura Base
- [x] Chat API endpoint (`/api/chat`)
- [x] AI Orchestration Service
- [x] Sync Service con webhooks
- [x] Embeddings Service
- [x] Shopify Client
- [x] Database schema completo (22 entidades)
- [x] Admin UI con Polaris
- [x] Theme Extension skeleton
- [x] Tests: 534 tests, 45.37% coverage

### ⏳ Pendientes de Fase 1
- [ ] PostgreSQL con pgvector instalado
- [ ] Webhook endpoints activos
- [ ] Widget storefront desplegado
- [ ] Sincronización inicial de catálogo

---

## Fase 2: Objetivos y Alcance

### 🎯 Objetivo Principal
Convertir el chatbot reactivo en un asistente de ventas proactivo que detecta intenciones de compra y actúa para maximizar conversión.

### 📊 KPIs de Éxito
- Incremento de 15-25% en conversión desde chat
- Reducción de 30% en abandono de carrito
- 10% de mensajes convertidos en ventas
- Tiempo de respuesta < 2 segundos
- Confidence score promedio > 0.75

---

## Prioridades de Implementación

### Priority 1: Behavioral Triggers (1 semana)
**Objetivo**: Detectar señales de intención de compra en tiempo real

#### 1.1 Event Tracking Service
- `app/services/event-tracking.server.ts`
- Capturar eventos de comportamiento:
  - Page views con dwell time
  - Product views
  - Add to cart / Remove from cart
  - Scroll depth
  - Exit intent
  - Form interactions

**Schema additions**:
```prisma
model BehaviorEvent {
  id          String   @id @default(cuid())
  shopId      String
  sessionId   String
  visitorId   String?
  customerId  String?
  eventType   String   // PAGE_VIEW, PRODUCT_VIEW, ADD_TO_CART, EXIT_INTENT, etc.
  eventData   Json
  timestamp   DateTime @default(now())
  
  shop        Shop     @relation(fields: [shopId], references: [id])
  
  @@index([shopId, sessionId])
  @@index([shopId, eventType, timestamp])
}

model IntentSignal {
  id              String   @id @default(cuid())
  shopId          String
  sessionId       String
  visitorId       String?
  signalType      String   // BROWSE_INTENT, PURCHASE_INTENT, ABANDONMENT_RISK, etc.
  confidence      Float
  triggerData     Json
  actionTaken     String?  // PROACTIVE_MESSAGE, RECOMMENDATION, DISCOUNT_OFFER, etc.
  outcome         String?  // CONVERTED, DISMISSED, IGNORED, etc.
  createdAt       DateTime @default(now())
  
  shop            Shop     @relation(fields: [shopId], references: [id])
  
  @@index([shopId, sessionId])
  @@index([shopId, signalType, createdAt])
}
```

**API endpoints**:
- `POST /api/events/track` - Track behavior events
- `GET /api/events/signals/:sessionId` - Get intent signals for session

#### 1.2 Intent Detection Engine
- `app/services/intent-detection.server.ts`
- Analizar patrones de comportamiento
- Scoring de intención de compra
- Detección de abandono
- Reglas de negocio + ML simple

**Heuristics**:
```typescript
interface IntentScore {
  purchaseIntent: number;      // 0-1 score
  abandonmentRisk: number;     // 0-1 score
  needsHelp: number;           // 0-1 score
  priceShopperRisk: number;    // 0-1 score
}

function calculateIntentScore(events: BehaviorEvent[]): IntentScore {
  // Dwell time > 30s on product = +0.3 purchase intent
  // Multiple product views = +0.2 purchase intent
  // Add to cart = +0.5 purchase intent
  // Exit intent = +0.7 abandonment risk
  // No activity for 60s = +0.4 abandonment risk
  // Multiple cart adds/removes = +0.6 price shopper risk
}
```

#### 1.3 Trigger Evaluation Service
- `app/services/trigger-evaluation.server.ts`
- Evaluar si disparar mensaje proactivo
- Frequency capping (max 1 mensaje / 5 minutos)
- Contexto de conversación existente
- A/B testing de triggers

**Configuration**:
```prisma
model ProactiveTrigger {
  id              String   @id @default(cuid())
  shopId          String
  name            String
  enabled         Boolean  @default(true)
  triggerType     String   // EXIT_INTENT, DWELL_TIME, CART_ABANDONMENT, etc.
  conditions      Json     // { dwellTimeSeconds: 30, productViewCount: 3 }
  messageTemplate String
  priority        Int      @default(0)
  cooldownMs      Int      @default(300000) // 5 minutes
  
  shop            Shop     @relation(fields: [shopId], references: [id])
  
  @@index([shopId, enabled])
}
```

### Priority 2: Proactive Messaging (3 días)
**Objetivo**: Enviar mensajes contextuales en el momento adecuado

#### 2.1 Message Orchestration
- Integrar con chat widget
- WebSocket para push notifications
- Fallback a polling
- Message templating con variables

**API**:
- `POST /api/chat/proactive` - Send proactive message
- `GET /api/chat/active-sessions` - Get active visitor sessions

#### 2.2 Message Templates
```typescript
interface ProactiveMessage {
  trigger: 'EXIT_INTENT' | 'DWELL_TIME' | 'CART_ABANDONMENT' | 'PRICE_DROP';
  template: string;
  variables: Record<string, any>;
  personalizedRecommendations?: string[];
}

// Examples:
const templates = {
  EXIT_INTENT: "¿Necesitas ayuda para decidir? 😊 Puedo responder tus preguntas sobre {{productName}}",
  DWELL_TIME: "Veo que te interesa {{productName}}. ¿Quieres que te cuente más sobre {{feature}}?",
  CART_ABANDONMENT: "¡No te vayas sin completar tu compra! Tenemos {{productCount}} productos esperándote 🛒",
  PRICE_DROP: "¡Buenas noticias! {{productName}} ahora está {{discount}}% más barato 🎉"
};
```

### Priority 3: Add-to-Cart Integration (2 días)
**Objetivo**: Permitir añadir productos al carrito desde el chat

#### 3.1 Cart Actions Service
- `app/services/cart-actions.server.ts`
- Integrar con Shopify Cart API
- Generar cart permalinks
- Checkout deep links

**Tools para AI**:
```typescript
async function addProductToCart(params: {
  productId: string;
  variantId: string;
  quantity: number;
  customerId?: string;
}): Promise<{
  cartUrl: string;
  checkoutUrl: string;
  success: boolean;
}>;
```

#### 3.2 Product Selection Flow
- Clarification cuando hay múltiples variantes
- Upsell/cross-sell suggestions
- Bundle offers

### Priority 4: Human Handoff (3 días)
**Objetivo**: Escalar a agente humano cuando sea necesario

#### 4.1 Handoff Logic
- Confidence threshold < 0.5
- Explicit user request ("hablar con persona")
- Frustration detection (mensajes repetidos)
- Complex queries (refunds, complaints)

**Schema**:
```prisma
model HandoffRequest {
  id              String   @id @default(cuid())
  shopId          String
  conversationId  String
  reason          String   // LOW_CONFIDENCE, USER_REQUEST, FRUSTRATION, COMPLEX_QUERY
  createdAt       DateTime @default(now())
  assignedTo      String?
  resolvedAt      DateTime?
  status          String   // PENDING, ASSIGNED, RESOLVED, CANCELLED
  
  shop            Shop         @relation(fields: [shopId], references: [id])
  conversation    Conversation @relation(fields: [conversationId], references: [id])
  
  @@index([shopId, status])
}
```

#### 4.2 Integration Preparedness
- Zendesk API ready
- Gorgias API ready
- Shopify Inbox fallback
- Generic webhook for custom systems

### Priority 5: Advanced Reranking (2 días)
**Objetivo**: Mejorar relevancia de búsqueda con reglas de negocio

#### 5.1 Reranking Service
- `app/services/reranking.server.ts`
- Combine semantic score con:
  - Product popularity (sales velocity)
  - Profit margin
  - Stock availability
  - Seasonality
  - User preferences

```typescript
interface RerankingFactors {
  semanticScore: number;      // 0-1 from embeddings
  popularityScore: number;    // 0-1 from sales data
  marginScore: number;        // 0-1 from profit margin
  availabilityScore: number;  // 0-1 from stock level
  personalizedScore: number;  // 0-1 from user history
}

function rerankResults(
  results: SearchResult[],
  factors: RerankingFactors,
  weights: Record<keyof RerankingFactors, number>
): SearchResult[];
```

### Priority 6: Revenue Attribution & Analytics (2 días)
**Objetivo**: Medir impacto real en ventas

#### 6.1 Conversion Tracking
```prisma
model ConversionEvent {
  id              String   @id @default(cuid())
  shopId          String
  conversationId  String
  orderId         String?
  productId       String?
  revenue         Float?
  attributionType String   // DIRECT_RECOMMENDATION, ASSISTED, PROACTIVE_TRIGGER
  createdAt       DateTime @default(now())
  
  shop            Shop         @relation(fields: [shopId], references: [id])
  conversation    Conversation @relation(fields: [conversationId], references: [id])
  
  @@index([shopId, createdAt])
}
```

#### 6.2 Analytics Dashboard Queries
- Conversion rate by intent type
- Revenue influenced by chat
- Most effective triggers
- Handoff rate and resolution time
- Average confidence by topic

---

## Timeline Estimado

### Semana 1: Behavioral Triggers
- Días 1-2: Event tracking service + schema migrations
- Días 3-4: Intent detection engine
- Día 5: Trigger evaluation service

### Semana 2: Messaging & Cart Integration  
- Días 1-2: Proactive messaging orchestration
- Días 3-4: Add-to-cart integration
- Día 5: Testing e2e

### Semana 3: Handoff & Optimization
- Días 1-2: Human handoff logic
- Días 3-4: Advanced reranking
- Día 5: Revenue attribution & analytics

---

## Testing Strategy

### Unit Tests (Coverage target: +10%)
- Intent detection algorithms
- Reranking logic
- Trigger evaluation rules

### Integration Tests
- Event tracking → Intent detection → Proactive message flow
- Add-to-cart → Checkout redirect
- Handoff request creation

### E2E Tests (Playwright)
- User browses product → Receives proactive message → Adds to cart
- User shows exit intent → Receives retention offer
- Low confidence query → Escalates to human

---

## Deployment Plan

### Phase 2.1: Event Tracking (Week 1)
```bash
# 1. Run migrations
npx prisma migrate dev --name add_behavioral_tracking

# 2. Deploy services
npm run deploy:services

# 3. Enable tracking in widget
# (update storefront widget to send events)
```

### Phase 2.2: Proactive Triggers (Week 2)
```bash
# 1. Configure triggers in admin UI
# 2. A/B test with 10% of traffic
# 3. Monitor performance metrics
```

### Phase 2.3: Full Rollout (Week 3)
```bash
# 1. Enable for all shops
# 2. Monitor conversion impact
# 3. Iterate based on data
```

---

## Success Criteria

### Technical
- [ ] Event tracking capturing 100% of user actions
- [ ] Intent detection latency < 100ms
- [ ] Proactive messages sent within 500ms of trigger
- [ ] Add-to-cart success rate > 95%
- [ ] Handoff creation < 1s

### Business
- [ ] 15% increase in chat-attributed revenue
- [ ] 25% reduction in cart abandonment
- [ ] 10% overall conversion rate from proactive triggers
- [ ] Handoff rate < 5% of total conversations
- [ ] User satisfaction score > 4.2/5

---

## Next Steps

1. **Revisar este plan** con el equipo
2. **Priorizar features** según impacto de negocio
3. **Crear tickets** en el backlog
4. **Estimar esfuerzo** detallado por componente
5. **Comenzar implementación** con Priority 1

**¿Empezamos con Event Tracking Service?** 🚀
