# Fase 2: Progreso de Implementación

> Canonical status source: [STATUS_MATRIX.md](./STATUS_MATRIX.md). This document is historical context.

## ✅ Completado - Event Tracking System (P1.1 + P1.2)

### 1. Schema de Base de Datos
**Nuevas entidades añadidas a Prisma**:

✅ `BehaviorEvent` - Tracking de eventos de comportamiento
- Campos: shopId, sessionId, visitorId, customerId, eventType, eventData,timestamp
- Índices: por shopId+sessionId, shopId+eventType+timestamp, sessionId+timestamp
- Tipos de eventos soportados: PAGE_VIEW, PRODUCT_VIEW, ADD_TO_CART, REMOVE_FROM_CART, EXIT_INTENT, SCROLL_DEPTH, SEARCH, FORM_INTERACTION

✅ `IntentSignal` - Señales de intención detectadas
- Campos: shopId, sessionId, visitorId, signalType, confidence (0-1), triggerData, actionTaken, outcome
- Tipos de señales: BROWSE_INTENT, PURCHASE_INTENT, ABANDONMENT_RISK, NEEDS_HELP, PRICE_SHOPPER

✅ `ProactiveTrigger` - Configuración de triggers proactivos
- Campos: shopId, name, description, enabled, triggerType, conditions (JSON), messageTemplate, priority, cooldownMs, targetLocale
- Tipos de triggers: EXIT_INTENT, DWELL_TIME, CART_ABANDONMENT, PRICE_SENSITIVITY

✅ `HandoffRequest` - Escalaciones a humanos (actualizado)
- Se añadió: shopId, context (JSON)
- Estados: pending, assigned, completed, resolved, cancelled

✅ `ConversionEvent` - Tracking de conversiones
- Campos: shopId, conversationId, orderId, productId, revenue, attributionType, metadata
- Tipos de atribución: DIRECT_RECOMMENDATION, ASSISTED, PROACTIVE_TRIGGER, CART_RECOVERY

**Relaciones actualizadas**:
- Shop ahora tiene: behaviorEvents[], intentSignals[], proactiveTriggers[], handoffRequests[], conversionEvents[]
- Conversation ahora tiene: handoffRequests[], conversionEvents[]

### 2. Event Tracking Service
**Archivo**: `app/services/event-tracking.server.ts` (345 líneas)

**Funcionalidades implementadas**:

✅ `trackEvent()` - Registrar un evento único
- Validación de campos requeridos
- Creación en base de datos con timestamp

✅ `trackEventsBatch()` - Registrar múltiples eventos
- Optimización para cargas batch (hasta 100 eventos)
- Validación de todo el batch antes de inserción

✅ `getSessionEvents()` - Obtener eventos de una sesión
- Ordenados por timestamp descendente
- Límite configurable (default 50)

✅ `getSessionEventsByType()` - Filtrar por tipo de evento
- Útil para análisis específicos (ej: solo PRODUCT_VIEW)

✅ `getSessionTimeline()` - Timeline completo de sesión
- Eventos cronológicos con métricas:
  - Total de eventos
  - Primer/último evento
  - Duración de sesión en ms

✅ `getSessionStats()` - Estadísticas agregadas de sesión
- Conteos por tipo de evento
- Productos únicos vistos
- Add/remove from cart counts
- Exit intent count
- Max scroll depth
- Valor estimado del carrito

✅ `cleanupOldEvents()` - Limpieza de datos antiguos
- Retención configurable (default 90 días)
- Para job periódico de mantenimiento

✅ `getActiveSessions()` - Sesiones activas
- Threshold de inactividad configurable (default 5 min)
- Retorna sesiones con actividad reciente

✅ `detectSessionPatterns()` - Detección de patrones
- hasAbandonedCart: Añadió al carrito pero no completó
- isBrowsingHeavily: ≥3 productos vistos
- showedExitIntent: Mostró intención de salir
- isEngaged: Alto scroll depth + múltiples páginas
- likelyPriceShopping: Añade/quita productos repetidamente

### 3. API Endpoints
**Archivos creados**:

✅ `app/routes/api.events.track.ts`
- **POST /api/events/track**: Registrar evento único
  - Request: { shopDomain, sessionId, eventType, eventData, visitorId?, customerId? }
  - Response: { success, eventId, timestamp }
  - CORS enabled para storefront
  
- **GET /api/events/session/:sessionId**: Obtener eventos de sesión (interno)
  - Requiere header X-Shop-Domain
  - Retorna: events, stats, patterns

✅ `app/routes/api.events.track-batch.ts`
- **POST /api/events/track-batch**: Registrar múltiples eventos
  - Request: { shopDomain, events: [...] }
  - Max 100 eventos por batch
  - Response: { success, eventsTracked }
  - Optimizado para performance

**Seguridad**:
- Validación de shop domain
- CORS configurado para storefront
- Rate limiting preparado (por implementar)
- Límite de batch size (100 eventos)

### 4. Correcciones TypeScript
✅ Fixed HandoffRequest en ai-orchestration.server.ts
- Ahora obtiene shopId desde la conversación antes de crear handoff

✅ Fixed type assertions en event-tracking.server.ts
- eventData ahora usa type assertions `as any` para propiedades dinámicas
- Null checks añadidos para eventData

✅ TypeScript compila sin errores (0 errores)

---

## 📊 Métricas de Progreso

| Componente | Estado | Archivos | LOC |
|------------|--------|----------|-----|
| Schema Prisma | ✅ | 1 modificado | +130 líneas |
| Event Tracking Service | ✅ | 1 nuevo | 345 líneas |
| API Endpoints | ✅ | 2 nuevos | 180 líneas |
| Total | 11% | 4 archivos | ~655 líneas |

**Progreso de Fase 2**: 2/9 componentes completados (22%)

---

## 🔄 Siguiente Paso: Intent Detection Engine (P1.3)

### Objetivos
Analizar eventos de comportamiento y calcular scores de intención.

### Componentes a crear:
1. **`app/services/intent-detection.server.ts`**
   - `calculateIntentScore()`: Analizar eventos y retornar scores
   - `detectAbandonmentRisk()`: Detectar riesgo de abandono
   - `detectPurchaseIntent()`: Detectar intención de compra
   - `shouldTriggerProactive()`: Evaluar si disparar mensaje proactivo

2. **Algoritmos de scoring**:
   ```typescript
   interface IntentScore {
     purchaseIntent: number;      // 0-1
     abandonmentRisk: number;     // 0-1
     needsHelp: number;           // 0-1
     priceShopperRisk: number;    // 0-1
   }
   
   Heuristics:
   - Dwell time > 30s on product = +0.3 purchase intent
   - Multiple product views = +0.2 purchase intent
   - Add to cart = +0.5 purchase intent
   - Exit intent = +0.7 abandonment risk
   - No activity for 60s = +0.4 abandonment risk
   - Multiple cart adds/removes = +0.6 price shopper risk
   ```

3. **Tests**:
   - Unit tests para cálculo de scores
   - Integration tests con datos de sesión reales
   - Edge cases (sesión vacía, un solo evento, etc.)

---

## 📝 Notas Importantes

### Migración pendiente
La migración SQL para las nuevas entidades aún no se ha aplicado porque requiere DATABASE_URL configurado. Los pasos serán:

```bash
# Cuando tengas PostgreSQL configurado:
npx prisma migrate dev --name phase2_behavioral_tracking --schema infra/prisma/schema.prisma

# Esto creará:
# - behavior_events table
# - intent_signals table
# - proactive_triggers table
# - conversion_events table
# - Actualizará handoff_requests table (añadirá shopId, context)
```

### Integración con Widget
El storefront widget necesitará actualización para enviar eventos:

```javascript
// Ejemplo de tracking desde widget
async function trackEvent(eventType, eventData) {
  await fetch('/api/events/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shop-Domain': shopDomain },
    body: JSON.stringify({
      shopDomain,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      eventType,
      eventData
    })
  });
}

// Uso:
trackEvent('PRODUCT_VIEW', { productId: '123', dwellTimeMs: 5000 });
trackEvent('ADD_TO_CART', { productId: '123', price: 29.99, quantity: 1 });
trackEvent('EXIT_INTENT', { pageUrl: window.location.href });
```

### Testing Strategy
1. **Unit tests**: Para cada método del servicio
2. **Integration tests**: Con base de datos de test
3. **E2E tests**: Simular flujo completo desde widget

---

## 🚀 Timeline Estimado

- [x] P1.1 + P1.2: Event Tracking (2 días) ✅ **COMPLETADO**
- [ ] P1.3: Intent Detection (1 día)
- [ ] P1.4: Trigger Evaluation (1 día)
- [ ] P2: Proactive Messaging (2 días)
- [ ] P3: Add-to-Cart Integration (1 día)
- [ ] P4: Human Handoff (2 días)
- [ ] P5: Advanced Reranking (2 días)
- [ ] P6: Revenue Attribution (1 día)

**Total estimado**: 12 días de desarrollo

**Progreso actual**: Día 2 completado

---

**¿Continuamos con Intent Detection Engine?** 🎯
