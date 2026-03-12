/**
 * FluxBot Chat Launcher
 * AI-powered chat widget for Shopify storefronts
 */

(function() {
  'use strict';
  
  // Configuration
  const API_ENDPOINT = '/apps/fluxbot/chat'; // App proxy endpoint
  const CART_ENDPOINT = '/apps/fluxbot/cart/add';
  
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
        const mergedMetadata = response.metadata || {};

        // Support both legacy metadata.products and newer actions payloads.
        if (Array.isArray(response.actions)) {
          const actionProducts = response.actions
            .filter(action => action && typeof action === 'object')
            .flatMap(action => {
              if (Array.isArray(action.products)) return action.products;
              if (action.product && typeof action.product === 'object') return [action.product];
              return [];
            });

          if (actionProducts.length > 0) {
            mergedMetadata.products = Array.isArray(mergedMetadata.products)
              ? [...mergedMetadata.products, ...actionProducts]
              : actionProducts;
          }
        }

        addMessage(response.message, 'assistant', mergedMetadata);
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
      const card = document.createElement('div');
      card.className = 'fluxbot-product-card';

      const productLink = document.createElement('a');
      productLink.href = product.url || '#';
      productLink.className = 'fluxbot-product-card__link';
      productLink.target = '_blank';
      productLink.rel = 'noopener';
      
      if (product.image) {
        const img = document.createElement('img');
        img.src = product.image;
        img.alt = product.title;
        img.className = 'fluxbot-product-card__image';
        productLink.appendChild(img);
      }
      
      const info = document.createElement('div');
      info.className = 'fluxbot-product-card__info';
      
      const title = document.createElement('a');
      title.className = 'fluxbot-product-card__title';
      title.textContent = product.title;
      title.href = product.url || '#';
      title.target = '_blank';
      title.rel = 'noopener';
      info.appendChild(title);
      
      if (product.price) {
        const price = document.createElement('div');
        price.className = 'fluxbot-product-card__price';
        price.textContent = product.price;
        info.appendChild(price);
      }

      const actions = document.createElement('div');
      actions.className = 'fluxbot-product-card__actions';

      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'fluxbot-product-card__add';
      addButton.textContent = 'Add to cart';
      addButton.addEventListener('click', async () => {
        await addProductToCart(product, addButton);
      });

      actions.appendChild(addButton);
      info.appendChild(actions);
      
      productLink.appendChild(info);
      card.appendChild(productLink);
      container.appendChild(card);
    });
    
    return container;
  }

  async function addProductToCart(product, buttonEl) {
    const variantId = product.variantId || product.variant_id || null;
    const productRef = product.productId || product.product_id || product.handle || product.id || null;

    if (!variantId && !productRef) {
      addMessage('I could not resolve the product variant for cart addition.', 'assistant');
      return;
    }

    const originalLabel = buttonEl.textContent;
    buttonEl.disabled = true;
    buttonEl.textContent = 'Adding...';

    try {
      const response = await fetch(CART_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          variantId,
          productRef,
          quantity: 1,
          commit: true,
          conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (!payload?.success) {
        throw new Error(payload?.error || 'Cart add failed');
      }

      const cartUrl = payload?.data?.cartUrl;
      if (cartUrl) {
        addMessage(`Added to cart. [View cart](${cartUrl})`, 'assistant');
      } else {
        addMessage('Added to cart successfully.', 'assistant');
      }

      trackEvent('add_to_cart', {
        variantId,
        productRef,
      });
    } catch (error) {
      console.error('Add to cart failed:', error);
      addMessage('Sorry, I could not add this item to your cart right now.', 'assistant');
    } finally {
      buttonEl.disabled = false;
      buttonEl.textContent = originalLabel;
    }
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
