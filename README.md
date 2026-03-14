# Fluxbot Studio IA - Shopify AI Chatbot Monorepo

## 📋 Estado del Proyecto

La fuente de verdad del estado del producto y de cada fase es `STATUS_MATRIX.md`.

Este README ya no mantiene checklists de fase para evitar desalineaciones.

La documentacion historica/completada fue centralizada en `documentation/`.

### Resumen rápido
- ✅ Base estable de app Shopify embebida + widget storefront
- ✅ Fase 1 cerrada en este repo: gateway IA remoto por defecto + order lookup verificado
- ✅ Fase 1 validada en profundidad (2026-03-12): `15/15` (phase1) + `70/70` (rutas/servicios integración) + `941/941` (suite completa)
- ✅ Cierre inicial de Fase 2: `add-to-cart` y `human handoff` en backend
- ✅ Migración de Fase 2: intent detection + trigger decisioning remotos (sin fallback local), con dispatch proactivo en frontend
- ✅ Migración de quality pipeline: retrieval/reranking remoto (sin fallback local en frontend)
- ✅ Fase 3 `llms.txt`: generación en backend IA y publicación en frontend
- ✅ Reautenticación/reinstalación en dev store ejecutada (2026-03-12) con tokens Admin renovados
- ✅ Fases 2 a 6 cerradas en este repo (incluyendo compliance enterprise, hardening de conectores y cierre de separación)
- ✅ El detalle por capability, ownership y siguientes incrementos vive en `STATUS_MATRIX.md`

---

## 🏗 Estructura del Proyecto

```
/home/diegos/Documents/fluxbot-studio-ia/
├── shopify-admin-app/          # Aplicación embebida de Shopify (Remix + Polaris)
├── storefront-widget/          # Widget de chat para storefront (Theme Extension)
├── services/                   # Servicios del backend
│   ├── ai-orchestrator/        # Motor de IA, RAG, tools, guardrails
│   ├── ingestion-service/      # Sincronización de catálogo y embeddings
│   ├── sync-service/           # Webhooks y bulk operations de Shopify
│   └── analytics-service/      # Analítica de conversaciones y conversión
├── packages/                   # Paquetes compartidos
│   ├── shopify-client/         # Cliente GraphQL y OAuth de Shopify
│   ├── ui/                     # Componentes UI reutilizables
│   ├── prompts/                # Prompts versionados y plantillas IA
│   ├── shared-types/           # Tipos TypeScript compartidos
│   ├── config/                 # Configuración y feature flags
│   ├── observability/          # Logging, tracing, métricas
│   ├── compliance/             # GDPR, consentimiento, privacidad
│   └── testing/                # Utilidades de testing compartidas
└── infra/                      # Infraestructura
    └── prisma/                 # Schema y migraciones de base de datos
        └── prisma/
            ├── schema.prisma
            └── migrations/
```

---

## 🚀 Comandos Disponibles

### Desarrollo
```bash
npm run dev              # Inicia Shopify CLI + tunnel
npm run build            # Build de producción
npm run typecheck        # Validación TypeScript
npm run lint             # ESLint
npm run shops:sync:ia    # Sincroniza referencias Shop frontend -> backend IA
npm run smoke:release    # Levanta release local y valida health, llms, intent, triggers y chat
```

### Testing
```bash
npm --prefix apps/shopify-admin-app run test:phase1:deep  # Validación profunda de Fase 1
cd apps/shopify-admin-app && npm test                     # Suite completa (fase 0-1 + integración + unit)
```

### Base de Datos (Prisma)
```bash
npm run prisma:generate        # Genera Prisma Client
npm run prisma:migrate:dev     # Crea nueva migración (desarrollo)
npm run prisma:migrate:deploy  # Aplica migraciones (producción)
```

---

## ⚙️ Configuración Inicial Requerida

### 1. Base de Datos PostgreSQL

Necesitas crear una base de datos PostgreSQL antes de ejecutar el proyecto:

**Opción A: Docker (recomendado para desarrollo)**
```bash
docker run --name fluxbot-postgres \
  -e POSTGRES_USER=fluxbot \
  -e POSTGRES_PASSWORD=dev_password \
  -e POSTGRES_DB=fluxbot_dev \
  -p 5432:5432 \
  -d postgres:16-alpine
```

**Opción B: PostgreSQL local**
```bash
createdb fluxbot_dev
```

**Opción C: Servicio en la nube**
- Railway.app
- Supabase
- Neon
- PlanetScale

### 2. Variables de Entorno

Crea el archivo `.env.local` en la raíz del proyecto:

```bash
# Base de datos
DATABASE_URL="postgresql://fluxbot:dev_password@localhost:5432/fluxbot_dev"

# Shopify
SHOPIFY_API_KEY="tu_api_key_aqui"
SHOPIFY_API_SECRET="tu_api_secret_aqui"
SHOPIFY_APP_URL="https://tu-tunnel.ngrok.io"
SCOPES="write_products,read_customers,read_orders"

# Sesión
SESSION_SECRET="genera_un_string_aleatorio_seguro_aqui"

# IA Providers (al menos uno)
OPENAI_API_KEY="sk-..."
# ANTHROPIC_API_KEY="sk-ant-..."
# GOOGLE_GEMINI_API_KEY="AI..."

# Vector Store (opcional para MVP)
# PINECONE_API_KEY="..."
# PINECONE_ENVIRONMENT="..."

# Redis (opcional para MVP)
# REDIS_URL="redis://localhost:6379"
```

**Generar SESSION_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Genera Prisma Client e Inicializa la DB

```bash
npm run prisma:generate
npm run prisma:migrate:dev --name init
```

### 4. Inicia el Servidor de Desarrollo

```bash
npm run dev
```

Esto iniciará:
- Shopify CLI con tunnel automático
- React Router dev server con HMR
- Servidor OAuth de Shopify

El CLI imprimirá la URL del tunnel. Ese es el URL que debes configurar en tu Shopify Partner Dashboard.

---

## 🧪 Verificar Instalación

```bash
# 1. Verificar TypeScript
npm run typecheck
# ✅ Debe completar sin errores

# 2. Verificar Build
npm run build
# ✅ Debe completar sin errores

# 3. Verificar Workspaces
npm ls --depth=0
# ✅ Debe mostrar @fluxbot/shopify-admin-app y @fluxbot/storefront-widget
```

---

## 📦 Workspaces npm

Este proyecto usa **npm workspaces** para gestionar el monorepo:

| Workspace | Tipo | Descripción |
|-----------|------|-------------|
| `@fluxbot/shopify-admin-app` | App | Aplicación embebida Shopify (Remix) |
| `@fluxbot/storefront-widget` | App | Widget de chat (Theme Extension) |
| `@fluxbot/ai-orchestrator` | Service | Orquestación de IA y RAG |
| `@fluxbot/ingestion-service` | Service | Ingesta y vectorización |
| `@fluxbot/sync-service` | Service | Sincronización Shopify |
| `@fluxbot/analytics-service` | Service | Analítica y métricas |
| `@fluxbot/shopify-client` | Package | Cliente Shopify GraphQL |
| `@fluxbot/ui` | Package | Componentes UI compartidos |
| `@fluxbot/prompts` | Package | Prompts IA versionados |
| `@fluxbot/shared-types` | Package | Tipos TypeScript compartidos |
| `@fluxbot/config` | Package | Configuración centralizada |
| `@fluxbot/observability` | Package | Logging y tracing |
| `@fluxbot/compliance` | Package | GDPR y privacidad |
| `@fluxbot/testing` | Package | Testing utilities |

---

## 🛠 Tecnologías Principales

- **Runtime:** Node.js 20+
- **Language:** TypeScript 5+
- **Framework:** Remix (React Router 7)
- **UI:** Shopify Polaris
- **Database:** PostgreSQL + Prisma ORM
- **Platform:** Shopify Admin API (GraphQL 2026-01)
- **AI:** OpenAI / Anthropic / Gemini (provider-agnostic)
- **Cache:** Redis (opcional)
- **Vector DB:** Pinecone / Qdrant / PostgreSQL pgvector (TBD)

---

## 📊 Estado de Implementación

Para estado detallado por capability (Fase 0-4), usa solo `STATUS_MATRIX.md`.

Regla de mantenimiento documental:
- `STATUS_MATRIX.md` es canónico.
- `README.md` y documentos `PHASE_*` solo resumen o contexto histórico.

---

## 🐛 Troubleshooting

### Error: "No workspaces found"
```bash
npm install --workspaces
```

### Error: "These scopes are invalid - [read_policies]"
```bash
# En apps/shopify-admin-app/shopify.app.toml usa scopes válidos.
# Recomendado:
# read_products,write_products,read_orders,read_customers,read_content,read_locales,read_online_store_pages
```

### Error: "Cannot find module '@prisma/client'"
```bash
npm run prisma:generate
```

### Error: TypeScript errors en Prisma
```bash
# Regenera Prisma Client
npm run prisma:generate

# Limpia y reinstala
rm -rf node_modules package-lock.json
npm install
```

### Build falla con errores de módulos
```bash
# Limpia build cache
rm -rf shopify-admin-app/build
rm -rf shopify-admin-app/.react-router

# Rebuild
npm run build
```

---

## 📚 Documentación Adicional

- **[documentation/QUICK_START.md](./documentation/QUICK_START.md)** - Setup en 10 minutos
- **[documentation/ARCHITECTURE.md](./documentation/ARCHITECTURE.md)** - Arquitectura completa
- **[STATUS_MATRIX.md](./STATUS_MATRIX.md)** - Estado actual detallado
- **[.github/copilot-instructions.md](./.github/copilot-instructions.md)** - Reglas arquitectónicas
- **[AGENTS.md](./AGENTS.md)** - Guías para asistentes IA

---

## 📄 Licencia

Privado - Todos los derechos reservados

---

**Última actualización:** 2026-03-12  
**Versión:** 0.1.0  
**Estado canónico:** ver `STATUS_MATRIX.md`

---

## 📚 HISTORICAL & MIGRATION DOCS

### Phase 1 Complete
👉 **[documentation/PHASE_1_COMPLETE.md](./documentation/PHASE_1_COMPLETE.md)** (15 KB)
- MVP feature list
- Implementation checklist
- Database schema overview
- Service architecture summary
- Security framework
- Compliance checklist

**Status:** ✅ Complete  
**Read if:** You want the Phase 1 delivery report

### Implementation Guide (Old)
👉 **[documentation/IMPLEMENTATION.md](./documentation/IMPLEMENTATION.md)** (11 KB)
- Task breakdown for Phase 1
- Feature ownership matrix
- Database entity descriptions
- Prisma migration guide
- Service layer specifications

**Status:** ✅ Historical (Phase 1 is done)  
**Read if:** You need detailed background on Phase 1 choices

### Migration Notes
👉 **[documentation/MIGRATION.md](./documentation/MIGRATION.md)** (8 KB)
- Notes on project evolution
- Schema updates applied
- Service refactoring decisions
- Technical debt tracking

**Status:** ✅ Historical  
**Read if:** You're curious about how we got here

---

## 🗂️ FILE REFERENCE MAP

### Project Root Configuration
```
/
├── documentation/QUICK_START.md                  ← START HERE (setup)
├── documentation/ARCHITECTURE.md                 ← Full guide
├── STATUS_MATRIX.md               ← Status report
├── documentation/RELEASE_NOTES.md                ← What's new
├── RESTRUCTURING_SUMMARY.md        ← What changed
├── AGENTS.md                       ← Engineering rules
├── documentation/PHASE_1_COMPLETE.md             ← Phase 1 summary
├── documentation/IMPLEMENTATION.md               ← Phase 1 details (historical)
├── documentation/MIGRATION.md                    ← Evolution notes (historical)
├── .github/
│   └── copilot-instructions.md     ← Copilot rules
└── apps/                           ← Start doing work here
    ├── package.json                ← Workspace root
    ├── app/                        ← Admin app source
    ├── services/                   ← Business logic services
    ├── packages/                   ← Shared packages
    └── infra/                      ← Infrastructure
        └── prisma/
            └── prisma/
                ├── schema.prisma   ← Database schema (reference)
                └── migrations/     ← Migration history
```

---

## 📋 RECOMMENDED READING ORDER

### For Getting Started (30 minutes)
1. **documentation/QUICK_START.md** (10 min) — Get database + env running
2. **documentation/RELEASE_NOTES.md** (5 min) — Understand what you have
3. **documentation/ARCHITECTURE.md** (15 min, skim) — Reference as needed

### For Deep Dive (2 hours)
1. **documentation/ARCHITECTURE.md** (30 min) — Full system design
2. **STATUS_MATRIX.md** (20 min) — Status & metrics
3. **RESTRUCTURING_SUMMARY.md** (20 min) — What changed
4. **documentation/PHASE_1_COMPLETE.md** (20 min) — Phase 1 achievements
5. **AGENTS.md** (30 min) — Engineering guidelines

### For Code Contributions (1 hour)
1. **AGENTS.md** (30 min) — Read quality standards
2. **documentation/ARCHITECTURE.md** (quick reference, 15 min)
3. **RESTRUCTURING_SUMMARY.md** (15 min) — Know the structure

### For Infrastructure/Ops (1 hour)
1. **documentation/QUICK_START.md** (10 min) — Setup instructions
2. **STATUS_MATRIX.md** (20 min) — Deployment readiness
3. **documentation/ARCHITECTURE.md** section on "Deployment Readiness" (15 min)
4. **infra/docker/** folder (15 min) — Docker setup

---

## 🔍 FINDING SPECIFIC INFORMATION

### "How do I..."

| Question | Document | Section |
| --- | --- | --- |
| ...start the project? | documentation/QUICK_START.md | Steps 1-4 |
| ...understand the architecture? | documentation/ARCHITECTURE.md | Sections 2-3 |
| ...set up PostgreSQL? | documentation/QUICK_START.md | Step 1 |
| ...configure environment? | documentation/QUICK_START.md | Step 2 |
| ...run migrations? | documentation/QUICK_START.md | Step 3 |
| ...add a new service? | documentation/ARCHITECTURE.md | Modules section |
| ...understand the database? | documentation/ARCHITECTURE.md | Section 9 |
| ...deploy to production? | STATUS_MATRIX.md | Deployment section |
| ...write code that follows rules? | AGENTS.md | All sections |
| ...see what changed? | RESTRUCTURING_SUMMARY.md | All sections |
| ...check project status? | STATUS_MATRIX.md | All sections |

### "I want to know about..."

| Topic | Document |
| --- | --- |
| AI/LLM integration | documentation/ARCHITECTURE.md (AI/ML Stack) |
| Shopify integration | documentation/ARCHITECTURE.md (Shopify Integration) |
| Database design | documentation/ARCHITECTURE.md + schema.prisma |
| Security & compliance | documentation/ARCHITECTURE.md + AGENTS.md |
| Services architecture | documentation/ARCHITECTURE.md (Modules) |
| Workspace structure | RESTRUCTURING_SUMMARY.md |
| Build & deployment | STATUS_MATRIX.md |
| Phase planning | documentation/PHASE_1_COMPLETE.md |
| Code quality standards | AGENTS.md |

---

## 📊 DOCUMENTATION STATISTICS

| Document | Size | Time | Focus |
| --- | --- | --- | --- |
| documentation/QUICK_START.md | 7 KB | 10 min | Setup & first run |
| documentation/ARCHITECTURE.md | 16 KB | 20-30 min | Full system design |
| RESTRUCTURING_SUMMARY.md | 13 KB | 15 min | What changed |
| STATUS_MATRIX.md | 14 KB | 10-15 min | Status snapshot |
| documentation/RELEASE_NOTES.md | 8 KB | 5-10 min | Overview |
| AGENTS.md | 18 KB | 30 min | Engineering rules |
| documentation/PHASE_1_COMPLETE.md | 15 KB | 15 min | MVP delivery |
| documentation/IMPLEMENTATION.md | 11 KB | 15 min | Phase 1 details |
| documentation/MIGRATION.md | 8 KB | 10 min | Evolution notes |
| **TOTAL** | **~110 KB** | **2-3 hours** | Full coverage |

---

## ✅ CHECKLIST: What Each Doc Covers

### documentation/QUICK_START.md
- ✅ PostgreSQL setup
- ✅ Environment configuration
- ✅ Database migrations
- ✅ Starting dev server
- ✅ Verification steps

### documentation/ARCHITECTURE.md
- ✅ Project vision
- ✅ Monorepo structure
- ✅ Technology stack
- ✅ API documentation
- ✅ Data flow
- ✅ Security & compliance
- ✅ Troubleshooting

### RESTRUCTURING_SUMMARY.md
- ✅ Before/after comparison
- ✅ File movements
- ✅ Configuration changes
- ✅ Code modifications
- ✅ Breaking changes
- ✅ Migration impact

### STATUS_MATRIX.md
- ✅ Executive summary
- ✅ Completion checklist
- ✅ Build status
- ✅ Database schema
- ✅ Deployment readiness
- ✅ Quality metrics

### documentation/RELEASE_NOTES.md
- ✅ Quick start commands
- ✅ File structure reference
- ✅ Common tasks
- ✅ Performance metrics
- ✅ Troubleshooting

### AGENTS.md
- ✅ Quality standards
- ✅ Architecture rules
- ✅ Code organization
- ✅ Security guidelines
- ✅ Testing requirements

---

## 🔗 CROSS-REFERENCES

### Services Layer
- **Code location:** `/services/*/src/*.service.ts`
- **Design doc:** documentation/ARCHITECTURE.md (Module section)
- **Example:** Services for AI, ingestion, sync, analytics
- **Next steps:** Ver `STATUS_MATRIX.md` para ownership actual y trabajo incremental

### Database
- **Schema location:** `/infra/prisma/schema.prisma`
- **Design doc:** documentation/ARCHITECTURE.md (Database section)
- **Status:** documentation/PHASE_1_COMPLETE.md
- **Setup:** documentation/QUICK_START.md

### Frontend
- **Code location:** `/apps/shopify-admin-app/app/routes/`
- **Design doc:** documentation/ARCHITECTURE.md (Delivery Layer)
- **Status:** 8 dashboard pages ready
- **Next steps:** Ver `STATUS_MATRIX.md` para follow-up actual del frontend/runtime

### Compliance
- **Framework location:** `/packages/compliance/`
- **Rules:** AGENTS.md (Security section)
- **Guidelines:** documentation/ARCHITECTURE.md (Security & Compliance)

---

## 🎯 QUICK FLOWS

### "I just arrived here"
```
1. Read documentation/QUICK_START.md (10 min)
2. Run PostgreSQL + npm run dev
3. Read documentation/ARCHITECTURE.md overview
4. Explore admin dashboard
5. Read rest of docs as needed
```

### "I'm assigned a task"
```
1. Find relevant section in documentation/ARCHITECTURE.md
2. Check AGENTS.md for code standards
3. Look at related service in /services/
4. Implement following rules
5. Test and commit
```

### "There's a problem"
```
1. Check STATUS_MATRIX.md (known limitations)
2. Check documentation/ARCHITECTURE.md troubleshooting
3. Check documentation/QUICK_START.md troubleshooting
4. Check relevant service code
5. File an issue with details
```

### "I want to add a feature"
```
1. Check documentation/PHASE_1_COMPLETE.md (what's done)
2. Check STATUS_MATRIX.md (what's next)
3. Read documentation/ARCHITECTURE.md (relevant section)
4. Follow AGENTS.md standards
5. Implement in appropriate layer (routes, services, etc)
```

---

## 📞 GETTING HELP

### Documentation Questions
→ Re-read the relevant section with fresh eyes

### Code Questions
→ Check AGENTS.md + documentation/ARCHITECTURE.md + service examples

### Architecture Questions
→ Read documentation/ARCHITECTURE.md fully

### Setup Problems
→ Check documentation/QUICK_START.md troubleshooting section

### Breaking Changes
→ Check RESTRUCTURING_SUMMARY.md breaking changes

### What Changed
→ Check RESTRUCTURING_SUMMARY.md or STATUS_MATRIX.md

---

## 📝 NOTES

All documentation is:
- ✅ Up-to-date (as of March 8, 2025)
- ✅ Complementary (each doc has a purpose)
- ✅ Cross-referenced (easy to navigate)
- ✅ Actionable (includes commands and examples)
- ✅ Searchable (organized with clear sections)

---

## 🚀 YOU'RE READY!

Pick a document above and get started. Most people begin with **documentation/QUICK_START.md** for setup, then read slowly through **documentation/ARCHITECTURE.md** to understand the system.

**Next:** 👉 [documentation/QUICK_START.md](./documentation/QUICK_START.md)

---

**Last Updated:** 2025-03-08  
**Total Docs:** 9 files  
**Total Pages:** ~110 KB  
**Estimated Read Time:** 2-3 hours (all), 10 minutes (quick path)
