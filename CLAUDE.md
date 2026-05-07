# CLAUDE.md — Instrucciones permanentes para Claude Code

## ⚠️ GUÍA OBLIGATORIA

Antes de cualquier tarea en este proyecto, consulta y sigue:
**📖 https://www.revize.app/blog/shopify-ai-toolkit-guide**

Contenido completo disponible en: `.agents/skills/shopify-ai-toolkit-guide/skill.md`

Esta guía es la referencia principal para:
- Escribir y estructurar tests de integración
- Queries GraphQL Admin API
- Integración con MCP servers (Dev MCP, Storefront MCP, Admin MCP)
- Desarrollo del chat widget / agente de compra
- Calidad de datos de producto para agent discovery (UCP)

---

## Reglas críticas del proyecto

### Tests
```
- SIEMPRE fechas dinámicas: new Date() con offsets, NUNCA hardcodeadas
- SIEMPRE filtrar por domain específico para aislar datos de test
- DB de test: postgresql://test:test@localhost:5433/test_db
- DB de prod: postgresql://fluxbot:dev_password@localhost:5432/fluxbot_dev
- Levantar DB test: ./scripts/test-db.sh start
```

### GraphQL Admin API
```
- Validar campos con: shopify store execute --store quickstart-c8cc9986.myshopify.com --query '...'
- Dev MCP disponible en todos los configs MCP (.mcp.json en raíz del proyecto)
- NO alucinés campos — introspecciona el esquema real
```

### Storefront MCP (agente de compra)
```
- Endpoint: https://quickstart-c8cc9986.myshopify.com/api/mcp
- Tools: search_catalog, get_cart, update_cart, search_shop_policies_and_faqs, get_product_details
- Sin autenticación requerida
```

### MCP Configs instalados
- `.mcp.json` — Claude Code (este archivo aplica aquí)
- `.cursor/mcp.json` — Cursor
- `~/.config/Code/User/mcp.json` — VS Code global
- Servidores: `shopify-dev-mcp` + `shopify` (Admin CRUD)

---

## Arquitectura del proyecto

Ver `AGENTS.md` para la arquitectura completa front/back.

## Skills disponibles
Ver `.agents/skills/` — 35 skills instaladas (19 oficiales Shopify + 16 custom del proyecto).
