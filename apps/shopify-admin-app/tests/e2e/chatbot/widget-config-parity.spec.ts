import { expect, test } from "../fixtures";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_SHOP_DOMAIN =
  process.env.SHOPIFY_SHOP ||
  process.env.SHOPIFY_DEV_STORE_URL ||
  "quickstart-c8cc9986.myshopify.com";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const widgetAssetsDir = path.resolve(
  __dirname,
  "../../../extensions/chat-widget/assets",
);
const widgetScript = readFileSync(
  path.join(widgetAssetsDir, "chat-launcher.js"),
  "utf-8",
);
const widgetStyles = readFileSync(
  path.join(widgetAssetsDir, "chat-launcher.css"),
  "utf-8",
);

function widgetHarnessHtml(widgetConfigPayload: Record<string, unknown>) {
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>${widgetStyles}</style>
    <style>* { animation: none !important; transition: none !important; }</style>
  </head>
  <body>
    <div
      id="fluxbot-chat-launcher"
      class="fluxbot-launcher fluxbot-launcher--bottom-right"
      data-show-launcher="true"
      data-primary-color="#008060"
      data-welcome-message="Hi! How can I help you today?"
      data-shop="${TEST_SHOP_DOMAIN}"
      data-locale="en"
      data-privacy-url=""
      data-privacy-text="Privacy policy"
      data-support-url=""
    >
      <button
        type="button"
        class="fluxbot-launcher__button"
        aria-label="Open chat"
        aria-expanded="false"
        aria-controls="fluxbot-chat-window"
      >
        <svg class="fluxbot-launcher__icon fluxbot-launcher__icon--chat" width="24" height="24"></svg>
        <svg class="fluxbot-launcher__icon fluxbot-launcher__icon--close" width="24" height="24"></svg>
      </button>
      <span class="fluxbot-launcher__label" hidden aria-hidden="true"></span>

      <div
        id="fluxbot-chat-window"
        class="fluxbot-chat-window"
        role="dialog"
        aria-modal="true"
        aria-label="Chat window"
        hidden
      >
        <div class="fluxbot-chat-window__header">
          <div class="fluxbot-chat-window__header-content">
            <h2 class="fluxbot-chat-window__title">AI Assistant</h2>
            <p class="fluxbot-chat-window__subtitle">We're here to help!</p>
          </div>
          <button type="button" class="fluxbot-chat-window__close" aria-label="Close chat"></button>
        </div>
        <div class="fluxbot-chat-window__messages" id="fluxbot-messages">
          <div class="fluxbot-message fluxbot-message--assistant">
            <div class="fluxbot-message__content">Hi! How can I help you today?</div>
          </div>
        </div>
        <div class="fluxbot-chat-window__input">
          <form id="fluxbot-chat-form" class="fluxbot-chat-form">
            <input type="text" id="fluxbot-chat-input" class="fluxbot-chat-form__input" />
            <button type="submit" class="fluxbot-chat-form__submit"></button>
          </form>
        </div>
      </div>
    </div>
    <script>
      window.__WIDGET_CONFIG_PAYLOAD__ = ${JSON.stringify(widgetConfigPayload)};
      window.fetch = function (input) {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        if (url.indexOf("/apps/fluxbot/widget-config") !== -1) {
          return Promise.resolve(
            new Response(JSON.stringify(window.__WIDGET_CONFIG_PAYLOAD__), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      };
    </script>
    <script>${widgetScript}</script>
  </body>
</html>`;
}

test.describe("Widget config parity", () => {
  test.skip(
    process.env.RUN_WIDGET_VISUAL_E2E !== "1",
    "Set RUN_WIDGET_VISUAL_E2E=1 to run full parity/visual storefront runtime tests.",
  );

  test("admin widget settings are reflected by widget-config endpoint", async ({
    page,
    request,
  }) => {
    await page.goto("/app/widget-settings", {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });

    await page
      .getByLabel(/launcher position|posicion del launcher/i)
      .selectOption("bottom-left");
    await page.getByRole("textbox", { name: /launcher label|etiqueta del launcher/i }).fill("Compra YA");
    await page.getByRole("textbox", { name: /welcome message|mensaje de bienvenida/i }).fill("Hola desde admin");
    await page.locator('input[placeholder="#008060"]').fill("#2563EB");
    await page.getByRole("button", { name: /save settings|guardar configuracion/i }).click();

    await expect(page.getByText(/settings saved|configuracion guardada/i)).toBeVisible({
      timeout: 10_000,
    });

    const response = await request.get(
      `/apps/fluxbot/widget-config?shop=${encodeURIComponent(TEST_SHOP_DOMAIN)}`,
    );
    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.widgetBranding).toMatchObject({
      launcherPosition: "bottom-left",
      primaryColor: "#2563EB",
      launcherLabel: "Compra YA",
      welcomeMessage: "Hola desde admin",
      onboardingCompleted: true,
    });
    expect(typeof body.configVersion).toBe("string");
  });

  test("widget runtime applies remote color/position/text and captures visual evidence", async ({
    page,
  }, testInfo) => {
    await page.setContent(
      widgetHarnessHtml({
        success: true,
        configVersion: "2026-05-11T21:00:00.000Z",
        widgetBranding: {
          launcherLabel: "Asistente Azul",
          avatarStyle: "assistant",
          primaryColor: "#2563EB",
          launcherPosition: "bottom-left",
          welcomeMessage: "Hola visual",
          botName: "Bot Azul",
          botGoal: "SALES_SUPPORT",
          adminLanguage: "es",
          onboardingCompleted: true,
        },
      }),
      { waitUntil: "domcontentloaded" },
    );

    const launcher = page.locator("#fluxbot-chat-launcher");
    await page.waitForFunction(() =>
      document
        .getElementById("fluxbot-chat-launcher")
        ?.classList.contains("fluxbot-launcher--bottom-left"),
    );
    await expect(launcher).toHaveClass(/fluxbot-launcher--bottom-left/);
    await expect(page.locator(".fluxbot-launcher__label")).toHaveText("Asistente Azul");
    await expect(page.locator(".fluxbot-chat-window__title")).toHaveText("Bot Azul");

    const launcherButton = page.locator(".fluxbot-launcher__button");
    const computedBg = await launcherButton.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor,
    );
    expect(computedBg).toBe("rgb(37, 99, 235)");

    const screenshot = await launcher.screenshot();
    expect(screenshot.byteLength).toBeGreaterThan(1000);
    await testInfo.attach("widget-parity-left-blue", {
      body: screenshot,
      contentType: "image/png",
    });
  });

  test("widget enforces safe defaults while onboarding is incomplete", async ({
    page,
  }) => {
    await page.setContent(
      widgetHarnessHtml({
        success: true,
        configVersion: "2026-05-11T21:30:00.000Z",
        widgetBranding: {
          launcherLabel: "NO-DEBE-VERSE",
          avatarStyle: "store",
          primaryColor: "#FF0000",
          launcherPosition: "bottom-left",
          welcomeMessage: "No aplicar",
          botName: "No aplicar",
          botGoal: "SALES",
          adminLanguage: "es",
          onboardingCompleted: false,
        },
      }),
      { waitUntil: "domcontentloaded" },
    );

    const launcher = page.locator("#fluxbot-chat-launcher");
    await expect(launcher).toHaveClass(/fluxbot-launcher--bottom-right/);

    const label = page.locator(".fluxbot-launcher__label");
    await expect(label).toBeHidden();

    const launcherButton = page.locator(".fluxbot-launcher__button");
    const computedBg = await launcherButton.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor,
    );
    expect(computedBg).toBe("rgb(0, 128, 96)");
  });
});
