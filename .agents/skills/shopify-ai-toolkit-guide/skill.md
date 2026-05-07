# INSTRUCCIÓN PERMANENTE: Shopify AI Toolkit Guide

> **OBLIGATORIO**: Todo agente de IA (Copilot, Codex, Cursor, Gemini CLI, Claude Code) que trabaje en este proyecto DEBE seguir esta guía como referencia principal para tests, desarrollo, MCP, agentes de compra y cualquier integración Shopify.
>
> Fuente oficial: https://www.revize.app/blog/shopify-ai-toolkit-guide

---

## Qué es el Shopify AI Toolkit

El Shopify AI Toolkit NO es una sola cosa. Es un stack de 3 capas:

1. **Dev MCP** (`@shopify/dev-mcp`) — para desarrolladores con asistentes de IA
2. **MCP servers para agentes de compra** — Storefront MCP, Catalog MCP, Customer Accounts MCP
3. **Universal Commerce Protocol (UCP)** — protocolo abierto de comercio agéntico

---

## REGLAS OBLIGATORIAS para este proyecto

### Al escribir tests de integración Shopify:
- SIEMPRE usar datos dinámicos basados en `new Date()` — NUNCA fechas hardcodeadas
- SIEMPRE filtrar por `domain: { in: [...specificDomains] }` para aislar datos de test
- SIEMPRE usar la DB de test (`postgresql://test:test@localhost:5433/test_db`)
- NUNCA usar la DB de producción en tests

### Al escribir queries GraphQL Admin API:
- SIEMPRE validar campos contra el esquema real via Dev MCP antes de ejecutar
- USAR `shopify store execute --store quickstart-c8cc9986.myshopify.com --query '...'` para verificar
- El Dev MCP introspecciona el esquema real → NO alucina campos que no existen

### Al implementar funcionalidades de agente de compra:
- El Storefront MCP de la tienda está en: `https://quickstart-c8cc9986.myshopify.com/api/mcp`
- Tools disponibles: `search_catalog`, `get_cart`, `update_cart`, `search_shop_policies_and_faqs`, `get_product_details`
- NO requiere autenticación para estas operaciones

### Al construir el chat widget (shop-chat-agent):
- Flujo recomendado por la guía: semanas 1-2 (prompts/UI), 3-4 (QA interno), 5-8 (soft launch), 9-13 (refinamiento)
- Siempre hacer QA interno antes de exponer a clientes → los agentes pueden recomendar productos que no existen
- Medir "containment rate" (% de consultas resueltas sin escalado humano)

### Sobre calidad de datos de producto (CRÍTICO para agent discovery):
- Título, descripción, specs técnicas, opciones, inventario = ROI más alto para UCP
- Datos pobres → derankeado por agentes igual que en SEO
- Los agentes evalúan cada campo, no pueden "scrollear" contenido thin

---

## Los 4 MCP Servers (referencia rápida)

| Server | Quién lo usa | Auth | Uso principal |
|--------|-------------|------|---------------|
| **Dev MCP** | Desarrolladores (Cursor/VSCode/etc.) | Ninguna (local) | Docs, schema introspection, store execute |
| **Storefront MCP** | Agentes de compra | Ninguna | Búsqueda, carrito, políticas, estado pedidos |
| **Catalog MCP** | Agentes third-party | JWT (Dev Dashboard) | Búsqueda cross-merchant |
| **Customer Accounts MCP** | Agentes autenticados | OAuth Shopify | Historial pedidos, devoluciones |

---

## UCP (Universal Commerce Protocol)

Las 3 capacidades core que el protocolo define:

1. **Discovery** — buscar productos → implementado via Catalog MCP + Storefront MCP
2. **Checkout** — crear sesión de checkout, pago → Storefront MCP cart tools + Checkout Kit
3. **Orders** — tracking, fulfillment, devoluciones → Customer Accounts MCP + Admin APIs

**La tienda es UCP-compliant por defecto.** Cualquier agente UCP (ChatGPT, Claude, Gemini) puede:
- Buscar catálogo
- Crear carrito y completar compra
- Verificar estado de pedidos

---

## Setup del Dev MCP (para nuevos entornos)

```bash
# 1. Auth para store execute
shopify store auth \
  --store quickstart-c8cc9986.myshopify.com \
  --scopes read_products,read_orders,read_customers,read_inventory

# 2. Test que funciona
shopify store execute \
  --store quickstart-c8cc9986.myshopify.com \
  --query '{ shop { name } products(first: 5) { nodes { title } } }'

# 3. Test Storefront MCP
curl -s -X POST "https://quickstart-c8cc9986.myshopify.com/api/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python3 -m json.tool
```

---

## Configuraciones MCP instaladas

```json
{
  "shopify-dev-mcp": {
    "command": "npx",
    "args": ["-y", "@shopify/dev-mcp@latest"],
    "env": { "POLARIS_UNIFIED": "true", "LIQUID": "true" }
  },
  "shopify": {
    "command": "npx",
    "args": ["shopify-mcp", "--accessToken", "<token>", "--domain", "quickstart-c8cc9986.myshopify.com"]
  }
}
```

Archivos de config: `.cursor/mcp.json`, `.mcp.json` (Claude Code), `~/.config/Code/User/mcp.json` (VS Code)

---

## Productividad del Dev MCP (según la guía)

**Acelera (40-60% más rápido):**
- Boilerplate GraphQL queries
- Scaffold de webhook handlers
- Layouts de componentes Polaris
- Automatización de workflows CLI

**NO acelera:**
- Decisiones arquitectónicas
- Debugging cross-sistema
- Optimización de performance
(porque estas necesitan contexto que el Dev MCP no expone)

---

## Fuente y referencias

- **Guía principal**: https://www.revize.app/blog/shopify-ai-toolkit-guide
- **GitHub Shopify AI Toolkit**: https://github.com/Shopify/shopify-ai-toolkit
- **Admin MCP (benwmerritt)**: https://www.npmjs.com/package/shopify-mcp
- **UCP spec detallada**: https://www.revize.app/blog/universal-commerce-protocol-ucp-shopify-developer-guide
