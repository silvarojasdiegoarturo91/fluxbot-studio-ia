# FluxBot Studio IA - Shopify App

Esta es una aplicación de Shopify diseñada para integrar un chatbot con IA personalizable que se conecta a un servicio externo.

## Características
- **Personalización**: Permite al usuario configurar el nombre y el mensaje de bienvenida del chatbot.
- **Integración API**: Conecta con un servicio de API externo para procesar las consultas de IA.
- **Basado en Remix**: Utiliza el stack tecnológico oficial de Shopify.

## Estructura del Proyecto
- `app/routes/app._index.tsx`: Interfaz principal de configuración y prueba de API.
- `app/services/chatbot.server.ts`: Lógica para llamar a tu servicio de API externo.
- `app/shopify.server.ts`: Configuración de la autenticación de Shopify.
- `prisma/schema.prisma`: Almacenamiento de sesiones.

## Cómo empezar
1. Instala las dependencias:
   ```bash
   npm install
   ```
2. Configura tus variables de entorno en un archivo `.env`:
   ```env
   SHOPIFY_API_KEY=tu_api_key
   SHOPIFY_API_SECRET=tu_api_secret
   SCOPES=write_products,read_orders
   SHOPIFY_APP_URL=https://tu-url.ngrok-free.app
   CHATBOT_API_URL=https://tu-servicio-de-ia.com/api
   CHATBOT_API_KEY=tu_token_de_ia
   ```
3. Ejecuta el modo desarrollo:
   ```bash
   npm run dev
   ```

## Subir a GitHub
Para subir los cambios a tu repositorio:
```bash
git push -u origin main
```
