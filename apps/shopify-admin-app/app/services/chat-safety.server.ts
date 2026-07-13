export type BasicIntent =
  | "greeting"
  | "product_question"
  | "order_question"
  | "faq_question"
  | "unknown";

const GREETING_REGEX =
  /\b(hola|buenas|buenos dias|buen día|hello|hi|hey|good morning|good afternoon|good evening)\b/i;
const PRODUCT_REGEX =
  /\b(producto|productos|catalogo|catálogo|que venden|qué venden|que tienen|qué tienen|precio|precios|recomienda|recommend|product|products|catalog)\b/i;
const ORDER_REGEX =
  /\b(pedido|pedidos|orden|order|orders|envio|envío|shipping|devolucion|devolución|return|refund|seguimiento|tracking)\b/i;
const FAQ_REGEX =
  /\b(ayuda|help|faq|pregunta|preguntas|horario|contacto|soporte|support|politica|política|policy|policies)\b/i;
const BLOCKED_LEGACY_REPLIES = new Set([
  "Sorry, I had trouble processing that. Please try again.",
  "I apologize, but I encountered an issue processing your request. Please try again.",
]);

function normalize(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}

export function detectBasicIntent(message: string): BasicIntent {
  const normalized = normalize(message);
  if (!normalized) return "unknown";
  if (GREETING_REGEX.test(normalized)) return "greeting";
  if (PRODUCT_REGEX.test(normalized)) return "product_question";
  if (ORDER_REGEX.test(normalized)) return "order_question";
  if (FAQ_REGEX.test(normalized)) return "faq_question";
  return "unknown";
}

export function isSimpleMessage(message: string): boolean {
  const normalized = normalize(message);
  if (!normalized) return true;
  const words = normalized.split(" ").filter(Boolean);
  return words.length <= 4 && normalized.length <= 40;
}

export function safeGreetingMessage(): string {
  return "Hola 👋 Estoy aquí para ayudarte. ¿Qué necesitas?";
}

export function safeClarificationMessage(): string {
  return "Claro, cuéntame un poco más y te ayudo con la opción correcta.";
}

export function safeFallbackMessage(intent: BasicIntent = "unknown", hasCatalog = true): string {
  if (intent === "greeting") return safeGreetingMessage();
  if (intent === "product_question") {
    if (!hasCatalog) {
      return "Puedo ayudarte con productos, pero ahora no tengo catálogo disponible en este canal. Si quieres, te ayudo a buscar por categoría, uso o presupuesto.";
    }
    return "Puedo ayudarte con productos. Cuéntame qué tipo de producto buscas y te recomiendo algunas opciones.";
  }
  if (intent === "order_question") {
    return "Puedo ayudarte con pedidos. Compárteme el número de pedido y el correo usado en la compra, y te guío desde ahí.";
  }
  if (intent === "faq_question") {
    return "Claro, puedo ayudarte con productos, pedidos, envíos y políticas. ¿Qué te gustaría consultar?";
  }
  return safeClarificationMessage();
}

export function sanitizeAssistantMessage(message: string, intent: BasicIntent = "unknown"): string {
  const normalized = normalize(message);
  if (!normalized || BLOCKED_LEGACY_REPLIES.has(normalized)) {
    return safeFallbackMessage(intent);
  }
  return normalized;
}
