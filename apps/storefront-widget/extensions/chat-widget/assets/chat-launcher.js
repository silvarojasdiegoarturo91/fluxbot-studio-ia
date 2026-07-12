/**
 * FluxBot Chat Launcher
 * AI-powered chat widget for Shopify storefronts
 *
 * Features:
 *  W1 — Session Identity (visitorId + sessionId) + full behavioral event tracking
 *  W2 — Proactive message polling (15s active / 30s background)
 *  W3 — Human handoff UI (triggered by requiresEscalation: true)
 *  W4 — GDPR consent banner (first-visit capture, stored in localStorage)
 *  W5 — Multilingual UI (10 languages via embedded i18n)
 *  W6 — Security hardening (XSS-safe markdown, rate limiting, input sanitization)
 */

(function () {
  'use strict';

  var DEBUG_VERSION = '2026-07-10-trace-routing-diagnostics-v1';
  var WIDGET_BUILD_ID = DEBUG_VERSION;
  var DEBUG_PREFIX = '[FluxBot]';

  // ─── Endpoints ──────────────────────────────────────────────────────────────
  // /chat can be intercepted by storefront/theme paths on some shops.
  // Use a non-ambiguous proxy path for message sends.
  var API_ENDPOINT      = '/apps/fluxbot/chat';
  var chatEndpoint      = API_ENDPOINT;
  var CART_ENDPOINT     = '/apps/fluxbot/cart/add';
  var EVENTS_ENDPOINT   = '/apps/fluxbot/events';
  var MESSAGES_ENDPOINT = '/apps/fluxbot/messages/'; // + sessionId
  var CONSENT_ENDPOINT  = '/apps/fluxbot/consent';
  var HANDOFF_ENDPOINT  = '/apps/fluxbot/handoff';
  var CONFIG_ENDPOINT   = '/apps/fluxbot/widget-config';
  // Avoid ngrok browser warning interstitials on same-origin proxy requests.
  var PROXY_BYPASS_HEADER = 'ngrok-skip-browser-warning';

  function debugLog(label, data) {
    if (typeof console === 'undefined' || !console.log) return;
    if (data === undefined) {
      console.log(DEBUG_PREFIX + ' ' + label);
    } else {
      console.log(DEBUG_PREFIX + ' ' + label, data);
    }
  }

  function debugWarn(label, data) {
    if (typeof console === 'undefined' || !console.warn) return;
    console.warn(DEBUG_PREFIX + ' ' + label, data);
  }

  function debugError(label, data) {
    if (typeof console === 'undefined' || !console.error) return;
    console.error(DEBUG_PREFIX + ' ' + label, data);
  }

  function generateTraceId() {
    var ts = Date.now().toString(36);
    var rand = Math.random().toString(36).slice(2, 10);
    return 'TRACE-' + ts + '-' + rand;
  }

  function maskEmail(value) {
    if (!value || typeof value !== 'string') return undefined;
    var parts = value.split('@');
    if (parts.length !== 2) return '[invalid-email]';
    return parts[0].slice(0, 2) + '***@' + parts[1];
  }

  function getScriptSrc() {
    if (document.currentScript && document.currentScript.src) return document.currentScript.src;
    var scripts = document.querySelectorAll('script[src*="chat-launcher"]');
    return scripts.length ? scripts[scripts.length - 1].src : '';
  }

  function summarizeLauncherDataset() {
    if (!launcher) return {};
    return {
      shop: sanitizeAttr(launcher.dataset.shop),
      locale: sanitizeAttr(launcher.dataset.locale),
      customerIdPresent: !!sanitizeAttr(launcher.dataset.customerId),
      customerEmail: maskEmail(sanitizeAttr(launcher.dataset.customerEmail)),
      showLauncher: sanitizeAttr(launcher.dataset.showLauncher),
      primaryColor: sanitizeAttr(launcher.dataset.primaryColor),
      chatEndpointOverride: sanitizeAttr(launcher.dataset.chatEndpoint),
      widgetVersion: sanitizeAttr(launcher.dataset.widgetVersion),
      apiEndpoint: API_ENDPOINT,
      configEndpoint: CONFIG_ENDPOINT,
      chatEndpoint: chatEndpoint,
    };
  }

  function publishDebugState(extra) {
    window.__FLUXBOT_WIDGET_DEBUG__ = Object.assign({
      debugVersion: DEBUG_VERSION,
      buildId: WIDGET_BUILD_ID,
      scriptSrc: getScriptSrc(),
      pageUrl: window.location.href,
      origin: window.location.origin,
      apiEndpoint: API_ENDPOINT,
      configEndpoint: CONFIG_ENDPOINT,
      chatEndpoint: chatEndpoint,
      widgetConfigLoaded: widgetConfigLoaded,
      sessionId: sessionId,
      visitorId: visitorId,
      conversationId: conversationId,
      lastTraceId: (extra && extra.traceId) || (window.__FLUXBOT_WIDGET_DEBUG__ && window.__FLUXBOT_WIDGET_DEBUG__.lastTraceId) || null,
      launcherDataset: summarizeLauncherDataset(),
    }, extra || {});
  }

  function summarizeProductForDebug(product) {
    if (!product || typeof product !== 'object') return {};
    return {
      title: product.title ? String(product.title).slice(0, 80) : '',
      handle: product.handle ? String(product.handle).slice(0, 120) : '',
      price: product.price ? String(product.price).slice(0, 50) : '',
      hasUrl: !!product.url,
      hasImage: !!product.image,
      hasProductId: !!(product.productId || product.product_id || product.id),
      hasVariantId: !!(product.variantId || product.variant_id),
    };
  }

  async function readResponsePreview(response) {
    try {
      var text = await response.clone().text();
      return text.length > 800 ? text.slice(0, 800) + '…' : text;
    } catch (error) {
      return '[unreadable response body]';
    }
  }

  // ─── W5 — i18n ──────────────────────────────────────────────────────────────
  var I18N = {
    en: {
      openChat: 'Open chat', closeChat: 'Close chat',
      inputPlaceholder: 'Type your message…', sendMessage: 'Send message',
      addToCart: 'Add to cart', adding: 'Adding…',
      addedToCart: 'Added to cart.', viewCart: 'View cart',
      cartError: 'Sorry, I could not add this item to your cart right now.',
      cartVariantInvalid: 'That variant is no longer valid. Please choose a different option.',
      cartVariantUnavailable: 'That variant is sold out. Please choose a different option.',
      cartVariantNotFound: 'Shopify could not find that variant. Please reselect the product option.',
      cartDrawerFallback: 'Your cart drawer is unavailable right now. Opening the standard cart page.',
      cartUnavailable: 'Unavailable',
      typing: 'Assistant is typing…',
      errorRetry: 'I could not complete that request. Please try again or ask about products, orders, or FAQs.',
      errorMax: 'I\'m experiencing technical difficulties. Please try again later or contact support.',
      cartVariantError: 'I could not resolve the product variant for cart addition.',
      consentTitle: 'Before we chat…',
      consentBody: 'We use this chat to help you find products and answer questions. Your messages may be processed by AI. Do you agree?',
      consentAccept: 'Accept & chat', consentDecline: 'Decline',
      consentPrivacy: 'Privacy policy',
      handoffConnecting: 'Connecting you to our team…',
      handoffConfirm: 'A member of our team will be with you shortly.',
      connectAgent: 'Connect to agent',
      proactiveBadge: 'For you',
      poweredBy: 'Powered by FluxBot',
      rateLimitMsg: 'Please wait a moment before sending another message.',
    },
    es: {
      openChat: 'Abrir chat', closeChat: 'Cerrar chat',
      inputPlaceholder: 'Escribe tu mensaje…', sendMessage: 'Enviar mensaje',
      addToCart: 'Añadir al carrito', adding: 'Añadiendo…',
      addedToCart: 'Añadido al carrito.', viewCart: 'Ver carrito',
      cartError: 'Lo siento, no pude añadir este artículo al carrito ahora mismo.',
      typing: 'El asistente está escribiendo…',
      errorRetry: 'Lo siento, tuve un problema al procesar eso. Por favor inténtalo de nuevo.',
      errorMax: 'Estoy teniendo dificultades técnicas. Por favor intenta más tarde o contacta soporte.',
      cartVariantError: 'No pude resolver la variante del producto para añadir al carrito.',
      consentTitle: 'Antes de chatear…',
      consentBody: 'Usamos este chat para ayudarte a encontrar productos y responder preguntas. Tus mensajes pueden ser procesados por IA. ¿Estás de acuerdo?',
      consentAccept: 'Aceptar y chatear', consentDecline: 'Rechazar',
      consentPrivacy: 'Política de privacidad',
      handoffConnecting: 'Conectándote con nuestro equipo…',
      handoffConfirm: 'Un miembro de nuestro equipo estará contigo en breve.',
      connectAgent: 'Conectar con agente',
      proactiveBadge: 'Para ti',
      poweredBy: 'Desarrollado por FluxBot',
      rateLimitMsg: 'Por favor espera un momento antes de enviar otro mensaje.',
    },
    fr: {
      openChat: 'Ouvrir le chat', closeChat: 'Fermer le chat',
      inputPlaceholder: 'Tapez votre message…', sendMessage: 'Envoyer',
      addToCart: 'Ajouter au panier', adding: 'Ajout…',
      addedToCart: 'Ajouté au panier.', viewCart: 'Voir le panier',
      cartError: 'Désolé, je n\'ai pas pu ajouter cet article à votre panier.',
      typing: 'L\'assistant écrit…',
      errorRetry: 'Désolé, j\'ai eu du mal à traiter ça. Veuillez réessayer.',
      errorMax: 'Je rencontre des difficultés techniques. Réessayez plus tard ou contactez le support.',
      cartVariantError: 'Je n\'ai pas pu résoudre la variante du produit.',
      consentTitle: 'Avant de chatter…',
      consentBody: 'Nous utilisons ce chat pour vous aider à trouver des produits. Vos messages peuvent être traités par IA. Êtes-vous d\'accord ?',
      consentAccept: 'Accepter et chatter', consentDecline: 'Refuser',
      consentPrivacy: 'Politique de confidentialité',
      handoffConnecting: 'Connexion à notre équipe…',
      handoffConfirm: 'Un membre de notre équipe sera avec vous sous peu.',
      connectAgent: 'Contacter un agent',
      proactiveBadge: 'Pour vous',
      poweredBy: 'Propulsé par FluxBot',
      rateLimitMsg: 'Veuillez attendre avant d\'envoyer un autre message.',
    },
    de: {
      openChat: 'Chat öffnen', closeChat: 'Chat schließen',
      inputPlaceholder: 'Nachricht eingeben…', sendMessage: 'Senden',
      addToCart: 'In den Warenkorb', adding: 'Wird hinzugefügt…',
      addedToCart: 'Zum Warenkorb hinzugefügt.', viewCart: 'Warenkorb anzeigen',
      cartError: 'Entschuldigung, ich konnte diesen Artikel nicht zum Warenkorb hinzufügen.',
      typing: 'Der Assistent schreibt…',
      errorRetry: 'Entschuldigung, beim Verarbeiten ist ein Fehler aufgetreten. Bitte erneut versuchen.',
      errorMax: 'Ich habe technische Schwierigkeiten. Bitte versuchen Sie es später noch einmal.',
      cartVariantError: 'Ich konnte die Produktvariante nicht auflösen.',
      consentTitle: 'Bevor wir chatten…',
      consentBody: 'Wir nutzen diesen Chat, um Ihnen bei der Produktsuche zu helfen. Ihre Nachrichten können von KI verarbeitet werden. Sind Sie einverstanden?',
      consentAccept: 'Akzeptieren & chatten', consentDecline: 'Ablehnen',
      consentPrivacy: 'Datenschutzrichtlinie',
      handoffConnecting: 'Verbindung mit unserem Team wird hergestellt…',
      handoffConfirm: 'Ein Teammitglied wird sich bald bei Ihnen melden.',
      connectAgent: 'Mit Agent verbinden',
      proactiveBadge: 'Für Sie',
      poweredBy: 'Bereitgestellt von FluxBot',
      rateLimitMsg: 'Bitte warten Sie einen Moment, bevor Sie eine weitere Nachricht senden.',
    },
    it: {
      openChat: 'Apri chat', closeChat: 'Chiudi chat',
      inputPlaceholder: 'Scrivi il tuo messaggio…', sendMessage: 'Invia',
      addToCart: 'Aggiungi al carrello', adding: 'Aggiunta…',
      addedToCart: 'Aggiunto al carrello.', viewCart: 'Vedi carrello',
      cartError: 'Spiacente, non sono riuscito ad aggiungere questo articolo al carrello.',
      typing: 'L\'assistente sta scrivendo…',
      errorRetry: 'Spiacente, ho avuto problemi a elaborare la richiesta. Riprova.',
      errorMax: 'Sto riscontrando difficoltà tecniche. Riprova più tardi o contatta il supporto.',
      cartVariantError: 'Non sono riuscito a risolvere la variante del prodotto.',
      consentTitle: 'Prima di chattare…',
      consentBody: 'Usiamo questa chat per aiutarti a trovare prodotti. I tuoi messaggi potrebbero essere elaborati dall\'IA. Sei d\'accordo?',
      consentAccept: 'Accetta e chatta', consentDecline: 'Rifiuta',
      consentPrivacy: 'Informativa sulla privacy',
      handoffConnecting: 'Connessione al nostro team…',
      handoffConfirm: 'Un membro del nostro team sarà con te a breve.',
      connectAgent: 'Connetti con agente',
      proactiveBadge: 'Per te',
      poweredBy: 'Powered by FluxBot',
      rateLimitMsg: 'Attendi un momento prima di inviare un altro messaggio.',
    },
    pt: {
      openChat: 'Abrir chat', closeChat: 'Fechar chat',
      inputPlaceholder: 'Digite sua mensagem…', sendMessage: 'Enviar',
      addToCart: 'Adicionar ao carrinho', adding: 'Adicionando…',
      addedToCart: 'Adicionado ao carrinho.', viewCart: 'Ver carrinho',
      cartError: 'Desculpe, não consegui adicionar este item ao carrinho agora.',
      typing: 'O assistente está digitando…',
      errorRetry: 'Desculpe, tive problemas para processar isso. Por favor, tente novamente.',
      errorMax: 'Estou enfrentando dificuldades técnicas. Tente novamente mais tarde ou entre em contato com o suporte.',
      cartVariantError: 'Não consegui resolver a variante do produto.',
      consentTitle: 'Antes de conversar…',
      consentBody: 'Usamos este chat para ajudá-lo a encontrar produtos. Suas mensagens podem ser processadas por IA. Você concorda?',
      consentAccept: 'Aceitar e conversar', consentDecline: 'Recusar',
      consentPrivacy: 'Política de privacidade',
      handoffConnecting: 'Conectando você à nossa equipe…',
      handoffConfirm: 'Um membro da nossa equipe estará com você em breve.',
      connectAgent: 'Conectar com agente',
      proactiveBadge: 'Para você',
      poweredBy: 'Desenvolvido por FluxBot',
      rateLimitMsg: 'Aguarde um momento antes de enviar outra mensagem.',
    },
    ja: {
      openChat: 'チャットを開く', closeChat: 'チャットを閉じる',
      inputPlaceholder: 'メッセージを入力…', sendMessage: '送信',
      addToCart: 'カートに追加', adding: '追加中…',
      addedToCart: 'カートに追加されました。', viewCart: 'カートを見る',
      cartError: '申し訳ありません。このアイテムをカートに追加できませんでした。',
      typing: 'アシスタントが入力中…',
      errorRetry: '申し訳ありません。処理中に問題が発生しました。もう一度お試しください。',
      errorMax: '技術的な問題が発生しています。後でもう一度お試しいただくか、サポートにお問い合わせください。',
      cartVariantError: '商品バリアントを解決できませんでした。',
      consentTitle: 'チャットを始める前に…',
      consentBody: 'このチャットは商品検索や質問にお答えするために使用します。メッセージはAIによって処理される場合があります。同意しますか？',
      consentAccept: '同意してチャット', consentDecline: '拒否',
      consentPrivacy: 'プライバシーポリシー',
      handoffConnecting: 'チームに接続中…',
      handoffConfirm: 'チームのメンバーがすぐにご連絡します。',
      connectAgent: 'エージェントに接続',
      proactiveBadge: 'あなたへ',
      poweredBy: 'FluxBot提供',
      rateLimitMsg: '次のメッセージを送信する前にしばらくお待ちください。',
    },
    zh: {
      openChat: '打开聊天', closeChat: '关闭聊天',
      inputPlaceholder: '输入您的消息…', sendMessage: '发送',
      addToCart: '加入购物车', adding: '添加中…',
      addedToCart: '已加入购物车。', viewCart: '查看购物车',
      cartError: '抱歉，暂时无法将此商品加入购物车。',
      typing: '助手正在输入…',
      errorRetry: '抱歉，处理时遇到问题，请重试。',
      errorMax: '我遇到了技术问题，请稍后再试或联系支持。',
      cartVariantError: '无法解析商品变体。',
      consentTitle: '开始聊天前…',
      consentBody: '我们使用此聊天帮助您查找产品并回答问题。您的消息可能由AI处理。您同意吗？',
      consentAccept: '接受并聊天', consentDecline: '拒绝',
      consentPrivacy: '隐私政策',
      handoffConnecting: '正在连接我们的团队…',
      handoffConfirm: '我们的团队成员将很快与您联系。',
      connectAgent: '连接客服',
      proactiveBadge: '为您推荐',
      poweredBy: 'FluxBot 提供支持',
      rateLimitMsg: '请稍等片刻再发送下一条消息。',
    },
    ar: {
      openChat: 'فتح الدردشة', closeChat: 'إغلاق الدردشة',
      inputPlaceholder: 'اكتب رسالتك…', sendMessage: 'إرسال',
      addToCart: 'أضف إلى السلة', adding: 'جارٍ الإضافة…',
      addedToCart: 'تمت الإضافة إلى السلة.', viewCart: 'عرض السلة',
      cartError: 'عذراً، لم أتمكن من إضافة هذه العنصر إلى سلتك الآن.',
      typing: 'المساعد يكتب…',
      errorRetry: 'عذراً، واجهت مشكلة في المعالجة. يرجى المحاولة مرة أخرى.',
      errorMax: 'أواجه صعوبات تقنية. يرجى المحاولة لاحقاً أو التواصل مع الدعم.',
      cartVariantError: 'لم أتمكن من تحديد متغير المنتج.',
      consentTitle: 'قبل الدردشة…',
      consentBody: 'نستخدم هذه الدردشة لمساعدتك في العثور على المنتجات. قد تتم معالجة رسائلك بواسطة الذكاء الاصطناعي. هل توافق؟',
      consentAccept: 'قبول والدردشة', consentDecline: 'رفض',
      consentPrivacy: 'سياسة الخصوصية',
      handoffConnecting: 'جارٍ الاتصال بفريقنا…',
      handoffConfirm: 'سيتواصل معك أحد أعضاء فريقنا قريباً.',
      connectAgent: 'الاتصال بوكيل',
      proactiveBadge: 'لك',
      poweredBy: 'مدعوم من FluxBot',
      rateLimitMsg: 'يرجى الانتظار لحظة قبل إرسال رسالة أخرى.',
    },
    ru: {
      openChat: 'Открыть чат', closeChat: 'Закрыть чат',
      inputPlaceholder: 'Введите сообщение…', sendMessage: 'Отправить',
      addToCart: 'Добавить в корзину', adding: 'Добавляю…',
      addedToCart: 'Добавлено в корзину.', viewCart: 'Посмотреть корзину',
      cartError: 'Извините, не удалось добавить товар в корзину.',
      typing: 'Ассистент печатает…',
      errorRetry: 'Извините, возникла ошибка. Пожалуйста, попробуйте ещё раз.',
      errorMax: 'Возникли технические трудности. Попробуйте позже или обратитесь в поддержку.',
      cartVariantError: 'Не удалось определить вариант товара.',
      consentTitle: 'Перед началом чата…',
      consentBody: 'Мы используем этот чат, чтобы помогать вам с покупками. Ваши сообщения могут обрабатываться ИИ. Вы согласны?',
      consentAccept: 'Принять и чатиться', consentDecline: 'Отказаться',
      consentPrivacy: 'Политика конфиденциальности',
      handoffConnecting: 'Подключение к нашей команде…',
      handoffConfirm: 'Сотрудник нашей команды свяжется с вами в ближайшее время.',
      connectAgent: 'Связаться с агентом',
      proactiveBadge: 'Для вас',
      poweredBy: 'На базе FluxBot',
      rateLimitMsg: 'Подождите перед отправкой следующего сообщения.',
    },
  };

  function getI18n(locale) {
    if (!locale) return I18N.en;
    var lang = locale.toLowerCase().split('-')[0];
    return Object.assign({}, I18N.en, I18N[lang] || {});
  }

  // ─── W1 — UUID generator (no external deps) ──────────────────────────────
  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ─── W6 — Safe storage (falls back to in-memory map on blocked storage) ──
  var _memoryStore = {};

  function safeGet(storage, key) {
    try { return storage.getItem(key); } catch (e) { return _memoryStore[key] || null; }
  }

  function safeSet(storage, key, val) {
    try { storage.setItem(key, val); } catch (e) { _memoryStore[key] = val; }
  }

  // ─── State ────────────────────────────────────────────────────────────────
  var isOpen            = false;
  var conversationId    = null;
  var isTyping          = false;
  var retryCount        = 0;
  var visitorId         = null;
  var sessionId         = null;
  var hasConsent        = false;
  var i18n              = I18N.en;
  var storefrontLocale  = 'en';
  var widgetLocale      = 'en';
  var isHandoffActive   = false;
  var proactivePollTimer = null;
  var dwellTimer        = null;
  var scrollDepthReported = {};
  var launcherLabelText = '';
  var launcherAvatarStyle = 'assistant';
  var lastAppliedConfigVersion = '';
  var effectiveLocale = 'en';
  var widgetConfigLoaded = false;
  var widgetConfigLoadPromise = null;
  var cartRequestsInFlight = {};

  // W6 — Rate limiting
  var msgTimestamps  = [];
  var MSG_RATE_LIMIT  = 20;
  var MSG_RATE_WINDOW = 60000;
  var SEND_DEBOUNCE_MS = 500;
  var lastSendAt = 0;
  var MAX_RETRIES = 3;

  // ─── DOM elements ─────────────────────────────────────────────────────────
  var launcher, launcherButton, chatWindow, messagesContainer, chatForm, chatInput;

  function normalizeLocale(value, fallback) {
    if (typeof value !== 'string') return fallback || 'en';
    var normalized = value.trim().toLowerCase();
    if (!normalized) return fallback || 'en';
    return normalized.split('-')[0];
  }

  function normalizeSupportedLanguages(rawLanguages) {
    if (!Array.isArray(rawLanguages)) return [];
    return rawLanguages
      .map(function (entry) { return normalizeLocale(entry, ''); })
      .filter(function (entry) { return !!entry; });
  }

  function resolveConfigLocale(config) {
    var botLanguage = normalizeLocale(
      (config && (config.botLanguage || config.adminLanguage)) || widgetLocale || storefrontLocale,
      'en'
    );
    var supportedLanguages = normalizeSupportedLanguages(config && config.supportedLanguages);
    if (supportedLanguages.indexOf(botLanguage) === -1) {
      supportedLanguages.push(botLanguage);
    }
    var storefrontCandidate = normalizeLocale(storefrontLocale, botLanguage);
    return supportedLanguages.indexOf(storefrontCandidate) !== -1 ? storefrontCandidate : botLanguage;
  }

  function applyLocalizedStaticLabels() {
    if (!chatInput || !chatWindow || !chatForm) return;
    chatInput.setAttribute('placeholder', i18n.inputPlaceholder);
    chatInput.setAttribute('aria-label', i18n.inputPlaceholder);
    var closeBtn = chatWindow.querySelector('.fluxbot-chat-window__close');
    if (closeBtn) closeBtn.setAttribute('aria-label', i18n.closeChat);
    var submitBtn = chatForm.querySelector('.fluxbot-chat-form__submit');
    if (submitBtn) submitBtn.setAttribute('aria-label', i18n.sendMessage);
    var branding = chatWindow.querySelector('.fluxbot-chat-window__branding');
    if (branding) branding.textContent = i18n.poweredBy;
    if (launcher) {
      if (widgetLocale.startsWith('ar')) launcher.setAttribute('dir', 'rtl');
      else launcher.removeAttribute('dir');
    }
  }

  function setWidgetLocale(nextLocale) {
    widgetLocale = normalizeLocale(nextLocale, widgetLocale || storefrontLocale || 'en');
    effectiveLocale = widgetLocale;
    i18n = getI18n(widgetLocale);
    if (launcher) launcher.dataset.locale = widgetLocale;
    applyLocalizedStaticLabels();
    updateLauncherButtonA11y();
  }

  function exposeTestHooks() {
    if (!window.__FLUXBOT_WIDGET_TEST__) return;
    window.__FLUXBOT_WIDGET_TEST__.extractNumericResourceId = extractNumericResourceId;
    window.__FLUXBOT_WIDGET_TEST__.resolvePurchasableVariant = resolvePurchasableVariant;
    window.__FLUXBOT_WIDGET_TEST__.isVariantPurchasable = isVariantPurchasable;
    window.__FLUXBOT_WIDGET_TEST__.createProductCards = createProductCards;
    window.__FLUXBOT_WIDGET_TEST__.addProductToCart = addProductToCart;
    window.__FLUXBOT_WIDGET_TEST__.refreshCartState = refreshCartState;
    window.__FLUXBOT_WIDGET_TEST__.openCartDrawerIfAvailable = openCartDrawerIfAvailable;
    window.__FLUXBOT_WIDGET_TEST__.fallbackToCartPage = fallbackToCartPage;
    window.__FLUXBOT_WIDGET_TEST__.classifyCartAddFailure = classifyCartAddFailure;
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  exposeTestHooks();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    debugLog('Initializing widget', {
      debugVersion: DEBUG_VERSION,
      scriptSrc: getScriptSrc(),
      pageUrl: window.location.href,
      origin: window.location.origin,
      readyState: document.readyState,
    });
    
    launcher = document.getElementById('fluxbot-chat-launcher');
    if (!launcher) {
      debugError('Launcher element not found', {
        debugVersion: DEBUG_VERSION,
        buildId: WIDGET_BUILD_ID,
        scriptSrc: getScriptSrc(),
      });
      return;
    }
    debugLog('Launcher element found', summarizeLauncherDataset());
    publishDebugState({ phase: 'asset-loaded' });
    debugLog('Widget update marker', {
      buildId: WIDGET_BUILD_ID,
      debugVersion: DEBUG_VERSION,
      scriptSrc: getScriptSrc(),
      pageUrl: window.location.href,
      launcherWidgetVersion: sanitizeAttr(launcher.dataset.widgetVersion),
      supportsProductRecommendations: true,
      debugState: window.__FLUXBOT_WIDGET_DEBUG__,
    });

    var configuredChatEndpoint = sanitizeAttr(launcher.dataset.chatEndpoint);
    if (configuredChatEndpoint) {
      chatEndpoint = configuredChatEndpoint;
      debugWarn('Using Liquid chat endpoint override', {
        chatEndpoint: chatEndpoint,
        source: 'data-chat-endpoint',
      });
    }

    // W6 — Sanitize data attributes before use
    var showLauncher = sanitizeAttr(launcher.dataset.showLauncher);
    if (showLauncher === 'false') {
      debugWarn('Launcher disabled by data-show-launcher=false', summarizeLauncherDataset());
      launcher.style.display = 'none';
      return;
    }

    // W5 — Locale
    storefrontLocale = normalizeLocale(sanitizeAttr(launcher.dataset.locale), 'en');
    setWidgetLocale(storefrontLocale);

    // W1 — Identity: visitorId persists in localStorage, sessionId per tab
    visitorId = safeGet(localStorage, 'fluxbot_visitor_id');
    if (!visitorId) {
      visitorId = generateId();
      safeSet(localStorage, 'fluxbot_visitor_id', visitorId);
    }
    sessionId = safeGet(sessionStorage, 'fluxbot_session_id');
    if (!sessionId) {
      sessionId = generateId();
      safeSet(sessionStorage, 'fluxbot_session_id', sessionId);
    }
    debugLog('Identity resolved', {
      visitorId: visitorId,
      sessionId: sessionId,
      existingConversationId: conversationId,
    });

    // W4 — Consent check
    var storedConsent = safeGet(localStorage, 'fluxbot_consent');
    if (storedConsent) {
      try {
        var parsed = JSON.parse(storedConsent);
        hasConsent = parsed && parsed.granted === true;
      } catch (e) { hasConsent = false; }
    }
    debugLog('Consent state resolved', { hasConsent: hasConsent });

    // DOM elements
    launcherButton    = launcher.querySelector('.fluxbot-launcher__button');
    chatWindow        = document.getElementById('fluxbot-chat-window');
    messagesContainer = document.getElementById('fluxbot-messages');
    chatForm          = document.getElementById('fluxbot-chat-form');
    chatInput         = document.getElementById('fluxbot-chat-input');

    debugLog('DOM elements resolved', {
      hasLauncherButton: !!launcherButton,
      hasChatWindow: !!chatWindow,
      hasMessagesContainer: !!messagesContainer,
      hasChatForm: !!chatForm,
      hasChatInput: !!chatInput,
    });

    if (!launcherButton || !chatWindow || !messagesContainer || !chatForm || !chatInput) {
      debugError('Missing required DOM elements, aborting init', {
        hasLauncherButton: !!launcherButton,
        hasChatWindow: !!chatWindow,
        hasMessagesContainer: !!messagesContainer,
        hasChatForm: !!chatForm,
        hasChatInput: !!chatInput,
      });
      return;
    }
    debugLog('All required DOM elements found');

    // Apply primary color
    var primaryColor = sanitizeAttr(launcher.dataset.primaryColor);
    if (primaryColor && /^#[0-9a-fA-F]{3,8}$/.test(primaryColor)) {
      document.documentElement.style.setProperty('--fluxbot-primary-color', primaryColor);
      debugLog('Primary color applied', { primaryColor: primaryColor });
    }

    // W5 — Localise static labels
    applyLocalizedStaticLabels();
    var closeBtn = chatWindow.querySelector('.fluxbot-chat-window__close');

    applyLauncherPresentation();
    loadRemoteWidgetConfig();

    // Event listeners
    debugLog('Adding event listeners');
    launcherButton.addEventListener('click', toggleChat);
    debugLog('Added click listener to launcherButton');
    closeBtn && closeBtn.addEventListener('click', closeChat);
    debugLog('Added click listener to closeBtn', { hasCloseButton: !!closeBtn });
    chatForm.addEventListener('submit', handleSubmit);
    debugLog('Added submit listener to chatForm');
    publishDebugState({ phase: 'initialized' });
    debugLog('Widget initialized successfully', window.__FLUXBOT_WIDGET_DEBUG__);

    loadConversationState();

    // W1 — Behavioral tracking setup
    setupBehavioralTracking();
    trackEvent('page_view');

    // W1 — Dwell time (every 30s while page visible)
    dwellTimer = setInterval(function () {
      if (document.visibilityState !== 'hidden') {
        trackEvent('dwell_time', { dwellTimeSeconds: 30 });
      }
    }, 30000);

    // W1 — Product view detection
    detectProductView();
  }

  function getLauncherIconMarkup(style) {
    if (style === 'spark') {
      return '<path d="M12 3L13.9 8.1L19 10L13.9 11.9L12 17L10.1 11.9L5 10L10.1 8.1L12 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M19 4V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M20.5 5.5H17.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    }

    if (style === 'store') {
      return '<path d="M4 10H20V20H4V10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M3 10L5 5H19L21 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M9 20V14H15V20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    }

    return '<path d="M21 11.5C21.0034 12.8199 20.6951 14.1219 20.1 15.3C19.3944 16.7118 18.3098 17.8992 16.9674 18.7293C15.6251 19.5594 14.0782 19.9994 12.5 20C11.1801 20.0035 9.87812 19.6951 8.7 19.1L3 21L4.9 15.3C4.30493 14.1219 3.99656 12.8199 4 11.5C4.00061 9.92179 4.44061 8.37488 5.27072 7.03258C6.10083 5.69028 7.28825 4.6056 8.7 3.90003C9.87812 3.30496 11.1801 2.99659 12.5 3.00003H13C15.0843 3.11502 17.053 3.99479 18.5291 5.47089C20.0052 6.94699 20.885 8.91568 21 11V11.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  }

  function updateLauncherButtonA11y() {
    if (!launcherButton) return;

    if (isOpen) {
      launcherButton.setAttribute('aria-label', i18n.closeChat);
      return;
    }

    launcherButton.setAttribute(
      'aria-label',
      launcherLabelText ? i18n.openChat + ': ' + launcherLabelText : i18n.openChat
    );
  }

  function applyLauncherPresentation() {
    if (!launcher || !launcherButton) return;

    var chatIcon = launcherButton.querySelector('.fluxbot-launcher__icon--chat');
    if (chatIcon) {
      chatIcon.innerHTML = getLauncherIconMarkup(launcherAvatarStyle);
    }

    var label = launcher.querySelector('.fluxbot-launcher__label');
    if (label) {
      if (launcherLabelText) {
        label.textContent = launcherLabelText;
        label.hidden = false;
      } else {
        label.textContent = '';
        label.hidden = true;
      }
    }

    updateLauncherButtonA11y();
  }

  function applyLocaleToUi(elements) {
    i18n = getI18n(effectiveLocale);
    launcher.dataset.locale = effectiveLocale;

    if (chatInput) {
      chatInput.setAttribute('placeholder', i18n.inputPlaceholder);
      chatInput.setAttribute('aria-label', i18n.inputPlaceholder);
    }

    var closeBtn = elements && elements.closeBtn;
    if (closeBtn) {
      closeBtn.setAttribute('aria-label', i18n.closeChat);
    }

    var submitBtn = elements && elements.submitBtn;
    if (submitBtn) {
      submitBtn.setAttribute('aria-label', i18n.sendMessage);
    }

    var branding = elements && elements.branding;
    if (branding) {
      branding.textContent = i18n.poweredBy;
    }

    var productButtons = document.querySelectorAll('.fluxbot-product-card__add');
    productButtons.forEach(function (button) {
      var el = button;
      if (!el || el.disabled) return;
      el.textContent = i18n.addToCart;
    });

    if (effectiveLocale.toLowerCase().startsWith('ar')) {
      launcher.setAttribute('dir', 'rtl');
    } else {
      launcher.removeAttribute('dir');
    }
  }

  function getWidgetTitle(config) {
    var nextTitle = sanitizeAttr(config && config.botName);
    if (nextTitle) {
      return nextTitle.slice(0, 64);
    }

    return resolveConfigLocale(config) === 'en' ? 'AI Assistant' : 'Asistente AI';
  }

  function getWidgetSubtitle(config) {
    var isEnglish = resolveConfigLocale(config) === 'en';
    var goal =
      config && (config.botGoal === 'SALES' || config.botGoal === 'SUPPORT' || config.botGoal === 'SALES_SUPPORT')
        ? config.botGoal
        : 'SALES_SUPPORT';

    if (goal === 'SALES') {
      return isEnglish ? 'Online · Sales mode' : 'En linea · Modo ventas';
    }

    if (goal === 'SUPPORT') {
      return isEnglish ? 'Online · Support mode' : 'En linea · Modo soporte';
    }

    return isEnglish ? 'Online · Sales + support' : 'En linea · Ventas + soporte';
  }

  function applyRemoteWidgetConfig(config) {
    if (!config || typeof config !== 'object') return;

    setWidgetLocale(resolveConfigLocale(config));

    if (config.onboardingCompleted === false) {
      launcherLabelText = '';
      launcherAvatarStyle = 'assistant';
      document.documentElement.style.setProperty('--fluxbot-primary-color', '#008060');
      launcher.classList.remove('fluxbot-launcher--bottom-right', 'fluxbot-launcher--bottom-left');
      launcher.classList.add('fluxbot-launcher--bottom-right');
      applyLocaleToUi({
        closeBtn: chatWindow && chatWindow.querySelector('.fluxbot-chat-window__close'),
        submitBtn: chatForm && chatForm.querySelector('.fluxbot-chat-form__submit'),
        branding: chatWindow && chatWindow.querySelector('.fluxbot-chat-window__branding'),
      });
      applyLauncherPresentation();
      return;
    }

    var configVersion = typeof config.configVersion === 'string' ? config.configVersion : '';
    if (configVersion) {
      if (lastAppliedConfigVersion && configVersion <= lastAppliedConfigVersion) {
        return;
      }
      lastAppliedConfigVersion = configVersion;
    }

    var nextLabel = sanitizeAttr(config.launcherLabel);
    launcherLabelText = nextLabel ? nextLabel.slice(0, 64) : '';

    if (config.avatarStyle === 'assistant' || config.avatarStyle === 'spark' || config.avatarStyle === 'store') {
      launcherAvatarStyle = config.avatarStyle;
    }

    // Apply primary color from admin config (single source of truth)
    if (typeof config.primaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(config.primaryColor)) {
      document.documentElement.style.setProperty('--fluxbot-primary-color', config.primaryColor);
    }

    // Apply launcher position from admin config (single source of truth)
    if (config.launcherPosition === 'bottom-left' || config.launcherPosition === 'bottom-right') {
      launcher.classList.remove('fluxbot-launcher--bottom-right', 'fluxbot-launcher--bottom-left');
      launcher.classList.add('fluxbot-launcher--' + config.launcherPosition);
    }

    // Apply welcome message from admin config (update first bot bubble if present)
    if (typeof config.welcomeMessage === 'string' && config.welcomeMessage.trim() && messagesContainer) {
      var firstBubble = messagesContainer.querySelector('.fluxbot-message--assistant .fluxbot-message__content');
      if (firstBubble) {
        firstBubble.textContent = config.welcomeMessage.trim();
      }
    }

    var title = chatWindow && chatWindow.querySelector('.fluxbot-chat-window__title');
    if (title) {
      title.textContent = getWidgetTitle(config);
    }

    var subtitle = chatWindow && chatWindow.querySelector('.fluxbot-chat-window__subtitle');
    if (subtitle) {
      subtitle.textContent = getWidgetSubtitle(config);
    }

    applyLocaleToUi({
      closeBtn: chatWindow && chatWindow.querySelector('.fluxbot-chat-window__close'),
      submitBtn: chatForm && chatForm.querySelector('.fluxbot-chat-form__submit'),
      branding: chatWindow && chatWindow.querySelector('.fluxbot-chat-window__branding'),
    });
    applyLauncherPresentation();
    applyLocalizedStaticLabels();
  }

  function loadRemoteWidgetConfig() {
    if (widgetConfigLoadPromise) {
      debugLog('Widget config fetch reused', {
        widgetConfigLoaded: widgetConfigLoaded,
        chatEndpoint: chatEndpoint,
      });
      return widgetConfigLoadPromise;
    }

    debugLog('Widget config fetch start', {
      endpoint: CONFIG_ENDPOINT,
      headers: buildProxyHeaders(),
      expectedChatEndpoint: 'https://<active-app-url>/chat',
      currentChatEndpoint: chatEndpoint,
    });

    widgetConfigLoadPromise = fetch(CONFIG_ENDPOINT, {
      method: 'GET',
      headers: buildProxyHeaders(),
    })
      .then(async function (res) {
        debugLog('Widget config fetch response', {
          url: res.url,
          status: res.status,
          ok: res.ok,
          contentType: res.headers.get('content-type'),
        });
        if (!res.ok) {
          debugWarn('Widget config fetch failed', {
            status: res.status,
            bodyPreview: await readResponsePreview(res),
          });
          return null;
        }
        return res.json();
      })
      .then(function (payload) {
        debugLog('Widget config payload', {
          success: payload && payload.success,
          configVersion: payload && payload.configVersion,
          apiBaseUrl: payload && payload.apiBaseUrl,
          chatEndpoint: payload && payload.chatEndpoint,
          botLanguage: payload && payload.botLanguage,
          supportedLanguages: payload && payload.supportedLanguages,
          hasWidgetBranding: !!(payload && payload.widgetBranding),
        });
        if (!payload || payload.success !== true || !payload.widgetBranding) {
          debugWarn('Widget config ignored because payload is incomplete', payload);
          return;
        }
        if (sanitizeAttr(launcher.dataset.chatEndpoint)) {
          debugWarn('Widget config chatEndpoint ignored because Liquid override is set', {
            override: sanitizeAttr(launcher.dataset.chatEndpoint),
            payloadChatEndpoint: payload.chatEndpoint,
          });
          chatEndpoint = sanitizeAttr(launcher.dataset.chatEndpoint);
        } else if (typeof payload.chatEndpoint === 'string' && payload.chatEndpoint) {
          if (payload.chatEndpoint.indexOf('/apps/fluxbot/') !== -1) {
            chatEndpoint = payload.chatEndpoint;
          } else {
            // W7 — Remote config must never override the proxy path with a direct backend URL.
            debugWarn('REJECTED remote chatEndpoint (not a proxy path); keeping canonical', {
              payloadChatEndpoint: payload.chatEndpoint,
              keptEndpoint: API_ENDPOINT,
              reason: 'non-proxy-endpoint-blocked',
            });
            chatEndpoint = API_ENDPOINT;
          }
        } else if (typeof payload.apiBaseUrl === 'string' && payload.apiBaseUrl) {
          debugWarn('Widget config apiBaseUrl without chatEndpoint; using signed app proxy', {
            payloadApiBaseUrl: payload.apiBaseUrl,
            appProxyEndpoint: API_ENDPOINT,
          });
          chatEndpoint = API_ENDPOINT;
        }
        debugLog('Widget config chatEndpoint servido', {
          chatEndpoint: chatEndpoint,
          configChatEndpoint: payload.chatEndpoint,
          liquidOverride: sanitizeAttr(launcher.dataset.chatEndpoint),
        });
        var mergedConfig = Object.assign({}, payload.widgetBranding, {
          configVersion: payload.configVersion,
          botLanguage: payload.botLanguage,
          supportedLanguages: payload.supportedLanguages,
        });
        applyRemoteWidgetConfig(mergedConfig);
        publishDebugState({
          phase: 'config-loaded',
          remoteConfigVersion: payload.configVersion,
          remoteApiBaseUrl: payload.apiBaseUrl,
          remoteChatEndpoint: payload.chatEndpoint,
        });
      })
      .catch(function (error) {
        debugError('Widget config fetch exception', {
          message: error && error.message,
          stack: error && error.stack,
        });
      })
      .finally(function () {
        widgetConfigLoaded = true;
        publishDebugState({ phase: 'config-finished' });
        debugLog('Widget config fetch finished', {
          widgetConfigLoaded: widgetConfigLoaded,
          chatEndpoint: chatEndpoint,
          debugState: window.__FLUXBOT_WIDGET_DEBUG__,
        });
      });

    return widgetConfigLoadPromise;
  }

  function waitForWidgetConfig(timeoutMs) {
    var timeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 1200;
    debugLog('Waiting for widget config', {
      timeoutMs: timeout,
      widgetConfigLoaded: widgetConfigLoaded,
      chatEndpoint: chatEndpoint,
    });
    return Promise.race([
      loadRemoteWidgetConfig(),
      new Promise(function (resolve) {
        setTimeout(function () {
          debugWarn('Widget config wait timeout reached', {
            timeoutMs: timeout,
            widgetConfigLoaded: widgetConfigLoaded,
            chatEndpoint: chatEndpoint,
          });
          resolve();
        }, timeout);
      }),
    ]);
  }

  // ─── W1 — Behavioral tracking ─────────────────────────────────────────────
  function setupBehavioralTracking() {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(function () { reportScrollDepth(); ticking = false; });
        ticking = true;
      }
    }, { passive: true });

    document.addEventListener('mouseleave', function (e) {
      if (e.clientY <= 0) trackEvent('exit_intent', { trigger: 'mouseleave_top' });
    });

    window.addEventListener('pagehide', function () {
      trackEvent('exit_intent', { trigger: 'pagehide' });
      if (conversationId) trackEvent('page_exit');
    });

    window.addEventListener('beforeunload', function () {
      if (conversationId) trackEvent('page_exit');
    });

    document.addEventListener('visibilitychange', function () {
      if (proactivePollTimer) {
        clearInterval(proactivePollTimer);
        var interval = document.visibilityState === 'hidden' ? 30000 : 15000;
        proactivePollTimer = setInterval(pollProactiveMessages, interval);
      }
    });
  }

  function reportScrollDepth() {
    var scrolled = window.scrollY + window.innerHeight;
    var total = document.documentElement.scrollHeight;
    if (total === 0) return;
    var pct = Math.round((scrolled / total) * 100);
    [25, 50, 75, 100].forEach(function (threshold) {
      if (pct >= threshold && !scrollDepthReported[threshold]) {
        scrollDepthReported[threshold] = true;
        trackEvent('scroll_depth', { scrollDepthPercent: threshold });
      }
    });
  }

  function detectProductView() {
    var match = window.location.pathname.match(/\/products\/([^/?#]+)/);
    if (match) {
      trackEvent('product_view', { productHandle: match[1], url: window.location.href });
    }
  }

  // ─── Chat open/close ──────────────────────────────────────────────────────
  function toggleChat() {
    debugLog('toggleChat called', {
      isOpen: isOpen,
      debugVersion: DEBUG_VERSION,
      chatEndpoint: chatEndpoint,
      widgetConfigLoaded: widgetConfigLoaded,
    });
    if (isOpen) { closeChat(); } else { openChat(); }
  }

  function openChat() {
    debugLog('openChat called', {
      hasConsent: hasConsent,
      chatEndpoint: chatEndpoint,
      widgetConfigLoaded: widgetConfigLoaded,
      debugVersion: DEBUG_VERSION,
    });
    isOpen = true;
    chatWindow.hidden = false;
    chatWindow.style.display = 'flex';
    launcherButton.setAttribute('aria-expanded', 'true');
    launcher.classList.add('fluxbot-launcher--open');
    updateLauncherButtonA11y();
    publishDebugState({ phase: 'chat-opened' });
    debugLog('Chat opened', {
      hidden: chatWindow.hidden,
      display: chatWindow.style.display,
      debugState: window.__FLUXBOT_WIDGET_DEBUG__,
    });

    if (!hasConsent) {
      showConsentOverlay();
    } else {
      chatInput.focus();
      if (!proactivePollTimer) {
        proactivePollTimer = setInterval(pollProactiveMessages, 15000);
      }
    }

    trackEvent('chat_opened');
  }

  function closeChat() {
    debugLog('closeChat called', {
      conversationId: conversationId,
      chatEndpoint: chatEndpoint,
    });
    isOpen = false;
    chatWindow.hidden = true;
    chatWindow.style.display = 'none';
    launcherButton.setAttribute('aria-expanded', 'false');
    launcher.classList.remove('fluxbot-launcher--open');
    updateLauncherButtonA11y();
    publishDebugState({ phase: 'chat-closed' });
    debugLog('Chat closed', {
      hidden: chatWindow.hidden,
      display: chatWindow.style.display,
    });
    trackEvent('chat_closed');
  }

  // ─── W4 — Consent overlay (inside chat window) ───────────────────────────
  function renderConsentBanner() {
    if (document.getElementById('fluxbot-consent-overlay')) return;

    var privacyUrl  = sanitizeUrl(launcher.dataset.privacyUrl) || '#';
    var privacyText = sanitizeAttr(launcher.dataset.privacyText) || i18n.consentPrivacy;

    var overlay = document.createElement('div');
    overlay.id = 'fluxbot-consent-overlay';
    overlay.className = 'fluxbot-consent-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', i18n.consentTitle);

    // Shield icon
    var iconWrap = document.createElement('div');
    iconWrap.className = 'fluxbot-consent-overlay__icon-wrap';
    iconWrap.setAttribute('aria-hidden', 'true');
    var iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('width', '28');
    iconSvg.setAttribute('height', '28');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.setAttribute('fill', 'none');
    var iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    iconPath.setAttribute('d', 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z');
    iconPath.setAttribute('stroke', 'currentColor');
    iconPath.setAttribute('stroke-width', '2');
    iconPath.setAttribute('stroke-linecap', 'round');
    iconPath.setAttribute('stroke-linejoin', 'round');
    iconSvg.appendChild(iconPath);
    iconWrap.appendChild(iconSvg);

    var title = document.createElement('h3');
    title.className = 'fluxbot-consent-overlay__title';
    title.textContent = i18n.consentTitle;

    var body = document.createElement('p');
    body.className = 'fluxbot-consent-overlay__body';
    body.textContent = i18n.consentBody;

    var link = document.createElement('a');
    link.href = privacyUrl;
    link.className = 'fluxbot-consent-overlay__link';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.appendChild(document.createTextNode(privacyText));
    // External link indicator (SVG, no user data)
    var extSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    extSvg.setAttribute('width', '11');
    extSvg.setAttribute('height', '11');
    extSvg.setAttribute('viewBox', '0 0 24 24');
    extSvg.setAttribute('fill', 'none');
    extSvg.setAttribute('aria-hidden', 'true');
    var extPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    extPath.setAttribute('d', 'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3');
    extPath.setAttribute('stroke', 'currentColor');
    extPath.setAttribute('stroke-width', '2.2');
    extPath.setAttribute('stroke-linecap', 'round');
    extPath.setAttribute('stroke-linejoin', 'round');
    extSvg.appendChild(extPath);
    link.appendChild(extSvg);

    var actions = document.createElement('div');
    actions.className = 'fluxbot-consent-overlay__actions';

    var acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'fluxbot-consent-overlay__accept';
    acceptBtn.textContent = i18n.consentAccept;
    acceptBtn.addEventListener('click', function () { handleConsent(true); });

    var declineBtn = document.createElement('button');
    declineBtn.type = 'button';
    declineBtn.className = 'fluxbot-consent-overlay__decline';
    declineBtn.textContent = i18n.consentDecline;
    declineBtn.addEventListener('click', function () { handleConsent(false); });

    actions.appendChild(acceptBtn);
    actions.appendChild(declineBtn);
    overlay.appendChild(iconWrap);
    overlay.appendChild(title);
    overlay.appendChild(body);
    overlay.appendChild(link);
    overlay.appendChild(actions);
    chatWindow.appendChild(overlay);
  }

  function showConsentOverlay() {
    var o = document.getElementById('fluxbot-consent-overlay');
    if (o) { o.hidden = false; } else { renderConsentBanner(); }
  }

  function shouldSendTunnelBypassHeader(targetUrl) {
    if (!targetUrl || typeof targetUrl !== 'string') return false;
    return /ngrok(-free)?\.app|ngrok\.io/i.test(targetUrl);
  }

  function buildProxyHeaders(contentType, targetUrl) {
    var headers = {
      Accept: 'application/json',
    };
    if (shouldSendTunnelBypassHeader(targetUrl)) {
      headers[PROXY_BYPASS_HEADER] = 'true';
    }

    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    return headers;
  }

  function buildJsonRequestOptions(method, payload, keepalive, targetUrl) {
    return {
      method: method,
      headers: buildProxyHeaders('text/plain;charset=UTF-8', targetUrl),
      body: JSON.stringify(payload),
      keepalive: !!keepalive,
    };
  }

  function handleConsent(granted) {
    hasConsent = granted;
    safeSet(localStorage, 'fluxbot_consent',
      JSON.stringify({ granted: granted, ts: new Date().toISOString(), version: '1.0' }));

    var payload = {
      granted: granted,
      visitorId: visitorId,
      customerId: sanitizeAttr(launcher.dataset.customerId) || undefined,
      shop: sanitizeAttr(launcher.dataset.shop),
      locale: widgetLocale,
      consentVersion: '1.0',
    };

    if (navigator.sendBeacon) {
      var blob = new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=UTF-8' });
      navigator.sendBeacon(CONSENT_ENDPOINT, blob);
    } else {
      fetch(CONSENT_ENDPOINT, buildJsonRequestOptions('POST', payload, true)).catch(function () {});
    }

    var overlay = document.getElementById('fluxbot-consent-overlay');
    if (overlay) overlay.remove();

    if (!granted) { closeChat(); launcher.style.display = 'none'; return; }
    chatInput.focus();
    if (!proactivePollTimer) {
      proactivePollTimer = setInterval(pollProactiveMessages, 15000);
    }
  }

  // ─── Message send ─────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    var message = chatInput.value.trim();
    if (!message || isTyping) {
      debugWarn('Submit ignored', {
        hasMessage: !!message,
        isTyping: isTyping,
      });
      return;
    }

    debugLog('Submit accepted', {
      messageLength: message.length,
      conversationId: conversationId,
      sessionId: sessionId,
      visitorId: visitorId,
      chatEndpoint: chatEndpoint,
      widgetConfigLoaded: widgetConfigLoaded,
      dataset: summarizeLauncherDataset(),
    });

    // W6 — Debounce
    var now = Date.now();
    if (now - lastSendAt < SEND_DEBOUNCE_MS) {
      debugWarn('Submit ignored by debounce', {
        elapsedMs: now - lastSendAt,
        debounceMs: SEND_DEBOUNCE_MS,
      });
      return;
    }
    lastSendAt = now;

    // W6 — Rate limit
    msgTimestamps = msgTimestamps.filter(function (t) { return now - t < MSG_RATE_WINDOW; });
    if (msgTimestamps.length >= MSG_RATE_LIMIT) {
      debugWarn('Submit blocked by rate limit', {
        count: msgTimestamps.length,
        limit: MSG_RATE_LIMIT,
        windowMs: MSG_RATE_WINDOW,
      });
      addMessage(i18n.rateLimitMsg, 'assistant');
      return;
    }
    msgTimestamps.push(now);

    chatInput.value = '';
    addMessage(message, 'user');
    showTypingIndicator();

    try {
      var response = await sendMessage(message);
      hideTypingIndicator();

      if (response.message) {
        response.message = sanitizeAssistantMessage(response.message);
        var mergedMetadata = response.metadata || {};
        if (Array.isArray(response.actions)) {
          var actionProducts = response.actions
            .filter(function (a) { return a && typeof a === 'object'; })
            .flatMap(function (a) {
              if (Array.isArray(a.products)) return a.products;
              if (a.product && typeof a.product === 'object') return [a.product];
              return [];
            });
          if (actionProducts.length > 0) {
            mergedMetadata.products = Array.isArray(mergedMetadata.products)
              ? mergedMetadata.products.concat(actionProducts) : actionProducts;
          }
        }
        if (Array.isArray(mergedMetadata.products)) {
          mergedMetadata.products = deduplicateProducts(mergedMetadata.products);
        }
        addMessage(response.message, 'assistant', mergedMetadata);

        // W3 — Handoff detection
        if (response.requiresEscalation === true && !isHandoffActive) {
          showHandoffUI(response.handoff && response.handoff.reason);
        }
      }

      if (response.conversationId) {
        conversationId = response.conversationId;
        saveConversationState();
      }
      retryCount = 0;

    } catch (error) {
      debugError('Chat error', {
        message: error && error.message,
        stack: error && error.stack,
        debugState: window.__FLUXBOT_WIDGET_DEBUG__,
      });
      hideTypingIndicator();
      if (retryCount < MAX_RETRIES) { addMessage(i18n.errorRetry, 'assistant'); retryCount++; }
      else { addMessage(i18n.errorMax, 'assistant'); }
    }
  }

  async function sendMessage(message) {
    var traceId = generateTraceId();
    debugLog('sendMessage start', {
      traceId: traceId,
      debugVersion: DEBUG_VERSION,
      widgetConfigLoaded: widgetConfigLoaded,
      initialChatEndpoint: chatEndpoint,
      apiEndpoint: API_ENDPOINT,
    });

    if (!widgetConfigLoaded) {
      await waitForWidgetConfig(1200);
    }

    var endpoint = chatEndpoint || API_ENDPOINT;
    // W7 — Enforce proxy path: never allow a direct backend URL from config.
    if (endpoint.indexOf('/apps/fluxbot/') === -1) {
      debugWarn('Endpoint is not a Shopify proxy path; forcing canonical proxy', {
        requestedEndpoint: endpoint,
        forcedEndpoint: API_ENDPOINT,
        traceId: traceId,
      });
      endpoint = API_ENDPOINT;
    }
    var payload = {
      message: message,
      conversationId: conversationId,
      sessionId: sessionId,
      visitorId: visitorId,
      locale: widgetLocale,
      traceId: traceId,
      context: {
        shop: sanitizeAttr(launcher.dataset.shop),
        locale: widgetLocale,
        customerId: sanitizeAttr(launcher.dataset.customerId) || undefined,
        customerEmail: sanitizeAttr(launcher.dataset.customerEmail) || undefined,
        url: window.location.href,
        referrer: document.referrer,
      },
    };

    publishDebugState({
      phase: 'chat-request-start',
      lastChatEndpoint: endpoint,
      traceId: traceId,
    });
    debugLog('Chat request prepared', {
      traceId: traceId,
      endpoint: endpoint,
      fallbackEndpoint: API_ENDPOINT,
      endpointIsProxy: endpoint.indexOf('/apps/fluxbot/chat') !== -1,
      sendsTunnelBypassHeader: shouldSendTunnelBypassHeader(endpoint),
      requestHeaders: buildProxyHeaders('text/plain;charset=UTF-8', endpoint),
      payload: {
        messageLength: message.length,
        conversationId: payload.conversationId,
        sessionId: payload.sessionId,
        visitorId: payload.visitorId,
        context: {
          shop: payload.context.shop,
          locale: payload.context.locale,
          customerIdPresent: !!payload.context.customerId,
          customerEmail: maskEmail(payload.context.customerEmail),
          url: payload.context.url,
          referrer: payload.context.referrer,
        },
      },
    });

    var reqOptions = buildJsonRequestOptions('POST', payload, false, endpoint);
    reqOptions.headers['X-FluxBot-Trace-Id'] = traceId;
    var res = await fetch(endpoint, reqOptions);
    debugLog('Chat response received', {
      traceId: traceId,
      endpoint: endpoint,
      url: res.url,
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get('content-type'),
    });
    if (!res.ok && endpoint === API_ENDPOINT) {
      await waitForWidgetConfig(1200);
      var refreshedEndpoint = chatEndpoint || API_ENDPOINT;
      if (refreshedEndpoint !== endpoint) {
        debugWarn('Retrying chat with refreshed endpoint', {
          previousEndpoint: endpoint,
          refreshedEndpoint: refreshedEndpoint,
          traceId: traceId,
        });
        var retryOptions = buildJsonRequestOptions('POST', payload, false, refreshedEndpoint);
        retryOptions.headers['X-FluxBot-Trace-Id'] = traceId;
        res = await fetch(refreshedEndpoint, retryOptions);
        debugLog('Refreshed chat response received', {
          endpoint: refreshedEndpoint,
          url: res.url,
          status: res.status,
          ok: res.ok,
          contentType: res.headers.get('content-type'),
        });
      }
    }
    if (!res.ok && endpoint !== API_ENDPOINT) {
      debugWarn('Retrying chat with app proxy fallback', {
        failedEndpoint: endpoint,
        fallbackEndpoint: API_ENDPOINT,
        failedStatus: res.status,
        failedBodyPreview: await readResponsePreview(res),
        traceId: traceId,
      });
      var fallbackOptions = buildJsonRequestOptions('POST', payload, false, API_ENDPOINT);
      fallbackOptions.headers['X-FluxBot-Trace-Id'] = traceId;
      res = await fetch(API_ENDPOINT, fallbackOptions);
      debugLog('Fallback chat response received', {
        endpoint: API_ENDPOINT,
        url: res.url,
        status: res.status,
        ok: res.ok,
        contentType: res.headers.get('content-type'),
      });
    }
    if (!res.ok) {
      var errorBodyPreview = await readResponsePreview(res);
      publishDebugState({
        phase: 'chat-request-failed',
        lastChatStatus: res.status,
        lastChatEndpoint: endpoint,
        lastChatErrorBodyPreview: errorBodyPreview,
        traceId: traceId,
      });
      debugError('Chat request failed after retries', {
        traceId: traceId,
        status: res.status,
        endpoint: endpoint,
        fallbackEndpoint: API_ENDPOINT,
        bodyPreview: errorBodyPreview,
        debugState: window.__FLUXBOT_WIDGET_DEBUG__,
      });
      throw new Error('HTTP ' + res.status);
    }

    var data = await res.json();
    var serverTraceId = res.headers.get('X-FluxBot-Trace-Id') || traceId;
    publishDebugState({
      phase: 'chat-request-success',
      lastChatStatus: res.status,
      lastChatEndpoint: endpoint,
      conversationId: data.conversationId || conversationId,
      traceId: serverTraceId,
    });
    debugLog('Chat response parsed', {
      traceId: serverTraceId,
      success: data.success,
      conversationId: data.conversationId,
      hasMessage: !!data.message,
      confidence: data.confidence,
      requiresEscalation: data.requiresEscalation,
      actionCount: Array.isArray(data.actions) ? data.actions.length : 0,
      metadataProductCount:
        data.metadata && Array.isArray(data.metadata.products) ? data.metadata.products.length : 0,
    });
    return data;
  }

  function sanitizeAssistantMessage(text) {
    if (typeof text !== 'string') return i18n.greeting;
    var normalized = text.trim();
    if (!normalized) return i18n.greeting;

    var blocked = [
      'Sorry, I had trouble processing that. Please try again.',
      'I apologize, but I encountered an issue processing your request. Please try again.',
    ];

    if (blocked.indexOf(normalized) !== -1) {
      return i18n.greeting;
    }

    return normalized;
  }

  // ─── W6 — Safe markdown rendering (no innerHTML) ─────────────────────────
  function renderMarkdown(text, container) {
    var LINK_RE = /\[([^\]]{1,200})\]\((https?:\/\/[^)]{1,2000})\)/g;
    var lastIndex = 0;
    var match;
    while ((match = LINK_RE.exec(text)) !== null) {
      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      var anchor = document.createElement('a');
      anchor.href = match[2];
      anchor.textContent = match[1];
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      container.appendChild(anchor);
      lastIndex = LINK_RE.lastIndex;
    }
    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function addMessage(content, role, metadata) {
    metadata = metadata || {};
    var messageEl = document.createElement('div');
    messageEl.className = 'fluxbot-message fluxbot-message--' + role;
    var contentEl = document.createElement('div');
    contentEl.className = 'fluxbot-message__content';
    renderMarkdown(content, contentEl);
    messageEl.appendChild(contentEl);
    if (metadata.products && Array.isArray(metadata.products) && metadata.products.length > 0) {
      debugLog('Assistant message includes product metadata', {
        productCount: metadata.products.length,
        products: metadata.products.slice(0, 3).map(summarizeProductForDebug),
      });
      messageEl.appendChild(createProductCards(metadata.products));
    }
    messagesContainer.appendChild(messageEl);
    scrollToBottom();
  }

  function getProductDedupKey(product) {
    if (!product || typeof product !== 'object') return '';

    return String(
      product.variantId ||
      product.variant_id ||
      product.productId ||
      product.product_id ||
      product.handle ||
      product.url ||
      product.title ||
      ''
    ).trim().toLowerCase();
  }

  function deduplicateProducts(products) {
    if (!Array.isArray(products)) return [];

    var seen = {};
    return products.filter(function (product) {
      var key = getProductDedupKey(product);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function extractNumericResourceId(value) {
    if (!value) return null;
    var match = String(value).match(/(\d+)(?!.*\d)/);
    return match && match[1] ? match[1] : null;
  }

  function isValidVariantIdValue(value) {
    if (!value && value !== 0) return false;
    var normalized = String(value).trim();
    return /^(\d+|gid:\/\/shopify\/ProductVariant\/\d+)$/i.test(normalized);
  }

  function isProductMarkedUnavailable(product) {
    if (!product || typeof product !== 'object') return true;
    return product.availableForSale === false ||
      product.available === false ||
      product.inStock === false ||
      product.isAvailable === false ||
      product.purchasable === false ||
      product.soldOut === true ||
      product.stockStatus === 'SOLD_OUT';
  }

  function isVariantPurchasable(variant) {
    if (!variant || typeof variant !== 'object') return false;
    if (variant.availableForSale === false ||
        variant.available === false ||
        variant.inStock === false ||
        variant.isAvailable === false ||
        variant.purchasable === false) {
      return false;
    }

    var quantities = [
      variant.quantityAvailable,
      variant.inventoryQuantity,
      variant.inventory_quantity,
    ];

    for (var i = 0; i < quantities.length; i += 1) {
      if (typeof quantities[i] === 'number' && quantities[i] <= 0) {
        return false;
      }
    }

    if (variant.inventoryPolicy === 'DENY') {
      for (var j = 0; j < quantities.length; j += 1) {
        if (typeof quantities[j] === 'number' && quantities[j] <= 0) {
          return false;
        }
      }
    }

    return true;
  }

  function resolvePurchasableVariant(product) {
    if (!product || typeof product !== 'object' || isProductMarkedUnavailable(product)) {
      return null;
    }

    var productId = product.productId || product.product_id || product.id || null;
    var productRef = product.handle || productId || null;
    var directVariantIds = [
      product.variantId,
      product.variant_id,
      product.selectedVariantId,
      product.selected_variant_id,
    ];

    for (var i = 0; i < directVariantIds.length; i += 1) {
      if (isValidVariantIdValue(directVariantIds[i])) {
        return {
          variantId: String(directVariantIds[i]),
          productId: productId ? String(productId) : null,
          productRef: productRef ? String(productRef) : null,
          source: 'direct',
        };
      }
    }

    var variants = Array.isArray(product.variants) ? product.variants : [];
    for (var j = 0; j < variants.length; j += 1) {
      var variant = variants[j];
      var candidateId = variant && (variant.variantId || variant.variant_id || variant.id || variant.gid);
      if (!isValidVariantIdValue(candidateId) || !isVariantPurchasable(variant)) {
        continue;
      }
      return {
        variantId: String(candidateId),
        productId: productId ? String(productId) : null,
        productRef: productRef ? String(productRef) : null,
        source: 'variants',
      };
    }

    return null;
  }

  async function readJsonPreview(response) {
    try {
      return await response.clone().json();
    } catch (error) {
      return null;
    }
  }

  function extractErrorDescription(parsedBody, fallbackText) {
    if (!parsedBody) return fallbackText || '';

    if (typeof parsedBody === 'string') {
      return parsedBody;
    }

    if (typeof parsedBody.description === 'string' && parsedBody.description.trim()) {
      return parsedBody.description.trim();
    }

    if (typeof parsedBody.message === 'string' && parsedBody.message.trim()) {
      return parsedBody.message.trim();
    }

    if (typeof parsedBody.error === 'string' && parsedBody.error.trim()) {
      return parsedBody.error.trim();
    }

    if (Array.isArray(parsedBody.errors)) {
      return parsedBody.errors
        .map(function (entry) { return typeof entry === 'string' ? entry : JSON.stringify(entry); })
        .join(', ');
    }

    if (parsedBody.errors && typeof parsedBody.errors === 'object') {
      return Object.keys(parsedBody.errors)
        .map(function (key) {
          var value = parsedBody.errors[key];
          if (Array.isArray(value)) return key + ': ' + value.join(', ');
          if (typeof value === 'string') return key + ': ' + value;
          return key + ': ' + JSON.stringify(value);
        })
        .join(', ');
    }

    return fallbackText || '';
  }

  function classifyCartAddFailure(httpStatus, errorDescription, productContext) {
    var lowerDescription = String(errorDescription || '').toLowerCase();
    var hasVariantContext = productContext && productContext.variantId;

    if (httpStatus === 422 && /cannot find variant/.test(lowerDescription)) {
      return {
        code: 'variant_not_found',
        message: i18n.cartVariantNotFound,
      };
    }

    if (httpStatus === 422 && /(sold out|unavailable|out of stock)/.test(lowerDescription)) {
      return {
        code: 'variant_unavailable',
        message: i18n.cartVariantUnavailable,
      };
    }

    if (!hasVariantContext || /variant/i.test(lowerDescription) || /product option/i.test(lowerDescription)) {
      return {
        code: 'variant_invalid',
        message: i18n.cartVariantInvalid,
      };
    }

    return {
      code: 'cart_error',
      message: i18n.cartError,
    };
  }

  function getCartRoot() {
    return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  }

  function getCartPageUrl(cartRoot) {
    return sanitizeUrl((cartRoot || '/') + 'cart') || '/cart';
  }

  function getCartBadgeCandidates() {
    return [
      '[data-fluxbot-cart-badge]',
      '[data-cart-count]',
      '.cart-count-bubble',
      '#CartCount',
      '#cart-count',
      '[aria-label*="cart"] [data-count]',
    ];
  }

  function updateCartBadges(cartState) {
    if (!cartState || typeof cartState !== 'object') return;
    var count = typeof cartState.item_count === 'number' ? cartState.item_count : null;
    if (count === null) return;

    var selectors = getCartBadgeCandidates();
    selectors.forEach(function (selector) {
      var badges = document.querySelectorAll(selector);
      badges.forEach(function (badge) {
        if (!badge) return;
        badge.textContent = String(count);
        if (count > 0) {
          badge.removeAttribute('hidden');
          badge.setAttribute('aria-hidden', 'false');
        }
      });
    });
  }

  async function refreshCartState(cartRoot) {
    var response = await fetch((cartRoot || '/') + 'cart.js', {
      method: 'GET',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      var refreshPreview = await readResponsePreview(response);
      throw new Error('Cart refresh failed: HTTP ' + response.status + ' ' + refreshPreview);
    }

    var cartState = await response.json();
    window.__FLUXBOT_CART_STATE__ = cartState;
    updateCartBadges(cartState);
    document.dispatchEvent(new CustomEvent('fluxbot:cart-refreshed', { detail: cartState }));
    return cartState;
  }

  function canOpenDrawerViaApi(target) {
    if (!target) return false;
    if (typeof target.open === 'function') {
      target.open();
      return true;
    }
    if (typeof target.show === 'function') {
      target.show();
      return true;
    }
    return false;
  }

  function openCartDrawerIfAvailable(cartState) {
    var candidates = [
      window.cartDrawer,
      window.theme && window.theme.cartDrawer,
      window.theme && window.theme.drawer,
      window.Shopify && window.Shopify.cartDrawer,
      window.Shopify && window.Shopify.theme && window.Shopify.theme.cartDrawer,
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      if (canOpenDrawerViaApi(candidates[i])) {
        document.dispatchEvent(new CustomEvent('fluxbot:cart-drawer-opened', { detail: cartState || null }));
        return true;
      }
    }

    var drawerButtons = document.querySelectorAll(
      [
        '[data-cart-drawer-open]',
        '[data-cart-drawer-toggle]',
        '[aria-controls="CartDrawer"]',
        '[aria-controls="cart-drawer"]',
        '[data-testid="cart-drawer-open"]',
      ].join(', ')
    );

    for (var j = 0; j < drawerButtons.length; j += 1) {
      if (typeof drawerButtons[j].click === 'function') {
        drawerButtons[j].click();
        document.dispatchEvent(new CustomEvent('fluxbot:cart-drawer-opened', { detail: cartState || null }));
        return true;
      }
    }

    return false;
  }

  function fallbackToCartPage(cartRoot) {
    var cartUrl = getCartPageUrl(cartRoot);
    document.dispatchEvent(new CustomEvent('fluxbot:cart-fallback', { detail: { cartUrl: cartUrl } }));
    if (window.__FLUXBOT_WIDGET_TEST__ && typeof window.__FLUXBOT_WIDGET_TEST__.onCartFallback === 'function') {
      window.__FLUXBOT_WIDGET_TEST__.onCartFallback(cartUrl);
      return;
    }
    if (window.location && typeof window.location.assign === 'function') {
      window.location.assign(cartUrl);
    } else {
      window.location.href = cartUrl;
    }
  }

  function reportCartFailure(details) {
    debugError('Cart add failed', details);
  }

  function reportCartSuccess(details) {
    debugLog('Cart add confirmed by Shopify', details);
  }

  /** Add a pre-built DOM node as a message bubble */
  function addMessageNode(node, role) {
    var messageEl = document.createElement('div');
    messageEl.className = 'fluxbot-message fluxbot-message--' + role;
    var contentEl = document.createElement('div');
    contentEl.className = 'fluxbot-message__content';
    contentEl.appendChild(node);
    messageEl.appendChild(contentEl);
    messagesContainer.appendChild(messageEl);
    scrollToBottom();
  }

  function createProductCards(products) {
    var container = document.createElement('div');
    container.className = 'fluxbot-product-cards';
    var uniqueProducts = deduplicateProducts(products);
    var renderedCount = Math.min(uniqueProducts.length, 3);

    debugLog('Rendering product cards', {
      requestedCount: products.length,
      renderedCount: renderedCount,
      products: uniqueProducts.slice(0, 3).map(summarizeProductForDebug),
    });

    uniqueProducts.slice(0, 3).forEach(function (product) {
      var card = document.createElement('div');
      card.className = 'fluxbot-product-card';
      var purchasableVariant = resolvePurchasableVariant(product);

      var link = document.createElement('a');
      link.href = sanitizeUrl(product.url) || '#';
      link.className = 'fluxbot-product-card__link';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      if (product.image) {
        var img = document.createElement('img');
        img.src = sanitizeUrl(product.image) || '';
        img.alt = product.title ? String(product.title).slice(0, 200) : '';
        img.className = 'fluxbot-product-card__image';
        img.loading = 'lazy';
        link.appendChild(img);
      }

      var info = document.createElement('div');
      info.className = 'fluxbot-product-card__info';

      var titleEl = document.createElement('span');
      titleEl.className = 'fluxbot-product-card__title';
      titleEl.textContent = product.title ? String(product.title).slice(0, 200) : '';
      info.appendChild(titleEl);

      if (product.price) {
        var priceEl = document.createElement('div');
        priceEl.className = 'fluxbot-product-card__price';
        priceEl.textContent = String(product.price).slice(0, 50);
        info.appendChild(priceEl);
      }

      var actions = document.createElement('div');
      actions.className = 'fluxbot-product-card__actions';
      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'fluxbot-product-card__add';
      if (purchasableVariant && purchasableVariant.variantId) {
        addBtn.textContent = i18n.addToCart;
        addBtn.dataset.variantId = purchasableVariant.variantId;
        addBtn.dataset.productId = purchasableVariant.productId || '';
        addBtn.addEventListener('click', (function (p, btn) {
          return function () { addProductToCart(p, btn); };
        })(product, addBtn));
      } else {
        addBtn.disabled = true;
        addBtn.textContent = i18n.cartUnavailable || i18n.cartVariantUnavailable || i18n.cartVariantInvalid;
      }
      actions.appendChild(addBtn);
      link.appendChild(info);
      card.appendChild(link);
      card.appendChild(actions);
      container.appendChild(card);
    });

    debugLog('Product cards rendered', {
      requestedCount: products.length,
      renderedCount: renderedCount,
      cardCount: container.querySelectorAll('.fluxbot-product-card').length,
      buildId: WIDGET_BUILD_ID,
    });

    return container;
  }

  async function addProductToCart(product, buttonEl) {
    var purchasableVariant = resolvePurchasableVariant(product);
    var variantId  = purchasableVariant && purchasableVariant.variantId ? purchasableVariant.variantId : null;
    var productId = purchasableVariant && purchasableVariant.productId ? purchasableVariant.productId : (product.productId || product.product_id || product.id || null);
    var productRef = purchasableVariant && purchasableVariant.productRef ? purchasableVariant.productRef : (product.handle || productId || null);
    var requestKey = variantId || productRef;

    if (!variantId) {
      reportCartFailure({
        productId: productId || null,
        variantId: null,
        httpStatus: 0,
        errorDescription: 'No purchasable variant available',
      });
      addMessage(i18n.cartVariantInvalid, 'assistant');
      return;
    }
    if (cartRequestsInFlight[requestKey]) {
      debugLog('Add to cart ignored: request already in flight', { requestKey: requestKey });
      return;
    }

    cartRequestsInFlight[requestKey] = true;

    buttonEl.disabled = true;
    buttonEl.textContent = i18n.adding;

    try {
      var res = await fetch(CART_ENDPOINT, buildJsonRequestOptions('POST', {
        variantId: variantId, productRef: productRef, quantity: 1,
        conversationId: conversationId,
        sessionId: sessionId, visitorId: visitorId,
      }));
      var payload = await readJsonPreview(res);
      if (!res.ok) {
        var proxyErrorDescription = extractErrorDescription(payload, await readResponsePreview(res));
        reportCartFailure({
          productId: productId || null,
          variantId: variantId,
          httpStatus: res.status,
          errorDescription: proxyErrorDescription,
        });
        var proxyFailure = classifyCartAddFailure(res.status, proxyErrorDescription, { variantId: variantId });
        addMessage(proxyFailure.message, 'assistant');
        return;
      }
      if (!payload || !payload.success) {
        var payloadError = extractErrorDescription(payload, 'Cart add failed');
        reportCartFailure({
          productId: productId || null,
          variantId: variantId,
          httpStatus: res.status,
          errorDescription: payloadError,
        });
        addMessage(classifyCartAddFailure(res.status, payloadError, { variantId: variantId }).message, 'assistant');
        return;
      }

      var resolvedVariantId =
        payload.data && (payload.data.variantId || payload.data.variant_id || payload.data.resolvedVariantId);
      if (!resolvedVariantId) throw new Error('Cart variant unresolved');
      var resolvedVariantNumericId = extractNumericResourceId(resolvedVariantId);
      if (!resolvedVariantNumericId) throw new Error('Cart variant unresolved');
      if (productId && String(productId) === String(resolvedVariantId)) {
        throw new Error('Resolved add-to-cart value matched the product id instead of a variant id');
      }

      var cartRoot = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
      var addToCartRes = await fetch(cartRoot + 'cart/add.js', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          items: [{
            id: Number(resolvedVariantNumericId),
            quantity: 1,
          }],
        }),
      });
      if (!addToCartRes.ok) {
        var shopifyErrorPayload = await readJsonPreview(addToCartRes);
        var shopifyErrorDescription = extractErrorDescription(
          shopifyErrorPayload,
          await readResponsePreview(addToCartRes)
        );
        reportCartFailure({
          productId: productId || null,
          variantId: String(resolvedVariantNumericId),
          httpStatus: addToCartRes.status,
          errorDescription: shopifyErrorDescription,
        });
        var cartFailure = classifyCartAddFailure(addToCartRes.status, shopifyErrorDescription, {
          variantId: String(resolvedVariantNumericId),
        });
        addMessage(cartFailure.message, 'assistant');
        return;
      }

      var cartState = null;
      try {
        cartState = await refreshCartState(cartRoot);
      } catch (refreshError) {
        debugWarn('Cart refresh failed after successful add-to-cart', {
          productId: productId || null,
          variantId: String(resolvedVariantNumericId),
          error: refreshError && refreshError.message ? refreshError.message : String(refreshError),
        });
      }

      var drawerOpened = openCartDrawerIfAvailable(cartState);

      var span = document.createElement('span');
      span.appendChild(document.createTextNode(i18n.addedToCart + ' '));
      var cartLink = document.createElement('a');
      cartLink.href = sanitizeUrl(getCartPageUrl(cartRoot)) || '#';
      cartLink.textContent = i18n.viewCart;
      cartLink.target = drawerOpened ? '_blank' : '_self';
      cartLink.rel = 'noopener noreferrer';
      span.appendChild(cartLink);
      addMessageNode(span, 'assistant');

      reportCartSuccess({
        productId: productId || null,
        variantId: String(resolvedVariantNumericId),
        httpStatus: addToCartRes.status,
        errorDescription: null,
      });

      if (!drawerOpened) {
        setTimeout(function () {
          fallbackToCartPage(cartRoot);
        }, 0);
      }

      trackEvent('add_to_cart', { variantId: String(resolvedVariantNumericId), productRef: productRef });
    } catch (err) {
      var errorMessage = err && err.message ? err.message : String(err);
      reportCartFailure({
        productId: productId || null,
        variantId: variantId,
        httpStatus: err && err.httpStatus ? err.httpStatus : 0,
        errorDescription: errorMessage,
      });
      if (/cart variant unresolved/i.test(errorMessage)) {
        addMessage(i18n.cartVariantInvalid, 'assistant');
      } else {
        addMessage(i18n.cartError, 'assistant');
      }
    } finally {
      delete cartRequestsInFlight[requestKey];
      buttonEl.disabled = false;
      buttonEl.textContent = i18n.addToCart;
    }
  }

  // ─── W3 — Handoff UI ──────────────────────────────────────────────────────
  function showHandoffUI(reason) {
    isHandoffActive = true;
    addMessage(i18n.handoffConnecting, 'assistant');

    var handoffEl = document.createElement('div');
    handoffEl.className = 'fluxbot-handoff';
    var connectBtn = document.createElement('button');
    connectBtn.type = 'button';
    connectBtn.className = 'fluxbot-handoff__btn';
    connectBtn.textContent = i18n.connectAgent;
    connectBtn.addEventListener('click', function () { requestHandoff(reason || 'user_request'); });
    handoffEl.appendChild(connectBtn);
    messagesContainer.appendChild(handoffEl);
    scrollToBottom();
  }

  async function requestHandoff(reason) {
    var handoffEl = messagesContainer.querySelector('.fluxbot-handoff');
    if (handoffEl) handoffEl.remove();

    try {
      await fetch(HANDOFF_ENDPOINT, buildJsonRequestOptions('POST', {
        conversationId: conversationId,
        sessionId: sessionId,
        visitorId: visitorId,
        shop: sanitizeAttr(launcher.dataset.shop),
        reason: reason || 'escalation',
        customerId: sanitizeAttr(launcher.dataset.customerId) || undefined,
      }));
    } catch (e) { console.error('[FluxBot] Handoff request failed:', e); }

    addMessage(i18n.handoffConfirm, 'assistant');

    var supportUrl = sanitizeUrl(launcher.dataset.supportUrl);
    if (supportUrl) {
      var node = document.createElement('span');
      var link = document.createElement('a');
      link.href = supportUrl;
      link.textContent = i18n.connectAgent;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      node.appendChild(link);
      addMessageNode(node, 'assistant');
    }

    trackEvent('handoff_requested', { reason: reason });
  }

  // ─── W2 — Proactive message polling ──────────────────────────────────────
  async function pollProactiveMessages() {
    if (!hasConsent || !sessionId) return;
    try {
      var res = await fetch(MESSAGES_ENDPOINT + encodeURIComponent(sessionId), {
        method: 'GET', headers: buildProxyHeaders(),
      });
      if (!res.ok) return;
      var data = await res.json();
      if (!data || !Array.isArray(data.messages) || data.messages.length === 0) return;
      data.messages.forEach(function (msg) {
        if (!msg || !msg.id || !msg.renderedMessage) return;
        renderProactiveMessage(msg);
        markMessageDelivered(msg.id);
      });
    } catch (e) { /* non-critical */ }
  }

  function renderProactiveMessage(msg) {
    var messageEl = document.createElement('div');
    messageEl.className = 'fluxbot-message fluxbot-message--assistant fluxbot-message--proactive';
    messageEl.dataset.messageId = msg.id;

    var badge = document.createElement('span');
    badge.className = 'fluxbot-proactive-badge';
    badge.textContent = i18n.proactiveBadge;
    messageEl.appendChild(badge);

    var contentEl = document.createElement('div');
    contentEl.className = 'fluxbot-message__content';
    renderMarkdown(msg.renderedMessage, contentEl);
    messageEl.appendChild(contentEl);

    var dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'fluxbot-proactive-dismiss';
    dismissBtn.setAttribute('aria-label', '×');
    dismissBtn.textContent = '×';
    dismissBtn.addEventListener('click', (function (id, el) {
      return function () { patchMessageInteraction(id, 'DISMISSED'); el.remove(); };
    })(msg.id, messageEl));
    messageEl.appendChild(dismissBtn);

    if (!isOpen) openChat();
    messagesContainer.appendChild(messageEl);
    scrollToBottom();
    trackEvent('proactive_message_shown', { messageId: msg.id });
  }

  async function markMessageDelivered(messageId) {
    try {
      await fetch(
        MESSAGES_ENDPOINT + encodeURIComponent(sessionId),
        buildJsonRequestOptions('PATCH', { messageId: messageId, interaction: 'DELIVERED' })
      );
    } catch (e) {}
  }

  async function patchMessageInteraction(messageId, interaction) {
    try {
      await fetch(
        MESSAGES_ENDPOINT + encodeURIComponent(sessionId),
        buildJsonRequestOptions('PATCH', { messageId: messageId, interaction: interaction })
      );
    } catch (e) {}
  }

  // ─── Typing indicator ─────────────────────────────────────────────────────
  function showTypingIndicator() {
    isTyping = true;
    var typingEl = document.createElement('div');
    typingEl.id = 'fluxbot-typing';
    typingEl.className = 'fluxbot-message fluxbot-message--assistant';
    typingEl.setAttribute('aria-label', i18n.typing);
    typingEl.innerHTML =
      '<div class="fluxbot-message__content">' +
        '<div class="fluxbot-typing-indicator" aria-hidden="true">' +
          '<span></span><span></span><span></span>' +
        '</div>' +
      '</div>';
    messagesContainer.appendChild(typingEl);
    scrollToBottom();
  }

  function hideTypingIndicator() {
    isTyping = false;
    var el = document.getElementById('fluxbot-typing');
    if (el) el.remove();
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // ─── Session persistence ──────────────────────────────────────────────────
  function loadConversationState() {
    var saved = safeGet(sessionStorage, 'fluxbot_conversation_id');
    if (saved) conversationId = saved;
  }

  function saveConversationState() {
    if (conversationId) safeSet(sessionStorage, 'fluxbot_conversation_id', conversationId);
  }

  // ─── W1 — Analytics ───────────────────────────────────────────────────────
  function trackEvent(eventType, data) {
    // Never track if consent was explicitly declined
    if (hasConsent === false && eventType !== 'page_view') return;

    var payload = {
      event: eventType,
      conversationId: conversationId,
      sessionId: sessionId,
      visitorId: visitorId,
      data: data || {},
      timestamp: new Date().toISOString(),
    };

    if (navigator.sendBeacon) {
      var blob = new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=UTF-8' });
      navigator.sendBeacon(EVENTS_ENDPOINT, blob);
    }
  }

  // ─── W6 — Security helpers ────────────────────────────────────────────────
  function sanitizeAttr(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[<>"'`\\]/g, '').slice(0, 512);
  }

  function sanitizeUrl(value) {
    if (!value || typeof value !== 'string') return null;
    var trimmed = value.trim();
    if (/^(https?:\/\/|\/)/i.test(trimmed)) return trimmed;
    return null;
  }

})();
