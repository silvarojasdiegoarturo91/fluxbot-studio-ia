/**
 * Localization Service - Phase 4
 *
 * Handles multi-language support including:
 * - Language auto-detection
 * - String translation lookup
 * - Locale-aware formatting (dates, prices)
 * - Fallback chains (es-MX → es → en)
 * - System prompt localization
 */

// ============================================================================
// SUPPORTED LOCALES
// ============================================================================

export const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English', region: 'US', nativeLanguage: 'English' },
  { code: 'es', name: 'Español', region: 'ES', nativeLanguage: 'Español' },
  { code: 'fr', name: 'Français', region: 'FR', nativeLanguage: 'Français' },
  { code: 'de', name: 'Deutsch', region: 'DE', nativeLanguage: 'Deutsch' },
  { code: 'it', name: 'Italiano', region: 'IT', nativeLanguage: 'Italiano' },
  { code: 'pt', name: 'Português', region: 'BR', nativeLanguage: 'Português' },
  { code: 'ja', name: '日本語', region: 'JP', nativeLanguage: '日本語' },
  { code: 'zh', name: '中文', region: 'CN', nativeLanguage: '简体中文' },
  { code: 'ar', name: 'العربية', region: 'SA', nativeLanguage: 'العربية' },
  { code: 'ru', name: 'Русский', region: 'RU', nativeLanguage: 'Русский' },
];

// ============================================================================
// TRANSLATION STRINGS
// ============================================================================

const translations: Record<string, Record<string, string>> = {
  en: {
    'chat.welcome': 'Hi! 👋 How can I help you today?',
    'chat.thinking': 'Let me think about that...',
    'chat.sorry': 'I\'m not sure about that. Would you like to speak with a human?',
    'chat.offTopic': 'That\'s outside my area. Our team can help better.',
    'chat.handoff': 'Connecting you to our team...',
    
    'prompts.shopping': 'You are a helpful shopping assistant for {{shopName}}. Help customers find products, answer questions about policies, and recover abandoned carts.',
    'prompts.support': 'You are a customer support agent for {{shopName}}. Answer questions about orders, shipping, returns, and policies.',
    
    'error.notFound': 'I couldn\'t find that product. Would you like to search again?',
    'error.outOfStock': 'Unfortunately, {{product}} is out of stock. Similar options: {{alternatives}}',
    'error.noResults': 'No results found for "{{query}}". Try a different search?',
    'error.searchFailed': 'Search is temporarily unavailable. Please try again later.',
    
    'recommendation.title': 'Recommended for you',
    'recommendation.noProducts': 'No recommendations available at the moment.',
    
    'cart.abandoned': 'You have items in your cart. Would you like to purchase them?',
    'cart.total': 'Total: {{price}}',
  },
  
  es: {
    'chat.welcome': '¡Hola! 👋 ¿Cómo puedo ayudarte hoy?',
    'chat.thinking': 'Déjame pensar en eso...',
    'chat.sorry': 'No estoy seguro de eso. ¿Te gustaría hablar con una persona?',
    'chat.offTopic': 'Eso está fuera de mi área. Nuestro equipo puede ayudar mejor.',
    'chat.handoff': 'Conectándote con nuestro equipo...',
    
    'prompts.shopping': 'Eres un asistente de compras útil para {{shopName}}. Ayuda a los clientes a encontrar productos, responde preguntas sobre políticas y recupera carritos abandonados.',
    'prompts.support': 'Eres un agente de servicio al cliente para {{shopName}}. Responde preguntas sobre pedidos, envíos, devoluciones y políticas.',
    
    'error.notFound': 'No pude encontrar ese producto. ¿Te gustaría buscar de nuevo?',
    'error.outOfStock': 'Desafortunadamente, {{product}} no está en stock. Alternativas similares: {{alternatives}}',
    'error.noResults': 'Sin resultados para "{{query}}". ¿Intentar otra búsqueda?',
    'error.searchFailed': 'La búsqueda no está disponible. Por favor, intenta más tarde.',
    
    'recommendation.title': 'Recomendado para ti',
    'recommendation.noProducts': 'Sin recomendaciones disponibles en este momento.',
    
    'cart.abandoned': 'Tienes artículos en tu carrito. ¿Te gustaría comprarlos?',
    'cart.total': 'Total: {{price}}',
  },

  fr: {
    'chat.welcome': 'Bonjour! 👋 Comment puis-je vous aider aujourd\'hui?',
    'chat.thinking': 'Laissez-moi réfléchir à cela...',
    'chat.sorry': 'Je ne suis pas certain à ce sujet. Souhaitez-vous parler à un humain?',
    'chat.handoff': 'Vous connectez avec notre équipe...',
    
    'prompts.shopping': 'Vous êtes un assistant d\'achat utile pour {{shopName}}. Aidez les clients à trouver des produits, répondez aux questions sur les politiques.',
    'prompts.support': 'Vous êtes un agent du service à la clientèle pour {{shopName}}. Répondez aux questions sur les commandes, l\'expédition et les retours.',
    
    'error.notFound': 'Je n\'ai pas pu trouver ce produit. Voulez-vous rechercher à nouveau?',
    'error.outOfStock': 'Malheureusement, {{product}} est en rupture de stock.',
    'error.noResults': 'Aucun résultat pour "{{query}}".',
  },

  de: {
    'chat.welcome': 'Hallo! 👋 Wie kann ich dir heute helfen?',
    'chat.thinking': 'Lass mich das überlegen...',
    'chat.sorry': 'Da bin ich mir nicht sicher. Möchtest du mit jemandem sprechen?',
    'chat.handoff': 'Verbinde dich mit unserem Team...',
    
    'prompts.shopping': 'Du bist ein hilfreicher Einkaufsassistent für {{shopName}}. Hilf Kunden, Produkte zu finden.',
    'prompts.support': 'Du bist ein Kundenservicemitarbeiter für {{shopName}}. Beantworte Fragen zu Bestellungen und Retouren.',
    
    'error.notFound': 'Ich konnte dieses Produkt nicht finden.',
    'error.outOfStock': 'Leider ist {{product}} nicht auf Lager.',
  },

  ja: {
    'chat.welcome': 'こんにちは! 👋 今日はどのようにお手伝いできますか?',
    'chat.thinking': 'そのことについて考えさせてください...',
    'chat.sorry': 'それについてはよくわかりません。人間と話したいですか?',
    'chat.handoff': 'チームに接続中...',
    
    'prompts.shopping': 'あなたは{{shopName}}の役立つショッピングアシスタントです。',
    'prompts.support': 'あなたは{{shopName}}のカスタマーサポートエージェントです。',
  },

  'zh-CN': {
    'chat.welcome': '你好! 👋 今天有什么我可以帮助你的吗?',
    'chat.thinking': '让我想想...',
    'chat.sorry': '我不确定那个。你想和真人交谈吗?',
    'chat.handoff': '正在连接我们的团队...',
  },

  ar: {
    'chat.welcome': 'مرحبا! 👋 كيف يمكنني مساعدتك اليوم?',
    'chat.thinking': 'دعني أفكر في ذلك...',
    'chat.sorry': 'أنا لست متأكدا من ذلك. هل تريد التحدث مع إنسان؟',
  },

  ru: {
    'chat.welcome': 'Привет! 👋 Чем я могу вам помочь?',
    'chat.thinking': 'Дайте мне подумать...',
    'chat.sorry': 'Я не уверен. Вы хотите поговорить с человеком?',
  },

  pt: {
    'chat.welcome': 'Olá! 👋 Como posso ajudá-lo hoje?',
    'chat.thinking': 'Deixe-me pensar nisso...',
    'chat.sorry': 'Não tem certeza sobre isso. Gostaria de falar com um humano?',
    'chat.handoff': 'Conectando você ao nosso time...',
  },

  it: {
    'chat.welcome': 'Ciao! 👋 Come posso aiutarti oggi?',
    'chat.thinking': 'Lasciami pensare...',
    'chat.sorry': 'Non sono sicuro. Vuoi parlare con un umano?',
  },
};

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================

/**
 * Detect language from text using heuristics
 * Returns language code if detected, falls back to provided locale
 */
export function detectLanguageFromText(
  text: string,
  fallbackLocale: string = 'en'
): string {
  if (!text || text.length < 5) return fallbackLocale;

  // Simple heuristic: detect common characters/patterns
  const lowerText = text.toLowerCase();

  // Chinese characters
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';

  // Japanese hiragana/katakana
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';

  // Arabic script
  if (/[\u0600-\u06ff]/.test(text)) return 'ar';

  // Russian Cyrillic
  if (/[\u0400-\u04ff]/.test(text)) return 'ru';

  // Portuguese: common patterns (check before Spanish since they overlap)
  if ((/ ã | õ |ç/.test(text) || lowerText.includes('você')) && lowerText.includes('está')) return 'pt';

  // Spanish: common patterns
  if (/¿|¡|ñ|á|é|í|ó|ú/.test(text)) return 'es';

  // German: common words
  if (/(der|die|das|und|oder|aber)\b/.test(lowerText)) return 'de';

  // French: common words and letters
  if (/(le|la|les|et|ou|mais|avez|vous|est|pour|avec|dans)\b/.test(lowerText)) return 'fr';

  // Italian: common words
  if (/(il|la|di|che|da)\b/.test(lowerText)) return 'it';

  return fallbackLocale;
}

/**
 * Detect preferred language from HTTP headers
 */
export function detectLanguageFromHeaders(
  acceptLanguage: string | undefined,
  defaultLocale: string = 'en'
): string {
  if (!acceptLanguage) return defaultLocale;

  // Parse Accept-Language header: en-US,en;q=0.9,es;q=0.8
  const languages = acceptLanguage
    .split(',')
    .map((lang) => {
      const [code] = lang.trim().split(';');
      return code.toLowerCase();
    })
    .filter((code) => code.length > 0);

  // Find first supported language
  for (const lang of languages) {
    const baseCode = lang.split('-')[0]; // en from en-US
    if (SUPPORTED_LOCALES.some((loc) => loc.code === baseCode)) {
      return baseCode;
    }
  }

  return defaultLocale;
}

// ============================================================================
// TRANSLATION HELPERS
// ============================================================================

/**
 * Get translated string with variable interpolation
 */
export function getTranslation(
  key: string,
  locale: string = 'en',
  variables?: Record<string, string | number>
): string {
  // Fallback chain: exact locale → base language → English
  const localeChain = [
    locale,
    locale.split('-')[0], // base language
    'en',
  ].filter((l, i, arr) => arr.indexOf(l) === i); // remove duplicates

  let translation: string | undefined;
  for (const lang of localeChain) {
    translation = translations[lang]?.[key];
    if (translation) break;
  }

  // If still not found, return key itself
  if (!translation) {
    console.warn(`[i18n] Missing translation for key: ${key} in locale ${locale}`);
    return key;
  }

  // Interpolate variables
  if (variables) {
    Object.entries(variables).forEach(([varKey, value]) => {
      translation = translation!.replace(`{{${varKey}}}`, String(value));
    });
  }

  return translation;
}

/**
 * Format price with locale-specific currency
 */
export function formatPrice(
  amount: number,
  locale: string = 'en',
  currency: string = 'USD'
): string {
  try {
    const formatter = new Intl.NumberFormat(getLocaleTag(locale), {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return formatter.format(amount);
  } catch (error) {
    console.error('[i18n] Price formatting failed:', error);
    return `$${amount.toFixed(2)}`;
  }
}

/**
 * Format date with locale
 */
export function formatDate(
  date: Date,
  locale: string = 'en',
  format: 'short' | 'long' = 'short'
): string {
  try {
    const formatter = new Intl.DateTimeFormat(getLocaleTag(locale), {
      dateStyle: format,
    });
    return formatter.format(date);
  } catch (error) {
    console.error('[i18n] Date formatting failed:', error);
    return date.toLocaleDateString();
  }
}

/**
 * Convert language code to Locale tag (en → en-US, es → es-ES)
 */
function getLocaleTag(code: string): string {
  const locale = SUPPORTED_LOCALES.find((loc) => loc.code === code);
  if (!locale) return 'en-US';

  const regionMap: Record<string, string> = {
    en: 'en-US',
    es: 'es-ES',
    fr: 'fr-FR',
    de: 'de-DE',
    it: 'it-IT',
    pt: 'pt-BR',
    ja: 'ja-JP',
    zh: 'zh-CN',
    ar: 'ar-SA',
    ru: 'ru-RU',
  };

  return regionMap[code] || `${code}-${locale.region}`;
}

// ============================================================================
// PROMPT LOCALIZATION
// ============================================================================

/**
 * Get localized system prompt for shopping assistant
 */
export function getShoppingPrompt(
  shopName: string,
  locale: string = 'en'
): string {
  const basePrompt = getTranslation('prompts.shopping', locale, {
    shopName,
  });

  const localeContext = locale !== 'en' 
    ? `\n\n**IMPORTANT:** Respond in ${getLocaleName(locale)} language only. User is located in ${getSupportedRegion(locale)}.`
    : '';

  return basePrompt + localeContext;
}

/**
 * Get localized system prompt for support agent
 */
export function getSupportPrompt(
  shopName: string,
  locale: string = 'en'
): string {
  const basePrompt = getTranslation('prompts.support', locale, {
    shopName,
  });

  const localeContext = locale !== 'en'
    ? `\n\n**IMPORTANT:** Respond in ${getLocaleName(locale)} language only.`
    : '';

  return basePrompt + localeContext;
}

/**
 * Get localized error message
 */
export function getErrorMessage(
  errorType: string,
  locale: string = 'en',
  variables?: Record<string, string>
): string {
  const key = `error.${errorType}`;
  return getTranslation(key, locale, variables);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get native language name from code
 */
function getLocaleName(code: string): string {
  return SUPPORTED_LOCALES.find((loc) => loc.code === code)?.nativeLanguage ?? 'English';
}

/**
 * Get region name from locale code
 */
function getSupportedRegion(code: string): string {
  const regionMap: Record<string, string> = {
    en: 'United States',
    es: 'Spain',
    fr: 'France',
    de: 'Germany',
    it: 'Italy',
    pt: 'Brazil',
    ja: 'Japan',
    zh: 'China',
    ar: 'Saudi Arabia',
    ru: 'Russia',
  };
  return regionMap[code] ?? 'Unknown Region';
}

/**
 * Check if a locale is supported
 */
export function isSupportedLocale(locale: string): boolean {
  return SUPPORTED_LOCALES.some((l) => l.code === locale);
}

/**
 * Get all supported locales
 */
export function getSupportedLocales() {
  return SUPPORTED_LOCALES;
}
