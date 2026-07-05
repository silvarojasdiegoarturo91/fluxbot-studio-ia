# CLAUDE.md — Instrucciones permanentes para Claude Code

## ⚠️ GUÍA OBLIGATORIA

Antes de cualquier tarea en este proyecto, consulta y sigue:
**📖 https://weaverse.io/blogs/shopify-ai-toolkit-dev-mcp-hydrogen-2026**

Para setup de Claude Code, sigue también:
**📖 https://www.fudge.ai/guides/shopify-ai-toolkit-claude-code-setup/**

**📖 https://wearepresta.com/building-shopify-apps-with-ai-in-2026-the-ultimate-guide-to-the-shopify-ai-toolkit/**

**📖 https://testrigor.com/shopify-testing/**

**REFERENCIAS COMPLETAS:**
- https://github.com/toilahuongg/shopify-agents-kit
- https://weaverse.io/blogs/shopify-ai-toolkit-dev-mcp-hydrogen-2026
- https://www.fudge.ai/guides/shopify-ai-toolkit-claude-code-setup/
- https://wearepresta.com/building-shopify-apps-with-ai-in-2026-the-ultimate-guide-to-the-shopify-ai-toolkit/
- https://testrigor.com/shopify-testing/

Referencia local obligatoria: `.agents/skills/shopify-agents-kit-mandatory/skill.md`
`.agents/skills/fudge-claude-code-setup/skill.md`
`.agents/skills/wearepresta-shopify-ai-toolkit/skill.md`
`.agents/skills/testrigor-shopify-testing/skill.md`

Esta guía es la referencia principal para:
- Escribir y estructurar tests de integración
- Queries GraphQL Admin API
- Integración con MCP servers (Dev MCP, Storefront MCP, Admin MCP)
- Desarrollo del chat widget / agente de compra
- Calidad de datos de producto para agent discovery (UCP)
- Criterio de verdad cuando exista conflicto con otras guías
- Telemetría, scopes mínimos y reglas de store ops live de la guía Fudge
- La guía WeArePresta cubre flujo de plugin, MCP y validación para apps AI
- La guía testRigor cubre la superficie amplia de testing del ecosistema Shopify
- OpenSpec docs hook: los cambios en documentación crean tareas `planned` vía `.githooks/post-commit`

## 🔁 Regla Git obligatoria (todos los agentes)

- Activar hooks del repo: `npm run githooks:install` (`core.hooksPath=.githooks`).
- Ningún cambio se considera cerrado si no quedó **commiteado y empujado** al remoto del branch.
- Si el remoto avanzó, bajar cambios antes de empujar con `git fetch` + `git pull --rebase --autostash`.
- Si falla `fetch`, `pull --rebase` o `push`, la tarea queda abierta/bloqueada hasta resolverlo.
- Prohibido usar `--no-verify`.
- Prohibido cerrar tareas con worktree sucio.

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
- Validar campos con: shopify store execute --store ${SHOPIFY_SHOP:-tu-tienda.myshopify.com} --query '...'
- Dev MCP disponible en todos los configs MCP (.mcp.json en raíz del proyecto)
- NO alucinés campos — introspecciona el esquema real
```

### Storefront MCP (agente de compra)
```
- Endpoint: https://<active-dev-store>.myshopify.com/api/mcp
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
