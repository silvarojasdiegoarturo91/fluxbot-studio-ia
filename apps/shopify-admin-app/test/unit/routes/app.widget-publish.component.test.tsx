// @vitest-environment jsdom
/**
 * Component render smoke tests — app.widget-publish.tsx
 *
 * Renders the real component in jsdom with mocked router/polaris and asserts
 * visible widget-publish states: published/live badge, reset/mark-live forms,
 * theme editor links, theme-query error banners and Spanish copy.
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseIsSpanish } = vi.hoisted(() => ({ mockUseIsSpanish: vi.fn() }));

let loaderData: any;
let actionData: any = undefined;
let navigationState = { state: "idle" };
let locationState = { pathname: "/app/widget-publish", search: "" };

vi.mock("@shopify/polaris", () => {
  const React = require("react");

  const IGNORED_PROPS = new Set([
    "gap",
    "align",
    "blockAlign",
    "wrap",
    "columns",
    "paddingBlockEnd",
    "paddingBlockStart",
    "variant",
    "fontWeight",
    "tone",
    "size",
    "submit",
    "loading",
    "url",
    "interactive",
    "fullWidth",
    "target",
    "type",
    "backAction",
  ]);

  const wrap =
    (Tag = "div") =>
    ({ children, ...props }: any) => {
      const clean: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(props)) {
        if (!IGNORED_PROPS.has(key)) clean[key] = value;
      }
      return React.createElement(Tag, clean, children);
    };

  const Layout = Object.assign(wrap("div"), { Section: wrap("section") });
  const List = Object.assign(wrap("ul"), { Item: wrap("li") });

  return {
    Page: ({ title, subtitle, children }: any) =>
      React.createElement(
        "div",
        null,
        React.createElement("h1", null, title),
        subtitle ? React.createElement("p", null, subtitle) : null,
        children,
      ),
    Layout,
    BlockStack: wrap("div"),
    InlineStack: wrap("div"),
    Card: wrap("div"),
    Badge: wrap("span"),
    Button: ({ children, ...props }: any) =>
      React.createElement("button", { type: "button", ...props }, children),
    Banner: ({ title, tone, children }: any) =>
      React.createElement("div", { "data-banner": tone || "" }, title, children),
    Link: ({ children, ...props }: any) => React.createElement("a", props, children),
    List,
    Text: ({ as = "span", children }: { as?: keyof JSX.IntrinsicElements; children?: React.ReactNode }) =>
      React.createElement(as, {}, children),
  };
});

vi.mock("react-router", () => ({
  Form: ({ children }: { children?: React.ReactNode }) => React.createElement("form", null, children),
  useActionData: () => actionData,
  useLoaderData: () => loaderData,
  useNavigation: () => navigationState,
  useLocation: () => locationState,
}));

vi.mock("../../../app/hooks/use-admin-language", () => ({
  useIsSpanish: mockUseIsSpanish,
}));

vi.mock("../../../app/utils/authenticate-admin.server", () => ({ authenticateAdminRequest: vi.fn() }));
vi.mock("../../../app/services/shop-context.server", () => ({ ensureShopForSession: vi.fn() }));
vi.mock("../../../app/db.server", () => ({ default: {} }));

function baseLoaderData(): any {
  return {
    shopDomain: "shop.example.myshopify.com",
    publishedTheme: { id: "gid://shopify/Theme/123456", name: "Dawn" },
    themeEditorUrl: "https://shop.example.myshopify.com/admin/themes/123456/editor?context=apps",
    widgetPublishedAt: "2026-03-01T10:00:00.000Z",
    extensionHandle: "ai-chat-widget",
    themeQueryError: null,
  };
}

let WidgetPublishPage: React.ComponentType<any>;

function renderPage() {
  return render(React.createElement(WidgetPublishPage));
}

describe("app.widget-publish component", () => {
  beforeEach(async () => {
    mockUseIsSpanish.mockReturnValue(false);
    loaderData = baseLoaderData();
    actionData = undefined;
    navigationState = { state: "idle" };
    locationState = { pathname: "/app/widget-publish", search: "" };
    const mod = await import("../../../app/routes/app.widget-publish");
    WidgetPublishPage = mod.default;
  });

  it("renders the live state with theme editor links in English", () => {
    renderPage();

    expect(screen.getByText("Widget Publish")).toBeInTheDocument();
    expect(screen.getByText("Widget Status")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText(/Marked as live on/)).toBeInTheDocument();
    expect(screen.getByText(/Published theme:/)).toBeInTheDocument();
    expect(screen.getByText("Dawn")).toBeInTheDocument();
    expect(screen.getByText("Reset Status")).toBeInTheDocument();
    expect(screen.getByText("Open Theme Editor")).toBeInTheDocument();
    expect(screen.getByText("Installation Guide")).toBeInTheDocument();
    expect(screen.getByText("Step 1 — Deploy the extension")).toBeInTheDocument();
    expect(screen.getByText("ai-chat-widget")).toBeInTheDocument();
  });

  it("renders the not-published state with a mark-as-live form", () => {
    loaderData = { ...baseLoaderData(), widgetPublishedAt: null };

    renderPage();

    expect(screen.getByText("Not Published")).toBeInTheDocument();
    expect(screen.getByText("Mark as Live")).toBeInTheDocument();
    expect(screen.queryByText("Reset Status")).not.toBeInTheDocument();
  });

  it("shows a scope warning when read_themes is missing", () => {
    loaderData = {
      ...baseLoaderData(),
      publishedTheme: null,
      themeEditorUrl: null,
      themeQueryError: "Access denied: missing read_themes scope",
    };

    renderPage();

    expect(screen.getByText(/Could not fetch published theme/)).toBeInTheDocument();
    expect(screen.getByText(/missing the read_themes scope/)).toBeInTheDocument();
  });

  it("shows a generic theme query warning without the scope hint", () => {
    loaderData = {
      ...baseLoaderData(),
      publishedTheme: null,
      themeEditorUrl: null,
      themeQueryError: "Shopify is having issues",
    };

    renderPage();

    expect(screen.getByText(/Could not fetch published theme/)).toBeInTheDocument();
    expect(screen.queryByText(/missing the read_themes scope/)).not.toBeInTheDocument();
  });

  it("renders the action error banner", () => {
    actionData = { ok: false, error: "Error saving" };

    renderPage();

    expect(screen.getByText("Error saving")).toBeInTheDocument();
  });

  it("renders Spanish copy when the admin language is Spanish", () => {
    mockUseIsSpanish.mockReturnValue(true);
    loaderData = baseLoaderData();

    renderPage();

    expect(screen.getByText("Publicación del Widget")).toBeInTheDocument();
    expect(screen.getByText("Estado del Widget")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("Restablecer estado")).toBeInTheDocument();
    expect(screen.getByText("Abrir editor de tema")).toBeInTheDocument();
    expect(screen.getByText("Guía de instalación")).toBeInTheDocument();
    expect(screen.getByText("Paso 1 — Desplegar la extensión")).toBeInTheDocument();
  });
});
