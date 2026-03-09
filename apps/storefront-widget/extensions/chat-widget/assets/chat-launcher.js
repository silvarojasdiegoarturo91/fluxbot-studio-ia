/**
 * FluxBot Chat Launcher
 * AI-powered chat widget for Shopify storefronts
 */

(function() {
  'use strict';
  
  // Configuration
  const API_ENDPOINT = '/apps/fluxbot/chat'; // App proxy endpoint
  
  // State
  let isOpen = false;
  let conversationId = null;
  let isTyping = false;
  let retryCount = 0;
  const MAX_RETRIES = 3;
  
  // Elements
  let launcher, launcherButton, chatWindow, messagesContainer, chatForm, chatInput;
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  function init() {
    launcher = document.getElementById('fluxbot-chat-launcher');
    if (!launcher) return;
    
    // Check if launcher should be shown
    if (launcher.dataset.showLauncher === 'false') {
      launcher.style.display = 'none';
      return;
    }
    
    // Get elements
    launcherButton = launcher.querySelector('.fluxbot-launcher__button');
    chatWindow = document.getElementById('fluxbot-chat-window');
    messagesContainer = document.getElementById('fluxbot-messages');
    chatForm = document.getElementById('fluxbot-chat-form');
    chatInput = document.getElementById('fluxbot-chat-input');
    
    // Apply primary color
    const primaryColor = launcher.dataset.primaryColor;
    if (primaryColor) {
      document.documentElement.style.setProperty('--fluxbot-primary-color', primaryColor);
    }
    
    // Event listeners
    launcherButton.addEventListener('click', toggleChat);
    chatWindow.querySelector('.fluxbot-chat-window__close').addEventListener('click', closeChat);
    chatForm.addEventListener('submit', handleSubmit);
    
    // Load conversation from session storage
    loadConversationState();
    
    // Track page view
    trackEvent('page_view');
  }
  
  function toggleChat() {
    if (isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }
  
  function openChat() {
    isOpen = true;
    chatWindow.hidden = false;
    launcherButton.setAttribute('aria-expanded', 'true');
    launcher.classList.add('fluxbot-launcher--open');
    chatInput.focus();
    
    trackEvent('chat_opened');
  }
  
  function closeChat() {
    isOpen = false;
    chatWindow.hidden = true;
    launcherButton.setAttribute('aria-expanded', 'false');
    launcher.classList.remove('fluxbot-launcher--open');
    
    trackEvent('chat_closed');
  }
  
  async function handleSubmit(e) {
    e.preventDefault();
    
    const message = chatInput.value.trim();
    if (!message || isTyping) return;
    
    // Clear input
    chatInput.value = '';
    
    // Add user message to UI
    addMessage(message, 'user');
    
    // Show typing indicator
    showTypingIndicator();
    
    try {
      // Send message to backend
      const response = await sendMessage(message);
      
      // Hide typing indicator
      hideTypingIndicator();
      
      // Add assistant response
      if (response.message) {
        addMessage(response.message, 'assistant', response.metadata);
      }
      
      // Update conversation ID
      if (response.conversationId) {
        conversationId = response.conversationId;
        saveConversationState();
      }
      
      // Reset retry count on success
      retryCount = 0;
      
    } catch (error) {
      console.error('Chat error:', error);
      hideTypingIndicator();
      
      // Show error message
      if (retryCount < MAX_RETRIES) {
        addMessage('Sorry, I had trouble processing that. Please try again.', 'assistant');
        retryCount++;
      } else {
        addMessage('I\'m experiencing technical difficulties. Please try again later or contact support.', 'assistant');
      }
    }
  }
  
  async function sendMessage(message) {
    const payload = {
      message: message,
      conversationId: conversationId,
      context: {
        shop: launcher.dataset.shop,
        locale: launcher.dataset.locale,
        customerId: launcher.dataset.customerId,
        customerEmail: launcher.dataset.customerEmail,
        url: window.location.href,
        referrer: document.referrer,
      }
    };
    
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  function addMessage(content, role, metadata = {}) {
    const messageEl = document.createElement('div');
    messageEl.className = `fluxbot-message fluxbot-message--${role}`;
    
    const contentEl = document.createElement('div');
    contentEl.className = 'fluxbot-message__content';
    
    // Parse markdown-style links
    const formattedContent = content.replace(
      /\[([^\]]+)\]\(([^\)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );
    contentEl.innerHTML = formattedContent;
    
    messageEl.appendChild(contentEl);
    
    // Add product cards if present
    if (metadata.products && Array.isArray(metadata.products)) {
      const productsEl = createProductCards(metadata.products);
      messageEl.appendChild(productsEl);
    }
    
    messagesContainer.appendChild(messageEl);
    scrollToBottom();
    
    // Track message
    trackEvent('message_sent', { role, length: content.length });
  }
  
  function createProductCards(products) {
    const container = document.createElement('div');
    container.className = 'fluxbot-product-cards';
    
    products.slice(0, 3).forEach(product => {
      const card = document.createElement('a');
      card.href = product.url || '#';
      card.className = 'fluxbot-product-card';
      card.target = '_blank';
      card.rel = 'noopener';
      
      if (product.image) {
        const img = document.createElement('img');
        img.src = product.image;
        img.alt = product.title;
        img.className = 'fluxbot-product-card__image';
        card.appendChild(img);
      }
      
      const info = document.createElement('div');
      info.className = 'fluxbot-product-card__info';
      
      const title = document.createElement('div');
      title.className = 'fluxbot-product-card__title';
      title.textContent = product.title;
      info.appendChild(title);
      
      if (product.price) {
        const price = document.createElement('div');
        price.className = 'fluxbot-product-card__price';
        price.textContent = product.price;
        info.appendChild(price);
      }
      
      card.appendChild(info);
      container.appendChild(card);
    });
    
    return container;
  }
  
  function showTypingIndicator() {
    isTyping = true;
    
    const typingEl = document.createElement('div');
    typingEl.id = 'fluxbot-typing';
    typingEl.className = 'fluxbot-message fluxbot-message--assistant';
    typingEl.innerHTML = `
      <div class="fluxbot-message__content">
        <div class="fluxbot-typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    `;
    
    messagesContainer.appendChild(typingEl);
    scrollToBottom();
  }
  
  function hideTypingIndicator() {
    isTyping = false;
    const typingEl = document.getElementById('fluxbot-typing');
    if (typingEl) {
      typingEl.remove();
    }
  }
  
  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  function loadConversationState() {
    try {
      const saved = sessionStorage.getItem('fluxbot_conversation_id');
      if (saved) {
        conversationId = saved;
      }
    } catch (e) {
      // Session storage not available
    }
  }
  
  function saveConversationState() {
    try {
      if (conversationId) {
        sessionStorage.setItem('fluxbot_conversation_id', conversationId);
      }
    } catch (e) {
      // Session storage not available
    }
  }
  
  function trackEvent(eventType, data = {}) {
    // Send analytics event to backend
    const payload = {
      event: eventType,
      conversationId: conversationId,
      data: data,
      timestamp: new Date().toISOString(),
    };
    
    // Use sendBeacon for reliability
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/apps/fluxbot/events', blob);
    }
  }
  
  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    if (conversationId) {
      trackEvent('page_exit');
    }
  });
})();
