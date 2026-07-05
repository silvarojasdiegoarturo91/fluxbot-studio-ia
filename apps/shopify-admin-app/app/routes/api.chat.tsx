/**
 * Shopify Admin App - Chat API Route
 * Handles chat requests from the admin dashboard
 */

import { json, type ActionFunction } from '@remix-run/server-runtime';
import { z } from 'zod';

const chatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
});

/**
 * POST /api/chat
 * Send a message to the chatbot from Shopify Admin
 */
export const action: ActionFunction = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { message, conversationId } = chatRequestSchema.parse(body);

    // Get shop domain from session or request headers
    const shopDomain = request.headers.get('x-shop-domain') || 'unknown';
    const accessToken = request.headers.get('x-shop-access-token') || '';

    if (!shopDomain || !accessToken) {
      return json(
        { error: { code: 'UNAUTHORIZED', message: 'Falta autenticación de la tienda' } },
        { status: 401 }
      );
    }

    // Call backend IA service
    const backendResponse = await fetch('http://localhost:3001/api/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shop-Domain': shopDomain,
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message,
        conversationId,
        context: {
          shopId: shopDomain,
          channel: 'SHOPIFY_PROXY',
          locale: 'es',
        },
      }),
    });

    if (!backendResponse.ok) {
      const errorBody = await backendResponse.json().catch(() => ({}));
      console.error('Backend chat error:', errorBody);

      return json(
        {
          error: {
            code: 'BACKEND_ERROR',
            message: 'Error en el servicio de chat del backend',
          },
        },
        { status: backendResponse.status || 500 }
      );
    }

    const data = await backendResponse.json();

    return json(
      {
        data: {
          message: data.data?.message || data.message || 'Sin respuesta',
          conversationId: data.conversationId || conversationId,
          metadata: data.data?.metadata || {},
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Chat API error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';

    if (error instanceof z.ZodError) {
      return json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Solicitud inválida',
            details: error.errors,
          },
        },
        { status: 400 }
      );
    }

    return json(
      {
        error: {
          code: 'CHAT_ERROR',
          message: 'Lo siento, tuve un problema procesando tu mensaje. Por favor, intenta nuevamente.',
        },
      },
      { status: 500 }
    );
  }
};
