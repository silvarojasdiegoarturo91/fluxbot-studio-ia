# # Copilot Instructions — Shopify AI Chatbot App

## Estado actual del proyecto
Este proyecto no parte de cero.

Ya existe una base inicial implementada con:
- el esqueleto de la aplicación de admin de Shopify
- la estructura principal del repositorio montada
- una página inicial parcialmente desarrollada

Debes trabajar sobre esta base existente.

No debes asumir que hay que rehacer todo desde cero. Primero analiza la estructura actual, reutiliza lo que tenga valor, detecta deuda técnica y propone una evolución progresiva hacia la arquitectura objetivo.

Antes de escribir código nuevo, debes identificar:
- qué partes actuales se pueden conservar
- qué partes necesitan refactor
- qué partes faltan para el MVP
- qué estructura conviene mantener
- qué cambios deben hacerse de forma incremental

Prioriza ampliar, ordenar y mejorar lo existente antes de reemplazarlo.

## Objetivo
Actúa como arquitecto principal y lead engineer. Antes de escribir código, debes diseñar la arquitectura completa, desglosar el roadmap de implementación y justificar cada decisión técnica.

La aplicación a construir es una Shopify AI Chatbot App pensada para destacar frente a apps existentes de ventas y soporte. Debe combinar:
- chatbot IA para ventas y soporte
- recomendaciones contextuales y proactivas
- consulta de catálogo y políticas
- consulta de pedidos
- recuperación de carrito e intención de compra
- handoff a humano
- multidioma
- cumplimiento RGPD / EU AI Act
- arquitectura preparada para escalar y evolucionar a omnicanal

## Regla principal de trabajo
Siempre sigue este orden:

1. analizar la estructura actual del proyecto
2. identificar qué ya existe y qué falta
3. detectar deuda técnica y oportunidades de refactor
4. diseñar la arquitectura objetivo a partir de la base existente
5. definir módulos, bounded contexts y flujos
6. definir modelo de datos
7. definir integraciones Shopify
8. definir seguridad, privacidad y cumplimiento
9. definir roadmap por fases
10. definir criterios de aceptación
11. solo entonces generar código
12. **OBLIGATORIO: ejecutar `npm test` para validar que los tests de Fase 0 siguen pasando**

No empieces generando archivos nuevos ni reorganizando masivamente el repositorio sin antes analizar la base actual del proyecto y producir un plan completo de evolución.Si falta contexto, asume decisiones razonables y documenta claramente las suposiciones.

### Regla crítica de testing
**Después de cualquier cambio en código de producción, DEBES ejecutar `npm test` obligatoriamente.**

Los tests de Fase 0 validan:
- Autenticación JWT y sesiones de Shopify
- Preservación de query parameters en navegación
- Conexión con Shopify Admin API
- Configuración de environment variables
- Estructura del proyecto y build

Si algún test falla, NO continues con más cambios. Primero arregla la regresión.
Ubicación de tests: `apps/shopify-admin-app/test/phase0/`
Documentación: `apps/shopify-admin-app/test/README.md`

---

## Qué debe entregar primero
Antes de escribir código, genera obligatoriamente estos apartados:

### 1. Product Vision
Describe:
- qué problema resuelve la app
- para qué tipo de merchant sirve
- qué la diferencia de otros chatbots de Shopify
- qué capacidades son MVP y cuáles son avanzadas

### 2. Competitive Differentiation Matrix
Organiza las capacidades del producto en bloques:

- ventas proactivas
- soporte automatizado
- búsqueda semántica de productos
- RAG sobre catálogo y políticas
- order lookup
- handoff humano
- omnicanalidad
- multidioma
- AEO / llms.txt
- cumplimiento legal y privacidad
- analítica de conversiones
- automatización operativa

Para cada bloque indica:
- valor de negocio
- complejidad técnica
- prioridad
- si entra en MVP, V2 o V3

### 3. Arquitectura completa
Debes proponer una arquitectura completa con:
- frontend embebido en Shopify Admin
- widget/chat en storefront
- backend principal
- motor de IA
- sistema de ingestión de datos
- almacenamiento conversacional
- base vectorial
- sistema de eventos y colas
- observabilidad
- seguridad y cumplimiento

### 4. Plan de implementación
Debes dividir el trabajo en fases:
- Fase 0: foundation
- Fase 1: MVP funcional
- Fase 2: ventas proactivas y optimización
- Fase 3: omnicanalidad y automatizaciones
- Fase 4: enterprise / compliance / escalado

Para cada fase define:
- alcance
- entregables
- dependencias
- riesgos
- criterios de finalización

### 5. Estructura del repositorio
Propón una estructura de carpetas completa y coherente.

### 6. ADRs
Incluye Architecture Decision Records breves con decisiones clave:
- por qué GraphQL y no REST
- por qué theme app extension y no script tags como opción principal
- por qué usar RAG híbrido
- por qué separar ingestion, serving y orchestration
- por qué usar colas para procesos pesados
- por qué guardar auditoría y consentimiento

---

## Requisitos de plataforma Shopify
La solución debe seguir prácticas actuales de Shopify:

- usar **Admin GraphQL API** como interfaz principal para operaciones de administración y datos
- fijar versión explícita de API y preparar estrategia de actualización periódica
- usar **Theme App Extensions** / **App Embed Blocks** para insertar el widget en la tienda
- evitar depender de script tags como solución principal en tiendas Online Store 2.0
- contemplar **Checkout UI Extensions** solo si hay casos válidos dentro del alcance
- contemplar **Web Pixel Extensions** para eventos de comportamiento y analítica
- usar webhooks para sincronización y consistencia eventual
- usar operaciones bulk cuando la sincronización de catálogo lo requiera

Justificación técnica:
- Shopify marca **2026-01** como la versión estable latest de Admin GraphQL API. :contentReference[oaicite:0]{index=0}
- Shopify recomienda usar Theme App Extensions/App Embed Blocks para nuevas apps integradas con Online Store 2.0; usar script tags como enfoque principal puede perjudicar la revisión de la app. :contentReference[oaicite:1]{index=1}
- Shopify dispone de extensiones específicas para checkout y de web pixels dentro de su sistema de extensiones. :contentReference[oaicite:2]{index=2}
- Para cargas masivas y sincronizaciones, GraphQL bulk operations es la estrategia correcta y desde 2026-01 permite más concurrencia en bulk mutations. :contentReference[oaicite:3]{index=3}

---

## Stack técnico objetivo
Usa este stack por defecto salvo que haya una razón fuerte para cambiarlo:

### App shell
- Shopify Remix app template
- TypeScript
- Node.js
- React
- Polaris
- App Bridge

### Backend
- Remix loaders/actions para capa web inicial
- servicios desacoplados por dominio
- Prisma ORM
- PostgreSQL
- Redis para caché, colas cortas y rate limiting
- cola de jobs: BullMQ o equivalente

### IA
- proveedor LLM desacoplado por interfaz
- soporte para OpenAI, Anthropic y Gemini mediante adapters
- embeddings desacoplados
- vector store desacoplado mediante repositorio
- estrategia RAG híbrida:
  - retrieval semántico
  - filtros estructurados
  - reranking
  - grounding con contexto Shopify

### Storefront widget
- Theme App Extension
- App Embed Block para el launcher
- componente de chat ligero
- carga diferida
- mínimo impacto en Lighthouse

### Observabilidad
- logs estructurados
- tracing
- métricas
- auditoría por tenant
- error tracking

### Seguridad
- cifrado de secretos
- separación por tenant/shop
- consentimiento y retención de datos
- redacción de PII en logs

---

## Arquitectura objetivo
Debes diseñar la app con estos módulos.

### 1. Embedded Admin App
Panel para merchants con:
- onboarding
- conexión y estado de sincronización
- configuración del chatbot
- branding y tono
- fuentes de conocimiento
- idiomas
- reglas de escalado a humano
- analítica
- billing
- gestión de prompts y guardrails
- páginas de cumplimiento y consentimiento

### 2. Storefront Chat Runtime
Widget de chat para la tienda:
- launcher
- chat window
- recomendaciones
- quick replies
- tarjetas de producto
- add-to-cart
- order lookup autenticado o seguro
- fallback cuando el bot no sepa responder
- captura de eventos de comportamiento

### 3. Shopify Integration Layer
Capa dedicada a:
- autenticación OAuth
- sesiones de shop
- Admin GraphQL client
- webhooks
- app proxy si se necesita exponer endpoints al storefront
- metadatos y metafields
- productos, colecciones, páginas, políticas, pedidos, clientes
- bulk sync y delta sync

### 4. Knowledge Ingestion Pipeline
Pipeline para construir la base de conocimiento:
- catálogo de productos
- variantes
- colecciones
- páginas CMS
- FAQs
- políticas
- blogs
- metacampos relevantes
- opcionalmente reseñas y FAQs de apps externas si el merchant las conecta

Debe soportar:
- sincronización inicial
- sincronización incremental
- reindexación selectiva
- versionado de documentos
- invalidación y rebuilding

### 5. AI Orchestration Layer
Responsable de:
- clasificación de intención
- elección de herramienta
- retrieval
- composición del contexto
- generación
- guardrails
- detección de incertidumbre
- handoff humano
- detección de idioma
- políticas de respuesta
- trazabilidad de prompts y outputs

### 6. Commerce Actions Layer
Herramientas que el agente puede invocar:
- buscar productos
- comparar productos
- consultar stock
- consultar políticas
- consultar estado de pedido
- sugerir upsell/cross-sell
- generar deep links a checkout/cart
- añadir producto al carrito si storefront lo permite
- crear ticket o derivar a soporte humano
- registrar lead o contacto
- actualizar atributos no sensibles permitidos

Todas las tools deben ser explícitas, tipadas, auditables y con control de permisos.

### 7. Conversation & Analytics Layer
Guardar:
- sesiones
- mensajes
- eventos de usuario
- resolución
- intención detectada
- uso de herramientas
- conversión atribuida
- handoff
- satisfacción
- confianza del modelo
- coste por conversación

### 8. Compliance & Governance Layer
Gestionar:
- consentimiento
- minimización de datos
- retención
- borrado
- exportación
- auditoría
- configuración regional de datos
- exclusión de entrenamiento con datos del merchant

---

## Capacidades diferenciales que deben considerarse
El plan debe incorporar o preparar estas capacidades porque son las que más pueden diferenciar la app en Shopify:

### A. Ventas proactivas
- detección de intención de compra
- triggers por dwell time, exit intent, profundidad de scroll, visitas repetidas
- mensajes no intrusivos
- recomendaciones contextualizadas
- recuperación de carrito

### B. Soporte útil de verdad
- respuestas sobre pedidos, envíos, devoluciones, cambios y políticas
- grounding sobre datos reales de la tienda
- reducción de alucinaciones
- respuesta con enlaces y acciones útiles

### C. Búsqueda semántica y asesor de compra
- consultas complejas tipo lenguaje natural
- comparación entre productos
- filtrado por presupuesto, atributos, compatibilidad y disponibilidad
- razonamiento guiado para elección de producto

### D. RAG robusto
- chunking por tipo de documento
- embeddings y metadata filters
- reranking
- citations internas
- fallback cuando la confianza es baja

### E. AEO / visibilidad para buscadores de IA
- preparar un módulo para generar `llms.txt`
- exponer información estructurada y segura
- permitir que el merchant defina qué contenido es visible para crawlers IA

### F. Multidioma real
- detección automática de idioma
- respuestas en idioma del usuario
- base de conocimiento multilingüe
- localización de UI y prompts

### G. Handoff humano
- umbral de confianza
- detección de frustración
- transferencia sin perder contexto
- integración futura con Zendesk, Gorgias o Shopify Inbox

### H. Cumplimiento fuerte
- RGPD by design
- no entrenar modelos públicos con datos del merchant
- registro de consentimiento
- supresión/borrado
- explicabilidad básica de acciones del agente

---

## Priorización obligatoria
Al planificar, clasifica así:

### MVP
Debe incluir:
- instalación Shopify
- embedded admin
- widget storefront por theme app extension
- sincronización de catálogo
- RAG sobre catálogo + páginas + políticas
- chat de soporte y producto
- recomendaciones simples
- order lookup de solo lectura
- analítica básica
- multidioma básico
- consentimiento y privacidad básica
- logs y observabilidad básica

### V2
Debe incluir:
- ventas proactivas por comportamiento
- add-to-cart desde chat
- reranking avanzado
- handoff humano
- dashboard de conversión
- segmentos de merchants
- personalización avanzada de tono y branding
- mejor sistema de prompts y evaluaciones

### V3
Debe incluir:
- omnicanalidad
- automatizaciones operativas
- campañas de recuperación
- AEO / llms.txt
- acciones más complejas
- reglas por mercado, idioma, país
- compliance avanzada y residencia de datos

---

## Requisitos de diseño del dominio
Modela el sistema como multi-tenant por shop.

Entidades mínimas:
- Shop
- ShopInstallation
- User
- BillingPlan
- ChatbotConfig
- Conversation
- ConversationMessage
- ConversationEvent
- CustomerIdentity
- KnowledgeSource
- KnowledgeDocument
- KnowledgeChunk
- EmbeddingRecord
- ProductProjection
- PolicyProjection
- OrderProjection
- AIProviderConfig
- ToolInvocation
- HandoffRequest
- ConsentRecord
- AuditLog
- WebhookEvent
- SyncJob
- FeatureFlag

Debes proponer:
- esquema Prisma inicial
- relaciones
- índices
- estrategia de partición lógica por shop
- políticas de borrado y retención

---

## Requisitos de APIs internas
Diseña APIs y contratos antes de implementarlos.

Define:
- endpoints admin
- endpoints storefront
- webhook handlers
- jobs async
- contratos de tools para el agente

Ejemplos de tools internas:
- `searchProducts(query, filters, locale)`
- `recommendProducts(context, cart, locale)`
- `getOrderStatus(orderRef, customerVerification)`
- `getStorePolicies(topic, locale)`
- `getShippingInfo(destination, cart)`
- `createSupportEscalation(conversationId, reason)`
- `trackBehaviorEvent(sessionId, event)`
- `generateLlmsTxt(shopId)`

Todas las herramientas deben:
- validar entrada
- tipar salida
- registrar auditoría
- tener timeouts y manejo de errores
- evitar filtrar datos sensibles al LLM

---

## Requisitos de frontend
### Admin
Usa Polaris y App Bridge.
Pantallas mínimas:
- dashboard
- onboarding
- data sources
- chatbot settings
- behavior triggers
- human handoff
- analytics
- billing
- compliance/privacy
- prompt lab o AI settings

### Storefront widget
Debe:
- cargar rápido
- ser accesible
- tener estado offline/error
- soportar desktop y mobile
- soportar themes Online Store 2.0
- evitar degradar Lighthouse de forma fuerte
- incluir lazy loading y split por chunks

---

## Requisitos de sincronización y datos
Debes planear dos modos:

### Initial sync
- productos
- variantes
- colecciones
- páginas
- políticas
- blogs/artículos si aportan valor

### Incremental sync
Mediante:
- webhooks
- jobs de reconciliación
- reindexación por cambios

Usa bulk operations cuando el volumen lo justifique. Shopify documenta las bulk operations como la vía adecuada para importaciones y procesamiento masivo. :contentReference[oaicite:4]{index=4}

---

## Requisitos de calidad del agente IA
Debes diseñar el chatbot para minimizar alucinaciones.

Obligatorio:
- no responder con seguridad cuando falte grounding
- usar confidence score
- fallback claro
- handoff o sugerencia de contacto
- separar prompts de sistema, prompts por tarea y plantillas
- registrar evaluaciones offline
- crear test sets con casos de ventas, soporte y ambigüedad

Diseña un framework de evaluación con:
- exactitud factual
- relevancia
- tasa de handoff
- tasa de conversión
- latencia
- coste
- satisfacción del usuario

---

## Requisitos de seguridad y privacidad
Debes diseñar:
- aislamiento por tenant
- control de acceso por merchant user
- cifrado en tránsito y reposo
- gestión de secretos
- rate limiting
- protección anti abuso
- minimización de PII
- borrado selectivo
- logs sin secretos
- consentimiento del visitante cuando aplique
- contrato de procesamiento de datos y settings de privacidad

No envíes al LLM datos innecesarios.
No uses datos del merchant para entrenamiento externo.
Toda acción sensible debe quedar auditada.

---

## Requisitos de escalabilidad
Debes preparar el sistema para:
- múltiples tiendas
- múltiples proveedores LLM
- picos de conversaciones
- colas de sincronización
- reintentos idempotentes
- feature flags
- configuración por plan
- despliegues seguros

---

## Estructura recomendada del monorepo
Propón algo similar a esto y ajústalo si hay una opción mejor:

apps/
  shopify-admin-app/
  storefront-widget/
services/
  ai-orchestrator/
  ingestion-service/
  sync-service/
  analytics-service/
packages/
  shopify-client/
  ui/
  prompts/
  shared-types/
  config/
  observability/
  compliance/
  testing/
infra/
  prisma/
  docker/
  terraform/

Si eliges otra estructura, justifícala.

---

## Convenciones de código
- TypeScript estricto
- arquitectura limpia/modular
- no lógica de negocio en componentes
- validación con zod o equivalente
- servicios pequeños y cohesionados
- funciones puras cuando sea posible
- nombres claros y consistentes
- errores tipados
- test unitarios e integración
- contratos compartidos centralizados
- comentarios solo cuando aporten contexto real
- evitar sobreingeniería, pero no sacrificar extensibilidad crítica

---

## Estrategia de testing
Diseña desde el inicio:
- **tests de Fase 0 (OBLIGATORIO ejecutar después de cada cambio con `npm test`):**
  - auth-jwt.test.ts: validación de tokens JWT y autenticación Shopify
  - navigation-params.test.ts: preservación de query params en navegación
  - shopify-connection.test.ts: conectividad con Admin API
  - environment-config.test.ts: validación de variables de entorno
  - build-validation.test.ts: estructura del proyecto y TypeScript
- unit tests para lógica de negocio
- integration tests para conexiones externas
- contract tests para APIs
- webhook tests para eventos Shopify
- tests de tools del agente IA
- tests de RAG y retrieval semántico
- E2E para onboarding, sync, chat y order lookup
- datasets de evaluación del chatbot
- smoke tests por release

**NUNCA omitas la ejecución de `npm test` después de modificar código.**
Si un test de Fase 0 falla, es una regresión crítica que bloquea el trabajo.

---

## Qué debes producir como salida
Cuando se te pida trabajar sobre este proyecto, tu respuesta debe tener este orden:

1. Resumen ejecutivo
2. Suposiciones
3. Arquitectura propuesta
4. Módulos y responsabilidades
5. Modelo de datos
6. Flujos clave
7. Integraciones Shopify
8. Riesgos y mitigaciones
9. Roadmap por fases
10. Estructura del repo
11. ADRs
12. Lista priorizada de tareas
13. Solo después: generación de código

Nunca empieces directamente por el código si antes no has presentado el plan.

---

## Primera tarea obligatoria
La primera entrega debe ser un documento de arquitectura inicial que responda:

- cuál es el mejor MVP para competir en Shopify
- qué capacidades diferenciales conviene incluir desde el principio
- qué partes deben construirse ya y cuáles dejar preparadas
- cómo se conectan Shopify, RAG, chat widget, analítica, cumplimiento y handoff
- cuál es la estructura exacta del repositorio
- qué epics y stories forman el roadmap

Solo después de eso puedes empezar a generar los archivos del proyecto.