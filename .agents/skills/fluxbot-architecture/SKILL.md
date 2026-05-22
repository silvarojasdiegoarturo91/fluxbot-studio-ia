---
name: fluxbot-architecture
description: Arquitectura general de FluxBot Studio - Comunicacion Frontend <-> Backend IA
license: MIT
compatibility: opencode
metadata:
  audience: developers
  type: architecture
---

## Arquitectura FluxBot Studio

### Repositorios

1. **fluxbot-studio-ia-shopify** (`~/Documents/fluxbot-studio-ia-shopify`)
   - Frontend: App de Admin Shopify
   - UI: Shopify Polaris + React
   - Lama llamadas al backend IA via HTTP

2. **fluxbot-studio-back-ia** (`~/Documents/fluxbot-studio-back-ia`)
   - Backend: API de IA
   - Chat orchestration, RAG, embeddings, triggers
   - Provider-agnostic AI

### Comunicacion

```
┌─────────────────────────────────────────┐
│        FLUXBOT-STUDIO-IA               │
│    (Frontend Shopify App - Remix)       │
└────────────────┬────────────────────────┘
                 │ HTTP REST
                 ▼
┌─────────────────────────────────────────┐
│      FLUXBOT-STUDIO-BACK-IA            │
│    (Backend IA)                        │
└─────────────────────────────────────────┘
```

### Regla fundamental

**El backend NO toma decisiones de negocio.** Solo procesa:
- Mensajes de chat → Respuestas IA
- Eventos de comportamiento → Intenciones
- Queries → Resultados RAG
- Contexto → Triggers proactivos

El frontend decide qué mostrar y qué acciones tomar.

### Proveedores IA (en Backend)

- OpenAI
- Anthropic
- Gemini

El frontend usa `iaClient` para comunicarse con el backend.
