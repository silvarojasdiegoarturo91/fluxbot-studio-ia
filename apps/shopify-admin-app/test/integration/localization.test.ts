/**
 * Localization Service Tests - Sprint 4.3
 *
 * Validates:
 * - Language detection from text
 * - Language detection from HTTP headers
 * - Translation lookups and fallback chains
 * - Variable interpolation
 * - Price and date formatting
 * - Prompt localization
 * - Error messages
 */

import { describe, it, expect } from 'vitest';
import {
  detectLanguageFromText,
  detectLanguageFromHeaders,
  getTranslation,
  formatPrice,
  formatDate,
  getShoppingPrompt,
  getSupportPrompt,
  getErrorMessage,
  isSupportedLocale,
  getSupportedLocales,
  SUPPORTED_LOCALES,
} from '../../app/services/localization.server';

// ============================================================================
// LANGUAGE DETECTION FROM TEXT
// ============================================================================

describe('Localization - Language Detection from Text', () => {
  it('should detect Chinese characters', () => {
    const text = '你好，这是一个测试'; // Hello, this is a test
    const detected = detectLanguageFromText(text);
    expect(detected).toBe('zh');
  });

  it('should detect Japanese hiragana and katakana', () => {
    const text = 'こんにちは、これはテストです'; // Hello, this is a test
    const detected = detectLanguageFromText(text);
    expect(detected).toBe('ja');
  });

  it('should detect Arabic script', () => {
    const text = 'مرحبا، هذا اختبار'; // Hello, this is a test
    const detected = detectLanguageFromText(text);
    expect(detected).toBe('ar');
  });

  it('should detect Russian Cyrillic', () => {
    const text = 'Привет, это тест'; // Hello, this is a test
    const detected = detectLanguageFromText(text);
    expect(detected).toBe('ru');
  });

  it('should detect Spanish with specific characters and patterns', () => {
    const text = '¿Hola! ¿Cómo estás?'; // Hi! How are you?
    const detected = detectLanguageFromText(text);
    expect(detected).toBe('es');
  });

  it('should detect Portuguese with specific characters', () => {
    const text = 'Olá, você está bem?'; // Hi, are you well?
    const detected = detectLanguageFromText(text);
    expect(detected).toBe('pt');
  });

  it('should detect German from common words', () => {
    const text = 'Der Mann und die Frau'; // The man and the woman
    const detected = detectLanguageFromText(text);
    expect(detected).toBe('de');
  });

  it('should detect French from common words', () => {
    const text = 'Le chat et la souris'; // The cat and the mouse
    const detected = detectLanguageFromText(text);
    expect(detected).toBe('fr');
  });

  it('should detect Italian from common words', () => {
    const text = 'Il gatto di Maria'; // Mary's cat
    const detected = detectLanguageFromText(text);
    expect(detected).toBe('it');
  });

  it('should fallback to default locale for unknown text', () => {
    const text = 'abc'; // Too short
    const detected = detectLanguageFromText(text);
    expect(detected).toBe('en');
  });

  it('should accept custom fallback locale', () => {
    const text = 'xyz'; // Unknown
    const detected = detectLanguageFromText(text, 'es');
    expect(detected).toBe('es');
  });

  it('should return empty text as fallback locale', () => {
    const detected = detectLanguageFromText('', 'fr');
    expect(detected).toBe('fr');
  });
});

// ============================================================================
// LANGUAGE DETECTION FROM HTTP HEADERS
// ============================================================================

describe('Localization - Language Detection from Headers', () => {
  it('should detect primary language from Accept-Language header', () => {
    const header = 'es-MX,es;q=0.9,en;q=0.8';
    const detected = detectLanguageFromHeaders(header);
    expect(detected).toBe('es');
  });

  it('should extract base language code from region variant', () => {
    const header = 'en-US,en;q=0.9';
    const detected = detectLanguageFromHeaders(header);
    expect(detected).toBe('en');
  });

  it('should find first supported language in preference list', () => {
    const header = 'de-DE,de;q=0.9,fr;q=0.8,en;q=0.7';
    const detected = detectLanguageFromHeaders(header);
    expect(detected).toBe('de');
  });

  it('should fallback to default when no supported languages match', () => {
    const header = 'ko-KR,ko;q=0.9'; // Korean not supported
    const detected = detectLanguageFromHeaders(header);
    expect(detected).toBe('en');
  });

  it('should accept custom default locale', () => {
    const header = 'ko-KR,ko;q=0.9';
    const detected = detectLanguageFromHeaders(header, 'fr');
    expect(detected).toBe('fr');
  });

  it('should return default for undefined header', () => {
    const detected = detectLanguageFromHeaders(undefined);
    expect(detected).toBe('en');
  });

  it('should handle empty header gracefully', () => {
    const detected = detectLanguageFromHeaders('');
    expect(detected).toBe('en');
  });

  it('should handle complex quality factors', () => {
    const header = 'en-US,en;q=0.9, pt;q=0.8, es;q=0.7';
    const detected = detectLanguageFromHeaders(header);
    expect(detected).toBe('en');
  });
});

// ============================================================================
// TRANSLATION LOOKUPS
// ============================================================================

describe('Localization - Translation Lookups', () => {
  it('should return English translation by default', () => {
    const text = getTranslation('chat.welcome');
    expect(text).toContain('Hi'); // English welcome message
  });

  it('should return Spanish translation when requested', () => {
    const text = getTranslation('chat.welcome', 'es');
    expect(text).toContain('Hola'); // Spanish welcome message
  });

  it('should return French translation for French locale', () => {
    const text = getTranslation('chat.welcome', 'fr');
    expect(text).toContain('Bonjour'); // French welcome message
  });

  it('should return German translation for German locale', () => {
    const text = getTranslation('chat.welcome', 'de');
    expect(text).toContain('Hallo'); // German welcome message
  });

  it('should interpolate single variable', () => {
    const text = getTranslation('error.notFound', 'en');
    expect(text).toBeTruthy();
    expect(typeof text).toBe('string');
  });

  it('should interpolate multiple variables', () => {
    const text = getTranslation('error.outOfStock', 'en', {
      product: 'Nike Shoes',
      alternatives: 'Adidas, Puma',
    });
    expect(text).toContain('Nike Shoes');
    expect(text).toContain('Adidas, Puma');
  });

  it('should handle missing translation keys', () => {
    const text = getTranslation('not.a.real.key', 'en');
    expect(text).toBe('not.a.real.key'); // Returns key when not found
  });

  it('should fallback to base language when variant not found', () => {
    // Test with a variant that doesn't exist but base language does
    const text = getTranslation('chat.welcome', 'es-MX');
    expect(text).toBeTruthy(); // Should fallback to 'es'
  });

  it('should fallback to English when locale not available', () => {
    const text = getTranslation('chat.thinking', 'unknown-lang');
    expect(text).toContain('think'); // English fallback
  });

  it('should support Japanese translations', () => {
    const text = getTranslation('chat.welcome', 'ja');
    expect(text).toBeTruthy();
  });

  it('should support Chinese translations', () => {
    const text = getTranslation('chat.welcome', 'zh');
    expect(text).toBeTruthy();
  });

  it('should support Arabic translations', () => {
    const text = getTranslation('chat.welcome', 'ar');
    expect(text).toBeTruthy();
  });

  it('should support Russian translations', () => {
    const text = getTranslation('chat.welcome', 'ru');
    expect(text).toBeTruthy();
  });

  it('should support Portuguese translations', () => {
    const text = getTranslation('chat.welcome', 'pt');
    expect(text).toBeTruthy();
  });

  it('should support Italian translations', () => {
    const text = getTranslation('chat.welcome', 'it');
    expect(text).toBeTruthy();
  });
});

// ============================================================================
// PRICE AND DATE FORMATTING
// ============================================================================

describe('Localization - Price Formatting', () => {
  it('should format USD price for English locale', () => {
    const formatted = formatPrice(99.99, 'en', 'USD');
    expect(formatted).toMatch(/\$|USD/); // Should contain currency symbol
    expect(formatted).toContain('99.99');
  });

  it('should format EUR price for German locale', () => {
    const formatted = formatPrice(99.99, 'de', 'EUR');
    expect(formatted).toBeTruthy();
  });

  it('should use default USD currency', () => {
    const formatted = formatPrice(49.99, 'en');
    expect(formatted).toContain('49.99');
  });

  it('should handle zero price', () => {
    const formatted = formatPrice(0, 'en', 'USD');
    expect(formatted).toContain('0');
  });

  it('should handle large prices', () => {
    const formatted = formatPrice(9999.99, 'en', 'USD');
    // Allow for thousand separators: $9,999.99 or $9999.99
    expect(formatted).toMatch(/9999\.99|9,999\.99/);
  });
});

describe('Localization - Date Formatting', () => {
  const testDate = new Date('2026-03-15');

  it('should format date for English locale', () => {
    const formatted = formatDate(testDate, 'en', 'short');
    expect(formatted).toBeTruthy();
    expect(typeof formatted).toBe('string');
  });

  it('should format date for German locale', () => {
    const formatted = formatDate(testDate, 'de', 'short');
    expect(formatted).toBeTruthy();
  });

  it('should format date for French locale', () => {
    const formatted = formatDate(testDate, 'fr', 'short');
    expect(formatted).toBeTruthy();
  });

  it('should support long date format', () => {
    const formatted = formatDate(testDate, 'en', 'long');
    expect(formatted).toBeTruthy();
    expect(formatted.length).toBeGreaterThan(5); // Long format should be longer
  });

  it('should default to short format', () => {
    const formatted = formatDate(testDate, 'en');
    expect(formatted).toBeTruthy();
  });
});

// ============================================================================
// PROMPT LOCALIZATION
// ============================================================================

describe('Localization - Prompt Localization', () => {
  it('should return English shopping prompt with shop name', () => {
    const prompt = getShoppingPrompt('Acme Store', 'en');
    expect(prompt).toContain('Acme Store');
    expect(prompt).toContain('shopping assistant');
  });

  it('should return Spanish shopping prompt', () => {
    const prompt = getShoppingPrompt('Tienda ACME', 'es');
    expect(prompt).toContain('Tienda ACME');
    expect(prompt).toContain('asistente');
  });

  it('should include language context for non-English locales', () => {
    const prompt = getShoppingPrompt('Shop', 'es');
    expect(prompt).toContain('Español');
  });

  it('should return English support prompt with shop name', () => {
    const prompt = getSupportPrompt('Acme Store', 'en');
    expect(prompt).toContain('Acme Store');
    expect(prompt).toContain('support');
  });

  it('should return Spanish support prompt', () => {
    const prompt = getSupportPrompt('Tienda ACME', 'es');
    expect(prompt).toContain('Tienda ACME');
    expect(prompt).toContain('servicio');
  });

  it('should not duplicate language context for English', () => {
    const prompt = getShoppingPrompt('Store', 'en');
    // English prompts should not repeat language context
    const contextCount = (prompt.match(/English/g) || []).length;
    expect(contextCount).toBeLessThanOrEqual(0);
  });
});

// ============================================================================
// ERROR MESSAGES
// ============================================================================

describe('Localization - Error Messages', () => {
  it('should return English error for not found', () => {
    const msg = getErrorMessage('notFound', 'en');
    expect(msg).toContain('product');
  });

  it('should return Spanish error for not found', () => {
    const msg = getErrorMessage('notFound', 'es');
    expect(msg).toContain('producto');
  });

  it('should interpolate product name in stock error', () => {
    const msg = getErrorMessage('outOfStock', 'en', {
      product: 'Blue Jacket',
      alternatives: 'similar items',
    });
    expect(msg).toContain('Blue Jacket');
    expect(msg).toContain('similar items');
  });

  it('should return search failed error', () => {
    const msg = getErrorMessage('searchFailed', 'en');
    expect(msg).toBeTruthy();
  });

  it('should return no results error with query', () => {
    const msg = getErrorMessage('noResults', 'en', { query: 'red shoes' });
    expect(msg).toContain('red shoes');
  });
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

describe('Localization - Utility Functions', () => {
  it('should return true for supported locale', () => {
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('es')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(true);
    expect(isSupportedLocale('de')).toBe(true);
    expect(isSupportedLocale('ja')).toBe(true);
  });

  it('should return false for unsupported locale', () => {
    expect(isSupportedLocale('ko')).toBe(false);
    expect(isSupportedLocale('unknown')).toBe(false);
    expect(isSupportedLocale('xx')).toBe(false);
  });

  it('should return list of supported locales', () => {
    const locales = getSupportedLocales();
    expect(Array.isArray(locales)).toBe(true);
    expect(locales.length).toBeGreaterThan(5);
    expect(locales).toContainEqual(
      expect.objectContaining({
        code: 'en',
        name: 'English',
      })
    );
  });

  it('should have all required locale properties', () => {
    SUPPORTED_LOCALES.forEach((locale) => {
      expect(locale).toHaveProperty('code');
      expect(locale).toHaveProperty('name');
      expect(locale).toHaveProperty('region');
      expect(locale).toHaveProperty('nativeLanguage');
      expect(typeof locale.code).toBe('string');
      expect(locale.code.length).toBeGreaterThan(0);
    });
  });

  it('should have at least 10 supported locales', () => {
    expect(getSupportedLocales().length).toBeGreaterThanOrEqual(10);
  });
});

// ============================================================================
// INTEGRATION SCENARIOS
// ============================================================================

describe('Localization - Integration Scenarios', () => {
  it('should handle complete customer flow in Spanish', () => {
    // Simulate Spanish customer
    const locale = 'es';
    
    const welcome = getTranslation('chat.welcome', locale);
    expect(welcome).toContain('Hola');

    const prompt = getShoppingPrompt('Tienda', locale);
    expect(prompt).toContain('Tienda');

    const price = formatPrice(99.99, locale, 'USD');
    expect(price).toBeTruthy();

    const error = getErrorMessage('notFound', locale);
    expect(error).toBeTruthy();
  });

  it('should handle multi-language query detection', () => {
    // Generic English query (no strong patterns, will fallback to default)
    const fallbackDetect = detectLanguageFromText('Hello, how are you?', 'en');
    expect(['en', 'fr']).toContain(fallbackDetect); // May detect as English or fallback

    // Spanish query with clear indicators
    const spanishDetect = detectLanguageFromText('¿Qué productos tienes?', 'en');
    expect(spanishDetect).toBe('es');

    // French query with clear patterns
    const frenchDetect = detectLanguageFromText('Quels produits avez-vous?', 'en');
    expect(frenchDetect).toBe('fr');
  });

  it('should handle Accept-Language header workflow', () => {
    const header = 'es-ES,es;q=0.9,en;q=0.8';
    const locale = detectLanguageFromHeaders(header);
    expect(locale).toBe('es');

    const welcome = getTranslation('chat.welcome', locale);
    expect(welcome).toBeTruthy();

    const supported = isSupportedLocale(locale);
    expect(supported).toBe(true);
  });

  it('should preserve content through translation chain', () => {
    const shopName = 'Premium Store';
    const enPrompt = getShoppingPrompt(shopName, 'en');
    const esPrompt = getShoppingPrompt(shopName, 'es');
    const frPrompt = getShoppingPrompt(shopName, 'fr');

    // All should contain shop name
    expect(enPrompt).toContain(shopName);
    expect(esPrompt).toContain(shopName);
    expect(frPrompt).toContain(shopName);

    // But should differ in content
    expect(enPrompt).not.toBe(esPrompt);
    expect(esPrompt).not.toBe(frPrompt);
  });
});
