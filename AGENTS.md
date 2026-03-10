# Instrucciones de ingeniería para asistentes de IA (Copilot, Codex, Gemini) — App Shopify

## IMPORTANTE: Arquitectura Separada

Este proyecto utiliza una **arquitectura separada** entre frontend y backend de IA:

### Repositorios

1. **fluxbot-studio-ia** (este repositorio)
   - Frontend: App de Admin Shopify
   - UI: Shopify Polaris + React
   - Base de datos: PostgreSQL (solo datos de Shopify)
   - API: REST/GraphQL para operaciones de Shopify

2. **fluxbot-studio-back-ia** (`~/Documents/fluxbot-studio-back-ia`)
   - Backend: API de IA
   - Servicios: Orquestación LLM, embeddings, RAG, triggers proactivos
   - API Keys: OpenAI, Anthropic, Gemini (gestionados aquí)
   - Base de datos: PostgreSQL (datos de IA)

### Comunicación Frontend → Backend

El frontend llama al backend de IA via HTTP:

```typescript
// apps/shopify-admin-app/app/services/ia-backend.client.ts
import { iaClient } from './services/ia-backend.client';

const response = await iaClient.chat.send({
  message: 'Hola, quiero comprar algo',
  conversationId: 'conv-123',
  context: { shopId: 'shop-1', locale: 'es' }
}, shopDomain);
```

### Variables de Entorno

**Frontend** (`apps/shopify-admin-app/.env`):
```env
IA_BACKEND_URL=http://localhost:3001
IA_BACKEND_API_KEY=your_ia_backend_api_key
```

**Backend** (`fluxbot-studio-back-ia/.env`):
```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
DATABASE_URL=postgresql://.../fluxbot_ia
```

---

## Propósito del archivo
Este archivo define las reglas, prioridades, restricciones técnicas y criterios de calidad que **cualquier asistente de IA de desarrollo** debe seguir al generar código para esta aplicación Shopify.

Está redactado para que sea compatible con:
- GitHub Copilot (`.github/copilot-instructions.md`)
- Codex / agentes de desarrollo orientados a tareas
- Gemini / asistentes de generación de código
- Otros LLM usados dentro del IDE o pipeline de desarrollo

---

## Contexto del producto
Estamos construyendo una **aplicación Shopify de nueva generación** orientada a comercio conversacional, soporte automatizado y descubrimiento inteligente de producto.

La aplicación **no debe ser un simple chatbot FAQ**. Debe diferenciarse claramente en un mercado saturado mediante varias capacidades combinadas:

1. **Venta proactiva y no intrusiva**
   - Detectar intención de compra, indecisión y abandono.
   - Activar mensajes contextuales basados en comportamiento del usuario.
   - Priorizar impacto en conversión, AOV y recuperación de carrito.

2. **Descubrimiento avanzado de producto**
   - Recomendaciones basadas en catálogo, contexto, atributos y semántica.
   - Soporte para catálogos grandes y consultas complejas.
   - Capacidad de comparar productos y explicar diferencias.

3. **Soporte operativo real**
   - Consultar pedidos, devoluciones, estado de envío y políticas.
   - Ejecutar acciones permitidas sobre Shopify o sistemas conectados.
   - Escalar a humano cuando la confianza sea baja o el caso lo requiera.

4. **AEO / llms.txt / visibilidad en motores de respuesta**
   - La app debe contemplar generación y exposición de contenido estructurado para LLMs.
   - Debe poder ayudar a que la tienda sea interpretable por ChatGPT, Gemini, Claude, Perplexity, etc.

5. **Cumplimiento y privacidad como feature, no como parche**
   - Diseño compatible con RGPD.
   - Minimización de datos.
   - Observabilidad y trazabilidad.
   - Posibilidad de despliegue/almacenamiento regional si el cliente lo exige.

6. **Enfoque multilingüe y omnicanal**
   - Preparada para varios idiomas.
   - Arquitectura extensible para web chat, WhatsApp, Instagram, email/helpdesk y otros canales.

Estas prioridades se derivan del análisis estratégico del ecosistema Shopify proporcionado en el documento base fileciteturn0file0.

---

## Objetivo de negocio
Todo código generado debe contribuir a uno o más de estos objetivos:

- aumentar conversión
- aumentar AOV
- reducir abandono de carrito
- mejorar descubrimiento de producto
- reducir carga de soporte humano
- mejorar precisión de respuestas
- mejorar tiempo de respuesta
- reforzar cumplimiento legal y confianza
- preparar a la tienda para AEO / consumo por LLMs

Si una decisión técnica entra en conflicto con estos objetivos, priorizar:
1. precisión
2. mantenibilidad
3. seguridad
4. rendimiento
5. velocidad de implementación

---

## Qué NO debe generar la IA
La IA **no debe** producir:

- código placeholder sin implementar cuando se pidió funcionalidad real
- mocks permanentes en código de producción
- lógica acoplada directamente a un único proveedor LLM
- secretos hardcodeados
- consultas inseguras o sin validación
- flujos que ejecuten acciones sensibles sin autorización explícita
- UI genérica sin relación con Shopify Polaris cuando aplique
- funciones enormes, difíciles de testear o sin separación por capas
- descripciones vacías del tipo `TODO: implement`
- afirmaciones falsas sobre APIs no verificadas en el código

Cuando falten datos, la IA debe:
- hacer una **mejor suposición razonable y segura**
- dejarla documentada en comentarios o README técnico
- diseñar la solución para ser extensible
- evitar bloquear la implementación por falta de detalle menor

---

## Principios arquitectónicos obligatorios

### 1. Arquitectura modular
Usar una arquitectura desacoplada con límites claros entre:
- `presentation` / UI
- `application` / casos de uso
- `domain` / reglas de negocio
- `infrastructure` / Shopify, DB, colas, LLMs, embeddings, cache, observabilidad

### 2. Provider-agnostic AI
Toda integración con IA debe ir detrás de interfaces/adapters.

Ejemplo conceptual:
- `ChatModelProvider`
- `EmbeddingProvider`
- `RerankerProvider`
- `ModerationProvider`
- `TranslationProvider`

Nunca acoplar la lógica de negocio directamente a OpenAI, Gemini, Anthropic o un SDK concreto.

### 3. Shopify-first
El dominio debe modelarse explícitamente alrededor de entidades Shopify:
- shop
- customer
- product
- variant
- cart
- order
- fulfillment
- policy
- collection
- article/page
- discount
- webhook event

### 4. Event-driven when useful
Preferir eventos y colas para:
- sincronización de catálogo
- reindexado semántico
- procesamiento de webhooks
- generación de llms.txt / feeds AEO
- analítica conversacional
- reentrenamiento o refresco de conocimiento

### 5. Observabilidad total
Todo flujo importante debe poder trazarse con:
- request id / correlation id
- shop id
- conversation id
- user/session id cuando proceda
- timestamps
- latencia por operación
- resultado final
- motivo de fallback o handoff

### 6. Seguridad por defecto
Aplicar deny-by-default para acciones operativas. Toda acción debe tener:
- autorización
- validación de entrada
- auditoría
- control de idempotencia si procede
- manejo explícito de errores

---

## Stack preferido
Cuando no se especifique lo contrario, priorizar el siguiente stack:

### Frontend
- TypeScript
- React
- Shopify Polaris
- App Bridge cuando aplique
- TanStack Query para datos remotos
- Zod para validación compartida si es viable

### Backend
- TypeScript
- Node.js
- framework organizado y mantenible (por ejemplo NestJS o estructura modular equivalente)
- API en REST o GraphQL según convenga; evitar mezclar estilos sin criterio
- Prisma o equivalente si hay base de datos relacional

### Datos
- PostgreSQL como base principal
- Redis para caché, rate limit, sesiones efímeras, locks o colas ligeras
- Vector store desacoplado por interfaz si hay búsqueda semántica

### Integraciones IA
**NOTA: Toda la lógica de IA está en el repositorio separado `fluxbot-studio-back-ia`**
- Usar el cliente `iaClient` para llamadas al backend de IA
- No implementar lógica de LLMs, embeddings o RAG en este repositorio
- abstracciones provider-agnostic (en backend)
- RAG con recuperación híbrida cuando haya catálogo/documentación (en backend)
- uso de herramientas/functions para acciones verificables
- guardrails y evaluación de confianza

### Infraestructura
- Docker
- CI/CD con validación automática
- configuración por variables de entorno
- separación clara entre dev/staging/prod

Si el proyecto ya usa otro stack, respetarlo y adaptar el código al stack existente antes que reescribirlo.

---

## Estructura de carpetas recomendada
Usar una estructura consistente y fácil de escalar. Ejemplo orientativo:

```text
src/
  modules/
    chat/
      application/
      domain/
      infrastructure/
      presentation/
    catalog/
    recommendations/
    orders/
    policies/
    aeo/
    analytics/
    auth/
    shops/
  shared/
    domain/
    infrastructure/
    utils/
    types/
    config/
  main/
```

Si se trabaja en monorepo, preferir:

```text
apps/
  admin
  api
packages/
  ui
  config
  types
  shopify
  ai
  observability
  testing
```

---

## Módulos funcionales mínimos
La IA debe intentar construir el sistema en módulos reutilizables.

**NOTA IMPORTANTE:** Algunos módulos están en ESTE repositorio y otros en `fluxbot-studio-back-ia`:

### Módulos en ESTE repositorio (Frontend):
- Onboarding de tienda
- Sincronización Shopify
- Gestión de consentimiento
- Entrega de mensajes
- Analytics (frontend)
- Escalamiento a humano
- Commerce actions

### Módulos en fluxbot-studio-back-ia (Backend IA):
- Chat orchestration (orquestación LLM)
- Knowledge ingestion (embeddings, chunking)
- Motor de recomendaciones (IA)
- Detección de intención
- RAG y búsqueda vectorial
- Triggers proactivos
- Generación llms.txt

### 1. Onboarding de tienda
- instalación OAuth Shopify
- captura y almacenamiento seguro de credenciales/tokens
- configuración inicial por tienda
- selección de idioma, tono, objetivos y canales
- sincronización inicial de catálogo, páginas, políticas y FAQs

### 2. Knowledge ingestion
- ingestión de productos, variantes, colecciones, páginas, blogs y políticas
- chunking razonable
- versionado/indexado
- reindexado incremental por webhooks
- metadatos ricos por documento

### 3. Chat orchestration
- recepción de mensaje
- enriquecimiento con contexto de sesión y tienda
- recuperación de conocimiento
- clasificación de intención
- decisión entre responder, recomendar, pedir aclaración o escalar
- soporte para tools/actions
- evaluación de confianza

### 4. Motor de recomendaciones
- recomendación contextual por página, colección, carrito, historial de navegación o mensaje
- comparación de productos
- upsell y cross-sell
- manejo de restricciones como precio, talla, color, compatibilidad, ingredientes, etc.

### 5. Soporte postventa
- lookup de pedido
- políticas de devolución/cambio
- estado de envío
- acciones permitidas y auditadas

### 6. Proactividad conductual
- detección de señales: tiempo en página, scroll, exit intent, producto visto, carrito abandonado
- reglas + scoring + IA, evitando intrusión excesiva
- frequency capping por sesión/usuario

### 7. AEO module
- generación de `llms.txt`
- endpoints o archivos estructurados para exponer catálogo/resúmenes/políticas a motores de respuesta
- marcado y contenido útil, preciso y actualizado
- job de refresco automático

### 8. Analytics & insights
- tasa de resolución
- conversion assist
- revenue influenced
- recomendaciones aceptadas
- razones de handoff
- temas recurrentes
- sentimiento si aplica

### 9. Handoff humano
- fallback a agente
- transcript resumido
- motivo del escalado
- contexto relevante para evitar repetición por parte del cliente

---

## Requisitos de comportamiento del agente conversacional
El agente debe comportarse como una combinación de:
- asesor comercial experto
- buscador semántico del catálogo
- asistente de soporte de primer nivel
- orquestador seguro de acciones

### Reglas de respuesta
- responder con precisión y brevedad útil
- no inventar productos, políticas ni estados de pedido
- cuando falte certeza, reconocerlo y ofrecer siguiente paso seguro
- citar internamente las fuentes recuperadas cuando la arquitectura lo permita
- usar contexto del catálogo y de la conversación actual
- mantener tono configurable por tienda
- priorizar recomendación útil sobre texto largo

### Reglas de venta
- no ser agresivo
- recomendar solo productos realmente relevantes y disponibles
- explicar por qué un producto encaja
- preferir bundles, upsells o cross-sells justificables
- evitar recomendar productos agotados salvo alternativa clara

### Reglas de soporte
- no ejecutar acciones irreversibles sin validación
- verificar identidad/propiedad cuando una acción lo requiera
- registrar cada acción ejecutada

---

## Requisitos de AEO / llms.txt
La IA debe considerar AEO como parte central del producto, no accesorio.

### Debe soportar
- generación de archivo `llms.txt`
- generación de vistas resumidas del negocio para consumo por LLMs
- exposición de productos destacados, categorías, políticas y FAQs en formato estructurado
- actualización automática cuando cambien catálogo o políticas
- contenido preciso, legible por máquina y mantenible

### Debe evitar
- duplicación innecesaria de contenido
- datos desactualizados
- exponer información privada o no pública

### Salida esperada
- servicio o módulo dedicado `aeo`
- generadores testeables
- plantillas o builders versionados

---

## Requisitos de cumplimiento, privacidad y seguridad
Estas reglas son obligatorias.

### Privacidad
- recolectar el mínimo dato necesario
- anonimizar o seudonimizar cuando se pueda
- definir políticas de retención
- permitir borrado por tienda/usuario si aplica
- no usar datos de clientes para entrenamiento no autorizado

### Seguridad
- sanitización y validación de todas las entradas
- rate limiting
- protección frente a prompt injection cuando haya RAG o tools
- lista blanca de tools/acciones permitidas
- separación estricta entre contexto de distintas tiendas
- cifrado en tránsito y en reposo según capacidad del sistema

### Cumplimiento
- preparar arquitectura compatible con RGPD
- registrar consentimientos y base legal cuando aplique
- trazabilidad de decisiones automáticas si se implementan acciones
- documentar claramente qué datos procesa cada módulo

---

## Requisitos de calidad de código
Todo código generado debe cumplir estas reglas:

### Generales
- TypeScript estricto
- evitar `any` salvo justificación explícita y localizada
- nombres claros y de dominio
- funciones pequeñas
- clases o servicios con responsabilidad única
- comentarios solo cuando añadan contexto real
- preferir composición sobre herencia

### Validación
- validar DTOs y payloads de entrada/salida
- no confiar en datos externos aunque provengan de Shopify
- mapear errores de proveedores a errores de dominio/aplicación

### Manejo de errores
- nunca silenciar excepciones
- registrar error con contexto útil
- devolver mensajes seguros, no filtrar secretos ni internals
- diferenciar errores recuperables, de negocio y de infraestructura

### Rendimiento
- evitar N+1
- cachear selectivamente
- paginar cargas grandes
- usar jobs asíncronos para procesos pesados
- minimizar latencia del chat

---

## Requisitos de UX/UI
Cuando la IA genere interfaces, debe:
- usar Shopify Polaris si la UI es de administración embebida
- mantener consistencia visual con el ecosistema Shopify
- priorizar claridad, estados vacíos, loading y error states
- ofrecer configuración comprensible para merchants no técnicos
- mostrar métricas de impacto con lenguaje de negocio
- evitar interfaces recargadas

### Pantallas recomendadas
- onboarding
- configuración del asistente
- fuentes de conocimiento
- reglas de proactividad
- analytics
- conversaciones / handoff
- acciones y permisos
- AEO / llms.txt status

---

## Testing obligatorio
La IA debe generar tests junto al código relevante.

### Tests de Fase 0 (EJECUCIÓN OBLIGATORIA)
**CRÍTICO: Después de CUALQUIER cambio en código de producción, ejecuta `npm test`**

Los tests de Fase 0 son la suite de regresión que valida la funcionalidad core:
- `test/phase0/auth-jwt.test.ts`: Validación de JWT, firma HS256, clock tolerance
- `test/phase0/navigation-params.test.ts`: Preservación de shop/host/embedded en URLs
- `test/phase0/shopify-connection.test.ts`: Consultas GraphQL y conexión Admin API
- `test/phase0/environment-config.test.ts`: Variables requeridas y configuración
- `test/phase0/build-validation.test.ts`: Estructura del proyecto y dependencias

**Si algún test de Fase 0 falla, DETENTE. No continues hasta arreglar la regresión.**

Estos tests protegen:
- Autenticación embedded de Shopify (sin esto, la app no carga)
- Navegación sin pérdida de sesión (sin esto, usuarios ven login loops)
- API connectivity (sin esto, no hay datos de shop)
- Configuración correcta (sin esto, errores crípticos en runtime)

Comandos:
- `npm test` - ejecutar suite completa
- `npm run test:watch` - modo watch durante desarrollo
- `npm run test:coverage` - reporte de cobertura

Documentación completa: `apps/shopify-admin-app/test/README.md`

### Unit tests
Cubrir:
- casos de uso
- servicios de dominio
- mapeadores
- validadores
- builders de prompts/plantillas
- generadores de `llms.txt`

### Integration tests
Cubrir:
- integración con Shopify
- repositorios
- colas/jobs
- adapters de proveedores IA mockeados
- webhooks

### E2E tests
Cubrir los journeys críticos:
- instalación de app
- sincronización inicial
- chat con recomendación
- consulta de pedido
- fallback humano
- generación/refresh de `llms.txt`

### Regla
Ninguna feature importante debe entregarse sin tests mínimos razonables.
**Los tests de Fase 0 deben ejecutarse SIEMPRE, no son opcionales.**

---

## Logging, métricas y analítica
Implementar desde el inicio:

### Logs estructurados
Campos mínimos:
- timestamp
- level
- service/module
- shopId
- conversationId
- requestId
- action
- outcome
- latencyMs

### Métricas mínimas
- latencia por respuesta
- latencia por recuperación
- tasa de fallback
- tasa de recomendación aceptada
- tasa de resolución
- conversion assist
- errores por proveedor
- freshness del índice

### Trazas
Trazar flujos multi-step: webhook → indexado → recuperación → respuesta → acción.

---

## Estrategia de prompts y RAG
Cuando la IA genere lógica para prompts, debe:

- mantener prompts versionados
- separar system prompt, policy prompt, tool instructions y context builder
- no mezclar reglas de negocio con texto improvisado en controladores
- limitar contexto recuperado a lo relevante
- incluir score/confidence cuando sea útil
- definir estrategias de fallback cuando la recuperación sea débil
- diseñar protección frente a prompt injection y datos maliciosos en catálogo/contenido

### Política RAG recomendada
1. recuperar por filtros estructurados + semántica
2. rerankear si hay volumen alto
3. resumir contexto antes de enviarlo al LLM cuando sea necesario
4. responder solo con datos soportados
5. si no hay soporte suficiente, admitir incertidumbre

---

## Requisitos para acciones/tool calling
Si la IA genera tools o acciones ejecutables, debe seguir estas reglas:

- cada tool con input schema estricto
- validación previa a ejecutar
- autorización por tienda/rol/contexto
- timeout y retries controlados
- idempotencia cuando aplique
- auditoría completa
- respuesta normalizada

### Ejemplos de tools aceptables
- `findOrderByNumber`
- `getTrackingStatus`
- `getReturnPolicy`
- `searchCatalog`
- `compareProducts`
- `generateCartRecommendation`
- `publishLlmsTxt`

### Ejemplos que requieren máxima cautela
- modificar pedidos
- aplicar descuentos
- iniciar devoluciones
- actualizar datos de cliente

Estas acciones deben diseñarse con confirmación, permisos y trazabilidad.

---

## Requisitos de documentación que debe generar la IA
Además del código, generar cuando sea apropiado:

- README del módulo o feature
- decisiones técnicas importantes
- variables de entorno necesarias
- ejemplos de payloads
- contratos de API
- instrucciones de despliegue local
- notas de seguridad/cumplimiento cuando apliquen

La documentación debe ser concreta y accionable.

---

## Convenciones de salida para asistentes de IA
Cuando generes código para este proyecto:

1. entrega primero la solución completa
2. luego resume supuestos y decisiones técnicas
3. incluye tests
4. incluye notas de integración si faltan piezas externas
5. no propongas refactors masivos innecesarios
6. respeta el estilo y estructura ya existentes en el repositorio
7. si cambias contratos, actualiza tipos, tests y documentación
8. si introduces dependencias, justifica por qué

---

## Prioridades de implementación
Si se pide construir una feature y hay varias formas válidas, priorizar en este orden:

1. seguridad y cumplimiento
2. exactitud funcional
3. compatibilidad con Shopify
4. mantenibilidad
5. rendimiento
6. extensibilidad multi-LLM
7. experiencia de merchant
8. velocidad de entrega

---

## Definition of Done
Una tarea no está terminada si falta cualquiera de estos puntos relevantes:

- código funcional
- tipos correctos
- validación
- manejo de errores
- tests mínimos
- **tests de Fase 0 ejecutados y pasando (`npm test` debe mostrar 68/68 tests passing)**
- logs/observabilidad básica
- documentación mínima
- integración coherente con el resto del sistema

**BLOQUEADOR:** Si `npm test` falla, la tarea NO está completa. Los tests de Fase 0 son el contrato de calidad mínimo.

Cómo validar:
```bash
cd apps/shopify-admin-app
npm test
# Expected output:
# Test Files  5 passed (5)
# Tests      68 passed (68)
```

Si algún test falla:
1. Lee el error del test
2. Revisa qué cambio lo rompió
3. Arregla la regresión o revierte el cambio
4. Re-ejecuta `npm test` hasta que pase
5. Solo entonces considera la tarea completa

---

## Instrucción final para cualquier asistente de código
Genera soluciones de nivel producción para una app Shopify enfocada en comercio conversacional, soporte automatizado, búsqueda semántica, AEO y cumplimiento. No construyas un chatbot genérico. Construye una plataforma modular, segura, observable, extensible y orientada a impacto de negocio.
