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

  // ─── Endpoints ──────────────────────────────────────────────────────────────
  var API_ENDPOINT      = '/apps/fluxbot/chat';
  var CART_ENDPOINT     = '/apps/fluxbot/cart/add';
  var EVENTS_ENDPOINT   = '/apps/fluxbot/events';
  var MESSAGES_ENDPOINT = '/apps/fluxbot/messages/'; // + sessionId
  var CONSENT_ENDPOINT  = '/apps/fluxbot/consent';
  var HANDOFF_ENDPOINT  = '/apps/fluxbot/handoff';
  var CONFIG_ENDPOINT   = '/apps/fluxbot/widget-config';
  // Avoid ngrok browser warning interstitials on same-origin proxy requests.
  var PROXY_BYPASS_HEADER = 'ngrok-skip-browser-warning';

  // ─── W5 — i18n ──────────────────────────────────────────────────────────────
  var I18N = {
    en: {
      openChat: 'Open chat', closeChat: 'Close chat',
      inputPlaceholder: 'Type your message…', sendMessage: 'Send message',
      addToCart: 'Add to cart', adding: 'Adding…',
      addedToCart: 'Added to cart.', viewCart: 'View cart',
      cartError: 'Sorry, I could not add this item to your cart right now.',
      typing: 'Assistant is typing…',
      errorRetry: 'Sorry, I had trouble processing that. Please try again.',
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
    return I18N[lang] || I18N.en;
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
  var isHandoffActive   = false;
  var proactivePollTimer = null;
  var dwellTimer        = null;
  var scrollDepthReported = {};
  var launcherLabelText = '';
  var launcherAvatarStyle = 'assistant';

  // W6 — Rate limiting
  var msgTimestamps  = [];
  var MSG_RATE_LIMIT  = 20;
  var MSG_RATE_WINDOW = 60000;
  var SEND_DEBOUNCE_MS = 500;
  var lastSendAt = 0;
  var MAX_RETRIES = 3;

  // ─── DOM elements ─────────────────────────────────────────────────────────
  var launcher, launcherButton, chatWindow, messagesContainer, chatForm, chatInput;

  // ─── Init ─────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    launcher = document.getElementById('fluxbot-chat-launcher');
    if (!launcher) return;

    // W6 — Sanitize data attributes before use
    var showLauncher = sanitizeAttr(launcher.dataset.showLauncher);
    if (showLauncher === 'false') {
      launcher.style.display = 'none';
      return;
    }

    // W5 — Locale
    var locale = sanitizeAttr(launcher.dataset.locale) || 'en';
    i18n = getI18n(locale);

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

    // W4 — Consent check
    var storedConsent = safeGet(localStorage, 'fluxbot_consent');
    if (storedConsent) {
      try {
        var parsed = JSON.parse(storedConsent);
        hasConsent = parsed && parsed.granted === true;
      } catch (e) { hasConsent = false; }
    }

    // DOM elements
    launcherButton    = launcher.querySelector('.fluxbot-launcher__button');
    chatWindow        = document.getElementById('fluxbot-chat-window');
    messagesContainer = document.getElementById('fluxbot-messages');
    chatForm          = document.getElementById('fluxbot-chat-form');
    chatInput         = document.getElementById('fluxbot-chat-input');

    if (!launcherButton || !chatWindow || !messagesContainer || !chatForm || !chatInput) return;

    // Apply primary color
    var primaryColor = sanitizeAttr(launcher.dataset.primaryColor);
    if (primaryColor && /^#[0-9a-fA-F]{3,8}$/.test(primaryColor)) {
      document.documentElement.style.setProperty('--fluxbot-primary-color', primaryColor);
    }

    // W5 — Localise static labels
    chatInput.setAttribute('placeholder', i18n.inputPlaceholder);
    chatInput.setAttribute('aria-label', i18n.inputPlaceholder);
    var closeBtn = chatWindow.querySelector('.fluxbot-chat-window__close');
    if (closeBtn) closeBtn.setAttribute('aria-label', i18n.closeChat);
    var submitBtn = chatForm.querySelector('.fluxbot-chat-form__submit');
    if (submitBtn) submitBtn.setAttribute('aria-label', i18n.sendMessage);
    var branding = chatWindow.querySelector('.fluxbot-chat-window__branding');
    if (branding) branding.textContent = i18n.poweredBy;

    applyLauncherPresentation();
    loadRemoteWidgetConfig();

    // W5 — RTL for Arabic
    if (locale.toLowerCase().startsWith('ar')) {
      launcher.setAttribute('dir', 'rtl');
    }

    // Event listeners
    launcherButton.addEventListener('click', toggleChat);
    closeBtn && closeBtn.addEventListener('click', closeChat);
    chatForm.addEventListener('submit', handleSubmit);

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

  function applyRemoteWidgetConfig(config) {
    if (!config || typeof config !== 'object') return;

    var nextLabel = sanitizeAttr(config.launcherLabel);
    launcherLabelText = nextLabel ? nextLabel.slice(0, 64) : '';

    if (config.avatarStyle === 'assistant' || config.avatarStyle === 'spark' || config.avatarStyle === 'store') {
      launcherAvatarStyle = config.avatarStyle;
    }

    applyLauncherPresentation();
  }

  function loadRemoteWidgetConfig() {
    fetch(CONFIG_ENDPOINT, {
      method: 'GET',
      headers: buildProxyHeaders(),
    })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (payload) {
        if (!payload || payload.success !== true || !payload.widgetBranding) return;
        applyRemoteWidgetConfig(payload.widgetBranding);
      })
      .catch(function () {});
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
    if (isOpen) { closeChat(); } else { openChat(); }
  }

  function openChat() {
    isOpen = true;
    chatWindow.hidden = false;
    launcherButton.setAttribute('aria-expanded', 'true');
    launcher.classList.add('fluxbot-launcher--open');
    updateLauncherButtonA11y();

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
    isOpen = false;
    chatWindow.hidden = true;
    launcherButton.setAttribute('aria-expanded', 'false');
    launcher.classList.remove('fluxbot-launcher--open');
    updateLauncherButtonA11y();
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

  function buildProxyHeaders(contentType) {
    var headers = {
      Accept: 'application/json',
    };
    headers[PROXY_BYPASS_HEADER] = 'true';

    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    return headers;
  }

  function buildJsonRequestOptions(method, payload, keepalive) {
    return {
      method: method,
      headers: buildProxyHeaders('text/plain;charset=UTF-8'),
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
      locale: sanitizeAttr(launcher.dataset.locale) || 'en',
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
    if (!message || isTyping) return;

    // W6 — Debounce
    var now = Date.now();
    if (now - lastSendAt < SEND_DEBOUNCE_MS) return;
    lastSendAt = now;

    // W6 — Rate limit
    msgTimestamps = msgTimestamps.filter(function (t) { return now - t < MSG_RATE_WINDOW; });
    if (msgTimestamps.length >= MSG_RATE_LIMIT) { addMessage(i18n.rateLimitMsg, 'assistant'); return; }
    msgTimestamps.push(now);

    chatInput.value = '';
    addMessage(message, 'user');
    showTypingIndicator();

    try {
      var response = await sendMessage(message);
      hideTypingIndicator();

      if (response.message) {
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
      console.error('[FluxBot] Chat error:', error);
      hideTypingIndicator();
      if (retryCount < MAX_RETRIES) { addMessage(i18n.errorRetry, 'assistant'); retryCount++; }
      else { addMessage(i18n.errorMax, 'assistant'); }
    }
  }

  async function sendMessage(message) {
    var payload = {
      message: message,
      conversationId: conversationId,
      sessionId: sessionId,
      visitorId: visitorId,
      context: {
        shop: sanitizeAttr(launcher.dataset.shop),
        locale: sanitizeAttr(launcher.dataset.locale),
        customerId: sanitizeAttr(launcher.dataset.customerId) || undefined,
        customerEmail: sanitizeAttr(launcher.dataset.customerEmail) || undefined,
        url: window.location.href,
        referrer: document.referrer,
      },
    };

    var res = await fetch(API_ENDPOINT, buildJsonRequestOptions('POST', payload));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
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
    if (metadata.products && Array.isArray(metadata.products)) {
      messageEl.appendChild(createProductCards(metadata.products));
    }
    messagesContainer.appendChild(messageEl);
    scrollToBottom();
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

    products.slice(0, 3).forEach(function (product) {
      var card = document.createElement('div');
      card.className = 'fluxbot-product-card';

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

      var titleEl = document.createElement('a');
      titleEl.className = 'fluxbot-product-card__title';
      titleEl.textContent = product.title ? String(product.title).slice(0, 200) : '';
      titleEl.href = sanitizeUrl(product.url) || '#';
      titleEl.target = '_blank';
      titleEl.rel = 'noopener noreferrer';
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
      addBtn.textContent = i18n.addToCart;
      addBtn.addEventListener('click', (function (p, btn) {
        return function () { addProductToCart(p, btn); };
      })(product, addBtn));
      actions.appendChild(addBtn);
      info.appendChild(actions);
      link.appendChild(info);
      card.appendChild(link);
      container.appendChild(card);
    });

    return container;
  }

  async function addProductToCart(product, buttonEl) {
    var variantId  = product.variantId  || product.variant_id  || null;
    var productRef = product.productId  || product.product_id  || product.handle || product.id || null;

    if (!variantId && !productRef) { addMessage(i18n.cartVariantError, 'assistant'); return; }

    buttonEl.disabled = true;
    buttonEl.textContent = i18n.adding;

    try {
      var res = await fetch(CART_ENDPOINT, buildJsonRequestOptions('POST', {
        variantId: variantId, productRef: productRef, quantity: 1,
        commit: true, conversationId: conversationId,
        sessionId: sessionId, visitorId: visitorId,
      }));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var payload = await res.json();
      if (!payload || !payload.success) throw new Error((payload && payload.error) || 'Cart add failed');

      var cartUrl = payload.data && payload.data.cartUrl;
      if (cartUrl) {
        var span = document.createElement('span');
        span.appendChild(document.createTextNode(i18n.addedToCart + ' '));
        var cartLink = document.createElement('a');
        cartLink.href = sanitizeUrl(cartUrl) || '#';
        cartLink.textContent = i18n.viewCart;
        cartLink.target = '_blank';
        cartLink.rel = 'noopener noreferrer';
        span.appendChild(cartLink);
        addMessageNode(span, 'assistant');
      } else {
        addMessage(i18n.addedToCart, 'assistant');
      }

      trackEvent('add_to_cart', { variantId: variantId, productRef: productRef });
    } catch (err) {
      console.error('[FluxBot] Add to cart failed:', err);
      addMessage(i18n.cartError, 'assistant');
    } finally {
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
