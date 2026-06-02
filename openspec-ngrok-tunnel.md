# OpenSpec: Manejo de tuneles en desarrollo Shopify

## Requisito

Toda app de Shopify Admin en desarrollo debe:
- Usar el script `scripts/dev-shopify-admin-local.sh` para levantar el entorno.
- Usar el tunel nativo de Shopify CLI, no ngrok como flujo por defecto.
- Pasar la tienda de desarrollo con `--shop=tienda.myshopify.com` o con `SHOPIFY_SHOP` / `SHOPIFY_DEV_STORE_URL`.
- Regenerar el dev preview en cada reinicio y usar la URL impresa por Shopify CLI.
- Documentar y seguir el procedimiento de solución de errores de túnel (ver `ERR_NGROK_3200_SOLUCION.md`).
- No reutilizar URLs antiguas.

## Criterio de éxito
- La app es accesible desde cualquier tienda de desarrollo autorizada usando la URL actual.
- Codex y otros agentes pueden levantar el entorno sin error de túnel.

---

> Última actualización: 2026-05-31
> Responsable: IA + Codex
