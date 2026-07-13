import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const widgetPath = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../storefront-widget/extensions/chat-widget/assets/chat-launcher.js",
);

function buildWidgetMarkup() {
  return `
    <!doctype html>
    <html>
      <body>
        <div id="fluxbot-chat-launcher" data-locale="en" data-show-launcher="true">
          <button class="fluxbot-launcher__button" type="button">
            <span class="fluxbot-launcher__icon--chat"></span>
            <span class="fluxbot-launcher__label"></span>
          </button>
        </div>
        <div id="fluxbot-chat-window">
          <button class="fluxbot-chat-window__close" type="button"></button>
          <div class="fluxbot-chat-window__branding"></div>
        </div>
        <form id="fluxbot-chat-form">
          <button class="fluxbot-chat-form__submit" type="submit"></button>
        </form>
        <textarea id="fluxbot-chat-input"></textarea>
        <div id="fluxbot-messages"></div>
        <div data-fluxbot-cart-badge hidden="hidden">0</div>
      </body>
    </html>
  `;
}

async function setupWidget() {
  const dom = new JSDOM(buildWidgetMarkup(), {
    url: "https://shop.example.myshopify.com/products/blue-shirt",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const consoleMock = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  Object.defineProperty(window, "console", { value: consoleMock, configurable: true });
  window.fetch = vi.fn(() => Promise.resolve(jsonResponse({ success: false })));
  window.Shopify = { routes: { root: "/" } };
  window.__FLUXBOT_WIDGET_TEST__ = {};

  const source = readFileSync(widgetPath, "utf8");
  window.eval(source);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  await flush();

  return {
    dom,
    window,
    consoleMock,
    fetchMock: window.fetch as unknown as ReturnType<typeof vi.fn>,
    hooks: window.__FLUXBOT_WIDGET_TEST__,
  };
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("storefront widget cart flow", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a valid variant id, refreshes cart state, and opens the drawer after Shopify confirms the add", async () => {
    const { window, fetchMock, hooks } = await setupWidget();
    const drawerOpen = vi.fn();
    window.cartDrawer = { open: drawerOpen };
    const initialCallCount = fetchMock.mock.calls.length;

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            variantId: "gid://shopify/ProductVariant/101",
            productRef: "gid://shopify/Product/999",
            productHandle: "blue-shirt",
            quantity: 1,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({
          item_count: 2,
          items: [{ id: 101, quantity: 1 }],
        }),
      );

    const button = window.document.querySelector(".fluxbot-product-card__add") || window.document.createElement("button");
    const product = {
      title: "Blue Shirt",
      productId: "gid://shopify/Product/999",
      variantId: "gid://shopify/ProductVariant/101",
      availableForSale: true,
      url: "https://shop.example.myshopify.com/products/blue-shirt",
    };

    await hooks.addProductToCart(product, button);
    await flush();

    expect(fetchMock.mock.calls.length).toBe(initialCallCount + 3);
    expect(fetchMock.mock.calls[initialCallCount + 1][0]).toBe("/cart/add.js");

    const addToCartPayload = JSON.parse(String(fetchMock.mock.calls[initialCallCount + 1][1].body));
    expect(addToCartPayload.items[0].id).toBe(101);
    expect(addToCartPayload.items[0].id).not.toBe(999);

    expect(window.document.querySelector("[data-fluxbot-cart-badge]")?.textContent).toBe("2");
    expect(drawerOpen).toHaveBeenCalledTimes(1);
    expect(window.document.getElementById("fluxbot-messages")?.textContent).toContain("Added to cart");
    expect(button.disabled).toBe(false);
  });

  it("maps Shopify 422 Cannot find variant to a clear shopper message", async () => {
    const { window, fetchMock, hooks, consoleMock } = await setupWidget();

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            variantId: "gid://shopify/ProductVariant/101",
            productRef: "gid://shopify/Product/999",
            quantity: 1,
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ errors: ["Cannot find variant"] }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const button = window.document.createElement("button");
    const product = {
      title: "Blue Shirt",
      productId: "gid://shopify/Product/999",
      variantId: "gid://shopify/ProductVariant/101",
      availableForSale: true,
    };

    await hooks.addProductToCart(product, button);
    await flush();

    expect(window.document.getElementById("fluxbot-messages")?.textContent).toContain(
      "Shopify could not find that variant",
    );
    expect(consoleMock.error).toHaveBeenCalled();

    const [label, details] = consoleMock.error.mock.calls.find((call) =>
      String(call[0]).includes("Cart add failed"),
    ) || [];
    expect(String(label)).toContain("Cart add failed");
    expect(details).toEqual(
      expect.objectContaining({
        productId: "gid://shopify/Product/999",
        variantId: "101",
        httpStatus: 422,
        errorDescription: "Cannot find variant",
      }),
    );
  });

  it("falls back to the standard cart page when the drawer cannot be opened", async () => {
    const { window, fetchMock, hooks } = await setupWidget();
    const fallback = vi.fn();
    hooks.onCartFallback = fallback;

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            variantId: "gid://shopify/ProductVariant/101",
            productRef: "gid://shopify/Product/999",
            quantity: 1,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({
          item_count: 1,
          items: [{ id: 101, quantity: 1 }],
        }),
      );

    const button = window.document.createElement("button");
    const product = {
      title: "Blue Shirt",
      productId: "gid://shopify/Product/999",
      variantId: "gid://shopify/ProductVariant/101",
      availableForSale: true,
    };

    await hooks.addProductToCart(product, button);
    await flush();
    await flush();

    expect(fallback).toHaveBeenCalledWith("/cart");
    expect(window.document.getElementById("fluxbot-messages")?.textContent).toContain("Added to cart");
  });

  it("renders a disabled add-to-cart button when no purchasable variant is available", async () => {
    const { window, hooks } = await setupWidget();

    const cards = hooks.createProductCards([
      {
        title: "Blue Shirt",
        productId: "gid://shopify/Product/999",
        availableForSale: false,
      },
    ]);

    window.document.body.appendChild(cards);

    const button = cards.querySelector(".fluxbot-product-card__add") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Unavailable");
  });

  it("does not turn assistant responses into the legacy greeting fallback", async () => {
    const { hooks } = await setupWidget();

    expect(
      hooks.sanitizeAssistantMessage("Hola 👋 Estoy aquí para ayudarte. ¿Qué necesitas?"),
    ).toBe("");
    expect(hooks.sanitizeAssistantMessage("Gracias por tu ayuda.")).toBe("Gracias por tu ayuda.");
  });
});
