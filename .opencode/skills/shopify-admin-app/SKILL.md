---
name: shopify-admin-app
description: Frontend Shopify Admin para FluxBot Studio - App Remix con Polaris, App Bridge, integracion con backend IA
license: MIT
compatibility: opencode
metadata:
  audience: developers
  project: fluxbot-studio-ia
  type: frontend-shopify
---

## Contexto

Este proyecto es el **Frontend** de la aplicación Shopify FluxBot Studio. Se comunica con el backend de IA (`fluxbot-studio-back-ia`).

## Arquitectura

```
fluxbot-studio-ia (Frontend) → HTTP REST → fluxbot-studio-back-ia (Backend IA)
```

## Responsabilidades de ESTE proyecto

- UI Admin con Shopify Polaris
- Widget de Chat en storefront
- OAuth e instalación Shopify
- Sincronización de catálogo
- Gestión de consentimiento
- Analytics (frontend)
- Escalamiento a humano
- Commerce actions

## NO hacer en este proyecto

- NO implementar lógica de LLMs o embeddings
- NO llamar directamente a OpenAI/Anthropic/Gemini (usar iaClient)
- NO hardcodear API keys

## Stack

- TypeScript
- React
- Shopify Polaris
- App Bridge
- TanStack Query
- Remix
- Zod

## Comunicacion con Backend IA

```typescript
import { iaClient } from './services/ia-backend.client';

const response = await iaClient.chat.send({
  message: 'Hola, quiero comprar algo',
  conversationId: 'conv-123',
  context: { shopId: 'shop-1', locale: 'es' }
}, shopDomain);
```

## Variables de entorno

```
IA_BACKEND_URL=http://localhost:3001
IA_BACKEND_API_KEY=your_ia_backend_api_key
```

## Testing obligatorio

Ejecutar `npm test` después de cada cambio. Tests de Fase 0 deben pasar siempre:

```bash
cd apps/shopify-admin-app
npm test
# Expected: 68/68 tests passing
```

## Credenciales de desarrollo

- Contraseña tienda: `sialte`
