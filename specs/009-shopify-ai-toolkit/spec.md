# Spec 009: Shopify AI Toolkit Integration

## Estado: IMPLEMENTADO ✅
**Fecha:** 2026-05-07

---

## Resumen

Integración completa del Shopify AI Toolkit en el proyecto. Incluye Dev MCP, Storefront MCP, Admin MCP (benwmerritt), agent skills, y configuración para todos los agentes de IA (Copilot, Codex, Cursor, Gemini CLI, Claude Code).

---

## Arquitectura: 3 capas del Toolkit

### Capa 1 — Dev MCP (`@shopify/dev-mcp`)
Para desarrolladores con asistentes de IA:
- Busca documentación live de Shopify.dev
- Introspección del esquema GraphQL Admin API
- Valida queries/componentes antes de ejecutar
- Ejecuta operaciones Admin via `shopify store execute`

**Endpoint:** Local (no requiere auth para docs/schema)  
**Para store execute:** requiere `shopify auth login`

### Capa 2 — Storefront MCP (UCP)
Para agentes de compra que interactúan con la tienda:

```
https://quickstart-c8cc9986.myshopify.com/api/mcp
```

**Tools disponibles (verificados ✅):**
- `search_catalog` — búsqueda de productos en lenguaje natural
- `get_cart` — obtener carrito actual
- `update_cart` — añadir/quitar/modificar items, aplicar descuentos
- `search_shop_policies_and_faqs` — políticas, preguntas, horarios
- `get_product_details` — detalles de producto por ID

**Test:**
```bash
curl -s -X POST "https://quickstart-c8cc9986.myshopify.com/api/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Capa 3 — Admin MCP (benwmerritt/shopify-mcp)
Para operaciones de tienda desde el asistente de IA:
- CRUD de productos, variantes, colecciones
- Gestión de pedidos y clientes
- Metafields, redirects, inventario

---

## Archivos de configuración instalados

### Por herramienta de IA:

| Herramienta | Config | Estado |
|-------------|--------|--------|
| VS Code | `~/.config/Code/User/mcp.json` | ✅ |
| Cursor (global shop-chat) | `~/Documents/shop-chat-agent/.cursor/mcp.json` | ✅ |
| Cursor (front) | `.cursor/mcp.json` | ✅ |
| Cursor (back) | `fluxbot-studio-back-ia/.cursor/mcp.json` | ✅ |
| Claude Code (front) | `.mcp.json` | ✅ |
| Claude Code (back) | `fluxbot-studio-back-ia/.mcp.json` | ✅ |
| GitHub Copilot CLI | Configurado via `/mcp` | ✅ |
| Todos los agentes | `.agents/skills/` (34 skills) | ✅ |

### Variables de entorno para Dev MCP:
```json
{
  "POLARIS_UNIFIED": "true",
  "LIQUID": "true"
}
```

---

## Skills instaladas (`.agents/skills/`)

### Shopify AI Toolkit oficiales (19):
- `shopify-admin`, `shopify-app-store-review`, `shopify-custom-data`
- `shopify-customer`, `shopify-dev`, `shopify-functions`, `shopify-hydrogen`
- `shopify-liquid`, `shopify-onboarding-dev`, `shopify-onboarding-merchant`
- `shopify-partner`, `shopify-payments-apps`, `shopify-polaris-admin-extensions`
- `shopify-polaris-app-home`, `shopify-polaris-checkout-extensions`
- `shopify-polaris-customer-account-extensions`, `shopify-polaris-ui`
- `shopify-pos-ui`, `shopify-storefront-graphql`, `shopify-use-shopify-cli`

### Custom del proyecto (15+):
- `admin-ui-ux`, `chatbot-admin-dashboard`, `fluxbot-architecture`
- `implementation-rules`, `onboarding-flow`, `responsive-layout-guard`
- `shopify-admin-app`, `ui-ux-generic`, `visual-consistency-review`
- `speckit-git-*` (commit, feature, initialize, remote, validate)

---

## Prácticas del toolkit a seguir

### 1. Desarrollo con Dev MCP
Al abrir Cursor/VS Code con el proyecto, el Dev MCP permite al asistente:
- Escribir queries GraphQL con campos correctos (no hallucina)
- Validar componentes Polaris contra el esquema real
- Buscar en la documentación más reciente

**Setup único (interactivo):**
```bash
shopify auth login
```

### 2. Store Execute
Una vez autenticado, el Dev MCP puede ejecutar:
```
"muéstrame los primeros 10 productos de la tienda"
→ [el agente llama a shopify store execute internamente]
→ resultados reales de la tienda
```

### 3. Storefront MCP para el chat widget
El `shop-chat-agent` ya usa el Storefront MCP de la tienda.
Flujo 90 días recomendado:
- Semanas 1-2: Personalizar prompts y UI
- Semanas 3-4: QA interno (cart, catalog, order status)
- Semanas 5-8: Soft launch a segmento pequeño
- Semanas 9-13: Refinar con transcripts reales

### 4. Calidad de datos de producto
Los agentes rankean productos igual que SEO: título, descripción, specs técnicas, opciones, señales de inventario. Datos pobres → derankeado en agent discovery.

---

## UCP (Universal Commerce Protocol)

La tienda ya es UCP-compliant via Storefront MCP.
Significa que cualquier agente compatible (ChatGPT, Claude, Gemini) puede:
1. **Discovery** — buscar productos
2. **Checkout** — crear carrito y completar compra
3. **Orders** — verificar estado de pedidos

No requiere integración adicional por agente. Un estándar, múltiples consumidores.

---

## Referencias
- Guía: https://www.revize.app/blog/shopify-ai-toolkit-guide
- Dev MCP: https://github.com/Shopify/shopify-ai-toolkit
- Admin MCP: https://www.npmjs.com/package/shopify-mcp
- UCP spec: https://shopify.dev/docs/apps/build/storefront-mcp
