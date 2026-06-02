# Solucion a ERR_NGROK_3200 en entornos de desarrollo Shopify

## Problema

El error `ERR_NGROK_3200` aparece cuando Shopify todavia intenta abrir una URL vieja de ngrok. En este proyecto el flujo por defecto no debe usar ngrok: debe usar `shopify app dev` con el tunel nativo de Shopify CLI y la tienda seleccionada explicitamente.

La causa mas comun era que `.env.local` fijaba `SHOPIFY_SHOP=quickstart-c8cc9986.myshopify.com` y pisaba la tienda pasada por linea de comandos. El launcher ahora da prioridad a `--shop`, `SHOPIFY_SHOP` o `SHOPIFY_DEV_STORE_URL` definidos en la terminal.

## Solución recomendada

1. **Siempre reinicia el entorno con:**
   ```bash
   scripts/dev-shopify-admin-local.sh --shop=tu-tienda.myshopify.com
   ```
   Esto limpia el dev preview viejo de esa tienda, fuerza `--store tu-tienda.myshopify.com` en Shopify CLI y genera una URL valida.

   Si varias tiendas quedaron apuntando a un tunel viejo:
   ```bash
   scripts/dev-shopify-admin-local.sh --shops=tienda-a.myshopify.com,tienda-b.myshopify.com
   ```
   El script limpia el preview viejo de todas y levanta Shopify CLI usando la primera como tienda activa.

2. **Verifica la URL:**
   - La terminal imprimirá un enlace `Install app` o `Using URL`. Usa siempre ese enlace actualizado para instalar la app en la tienda de desarrollo.

3. **Mantén el proceso activo:**
   - No cierres la terminal donde corre el script. Si se cierra, el tunel de desarrollo dejara de funcionar.

4. **Si el error persiste:**
   - Vuelve a ejecutar el script con `--shop=tu-tienda.myshopify.com`.
   - Confirma que el log muestra `Using dev store: tu-tienda.myshopify.com`.

## Notas para Codex y otros agentes
- Siempre usa el script oficial para levantar el entorno.
- No reutilices URLs antiguas de tuneles.
- Documenta cualquier error de túnel en este archivo y actualiza el procedimiento si cambia el flujo de Shopify CLI.

---

> Última actualización: 2026-05-31
> Responsable: IA + Codex
