// @vitest-environment jsdom
/**
 * Production-shaped render regression tests — app.conversations.$id.tsx
 *
 * The production bug: clicking "Ver" on /app/conversations navigated to the
 * detail route, the `.data` request returned 200 (loader OK) but the embedded
 * iframe showed Shopify's "app not installed" empty state with CSP errors.
 * That signature is what a client render crash looks like inside the embedded
 * admin, so these tests render the REAL default component with loader payloads
 * that mimic production data and fail if the component throws.
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseIsSpanish } = vi.hoisted(() => ({ mockUseIsSpanish: vi.fn() }));

// Loader payloads are intentionally loosely typed: the whole point of these
// tests is to feed shapes the compiler would normally reject but production
// actually produces (missing fields, invalid dates, unknown statuses).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loaderData: any;

vi.mock("@shopify/polaris", () => {
  const React = require("react");

  const IGNORED_PROPS = new Set([
    "gap",
    "align",
    "blockAlign",
    "wrap",
    "columns",
    "fullWidth",
    "variant",
    "fontWeight",
    "tone",
    "size",
  ]);

  const wrap =
    (Tag = "div") =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ children, ...props }: any) => {
      const clean: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(props)) {
        if (!IGNORED_PROPS.has(key)) clean[key] = value;
      }
      return React.createElement(Tag, clean, children);
    };

  const Layout = Object.assign(wrap("div"), { Section: wrap("section") });

  return {
    Page: wrap("div"),
    Layout,
    InlineGrid: wrap("div"),
    InlineStack: wrap("div"),
    BlockStack: wrap("div"),
    Badge: wrap("span"),
    Card: wrap("div"),
    Text: ({ as = "span", children }: { as?: keyof JSX.IntrinsicElements; children?: React.ReactNode }) =>
      React.createElement(as, {}, children),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    EmptyState: ({ heading, children }: any) => React.createElement("div", null, heading, children),
  };
});

vi.mock("react-router", () => ({
  useLoaderData: () => loaderData,
  useMatches: () => [],
  useLocation: () => ({
    search: "?shop=demo.myshopify.com&host=abc&embedded=1",
    pathname: "/app/conversations/prod-conv",
    key: "k",
    hash: "",
    state: null,
  }),
}));

vi.mock("../../../app/hooks/use-admin-language", () => ({
  useIsSpanish: mockUseIsSpanish,
}));

vi.mock("../../../app/components/admin-ui", () => {
  const React = require("react");
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AdminPageHeader: ({ title, badge, description }: any) =>
      React.createElement("header", null, React.createElement("h1", null, title), badge, description),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AdminSectionCard: ({ title, description, children, badge }: any) =>
      React.createElement(
        "section",
        null,
        React.createElement("h2", null, title),
        description ? React.createElement("p", null, description) : null,
        badge,
        children,
      ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AdminStatCard: ({ label, value, meta, badge }: any) =>
      React.createElement(
        "div",
        { "data-stat": label },
        React.createElement("span", null, label),
        React.createElement("strong", null, value),
        meta ? React.createElement("small", null, meta) : null,
        badge,
      ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AdminStatusBadge: ({ children }: any) => React.createElement("span", { "data-badge": true }, children),
  };
});

vi.mock("../../../app/db.server", () => ({ default: {} }));
vi.mock("../../../app/utils/authenticate-admin.server", () => ({ authenticateAdminRequest: vi.fn() }));
vi.mock("../../../app/services/shop-context.server", () => ({ ensureShopForSession: vi.fn() }));
vi.mock("../../../app/services/ia-backend.server", () => ({
  iaClient: { widgetAdmin: { conversationRecent: vi.fn(), conversationDetail: vi.fn() } },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoaderMessage = Record<string, any>;

/**
 * 12 messages the way Prisma returns them for a shopify conversation:
 * mixed roles, Date objects, null confidence/tokensUsed, null and object
 * metadata, some with toolInvocations.
 */
function productionShopifyMessages(): LoaderMessage[] {
  const base = Date.parse("2026-07-01T10:00:00.000Z");
  const at = (offsetSeconds: number) => new Date(base + offsetSeconds * 1000);

  return [
    {
      id: "m-01",
      role: "USER",
      content: "Hola, ¿tienen envío a Córdoba?",
      confidence: null,
      tokensUsed: null,
      metadata: null,
      createdAt: at(0),
      toolInvocations: [],
    },
    {
      id: "m-02",
      role: "ASSISTANT",
      content: "Sí, enviamos a todo el país.",
      confidence: 0.94,
      tokensUsed: 180,
      metadata: { toolsUsed: ["getShippingPolicy"] },
      createdAt: at(4),
      toolInvocations: [{ toolName: "getShippingPolicy", success: true, errorMessage: null }],
    },
    {
      id: "m-03",
      role: "USER",
      content: "¿Cuánto tarda?",
      confidence: null,
      tokensUsed: null,
      metadata: null,
      createdAt: at(20),
      toolInvocations: [],
    },
    {
      id: "m-04",
      role: "ASSISTANT",
      content: "Entre 3 y 5 días hábiles.",
      confidence: null,
      tokensUsed: null,
      metadata: {},
      createdAt: at(24),
      toolInvocations: [],
    },
    {
      id: "m-05",
      role: "USER",
      content: "Quiero el abrigo negro talle M",
      confidence: null,
      tokensUsed: null,
      metadata: null,
      createdAt: at(40),
      toolInvocations: [],
    },
    {
      id: "m-06",
      role: "ASSISTANT",
      content: "Te dejo el link del producto.",
      confidence: 0.71,
      tokensUsed: null,
      metadata: { toolsUsed: [{ name: "searchCatalog", success: true }] },
      createdAt: at(46),
      toolInvocations: [{ toolName: "searchCatalog", success: true, errorMessage: null }],
    },
    {
      id: "m-07",
      role: "SYSTEM",
      content: "Confianza baja, se sugiere handoff",
      confidence: null,
      tokensUsed: null,
      metadata: null,
      createdAt: at(50),
      toolInvocations: [],
    },
    {
      id: "m-08",
      role: "USER",
      content: "¿Y mi pedido #1042?",
      confidence: null,
      tokensUsed: null,
      metadata: null,
      createdAt: at(70),
      toolInvocations: [],
    },
    {
      id: "m-09",
      role: "ASSISTANT",
      content: "No pude encontrar ese pedido.",
      confidence: 0.32,
      tokensUsed: 96,
      metadata: { toolsUsed: [{ name: "findOrderByNumber", success: false, error: "Order not found" }] },
      createdAt: at(76),
      toolInvocations: [{ toolName: "findOrderByNumber", success: false, errorMessage: "Order not found" }],
    },
    {
      id: "m-10",
      role: "TOOL",
      content: "findOrderByNumber -> 404",
      confidence: null,
      tokensUsed: null,
      metadata: { toolsUsed: "no-es-un-array" },
      createdAt: at(77),
      toolInvocations: [],
    },
    {
      id: "m-11",
      role: "USER",
      content: "Quiero hablar con una persona",
      confidence: null,
      tokensUsed: null,
      metadata: null,
      createdAt: at(90),
      toolInvocations: [],
    },
    {
      id: "m-12",
      role: "ASSISTANT",
      content: "Te derivo con un agente.",
      confidence: null,
      tokensUsed: 44,
      metadata: null,
      createdAt: at(95),
      toolInvocations: [],
    },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shopifyLoaderData(overrides: Record<string, any> = {}): any {
  return {
    source: "shopify",
    conversation: {
      id: "prod-conv",
      channel: "WEB_CHAT",
      status: "ACTIVE",
      locale: "es",
      visitorId: "visitor-1",
      customerId: null,
      sessionId: "session-1",
      startedAt: new Date("2026-07-01T10:00:00.000Z"),
      lastMessageAt: new Date("2026-07-01T10:01:35.000Z"),
    },
    messages: productionShopifyMessages(),
    handoffs: [],
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ConversationDetailPage: React.ComponentType<any>;

function renderPage() {
  return render(React.createElement(ConversationDetailPage));
}

describe("app.conversations.$id — production-shaped render", () => {
  beforeEach(async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    mockUseIsSpanish.mockReturnValue(true);
    loaderData = shopifyLoaderData();
    const mod = await import("../../../app/routes/app.conversations.$id");
    ConversationDetailPage = mod.default;
  });

  it("renders a 12-message shopify transcript with mixed roles, tools and null metrics", () => {
    expect(() => renderPage()).not.toThrow();

    expect(screen.getByText("Hola, ¿tienen envío a Córdoba?")).toBeInTheDocument();
    expect(screen.getByText("Te derivo con un agente.")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getAllByText("searchCatalog").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Order not found").length).toBeGreaterThan(0);
  });

  it("renders when lastMessageAt is null", () => {
    loaderData = shopifyLoaderData({
      conversation: { ...shopifyLoaderData().conversation, lastMessageAt: null },
    });

    expect(() => renderPage()).not.toThrow();
    expect(screen.getByText("Transcripción")).toBeInTheDocument();
  });

  it("renders when the conversation status is not mapped in STATUS_TONES", () => {
    loaderData = shopifyLoaderData({
      conversation: { ...shopifyLoaderData().conversation, status: "WAITING_ON_CUSTOMER" },
    });

    expect(() => renderPage()).not.toThrow();
    expect(screen.getByText("WAITING_ON_CUSTOMER")).toBeInTheDocument();
  });

  it("renders with an empty handoffs array", () => {
    loaderData = shopifyLoaderData({ handoffs: [] });

    expect(() => renderPage()).not.toThrow();
    expect(screen.queryByText("Handoffs")).not.toBeInTheDocument();
  });

  it("renders a handoff with resolvedAt null and an unusual uppercase status", () => {
    loaderData = shopifyLoaderData({
      handoffs: [
        {
          id: "h-1",
          reason: "El cliente pidió un humano",
          status: "PENDING",
          assignedTo: null,
          agentNotes: null,
          createdAt: new Date("2026-07-01T10:01:40.000Z"),
          resolvedAt: null,
        },
      ],
    });

    expect(() => renderPage()).not.toThrow();
    expect(screen.getByText("El cliente pidió un humano")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText(/Sin asignar/)).toBeInTheDocument();
    expect(screen.queryByText(/Resuelto:/)).not.toBeInTheDocument();
  });

  it("renders an external conversation whose messages have no toolInvocations", () => {
    loaderData = {
      source: "external",
      conversation: {
        id: "ext-conv",
        channel: "EXTERNAL_WIDGET",
        status: "EXTERNAL",
        locale: null,
        visitorId: "visitor-ext",
        sessionId: "session-ext",
        customerId: null,
        startedAt: new Date("2026-07-02T08:00:00.000Z"),
        lastMessageAt: null,
      },
      messages: [
        {
          id: "ext-user-1",
          role: "USER",
          content: "Hola desde el widget externo",
          confidence: null,
          tokensUsed: null,
          metadata: null,
          createdAt: "2026-07-02T08:00:01.000Z",
          toolInvocations: [],
        },
        {
          id: "ext-assistant-1",
          role: "ASSISTANT",
          content: "¿En qué te puedo ayudar?",
          confidence: null,
          tokensUsed: null,
          metadata: null,
          createdAt: "2026-07-02T08:00:02.000Z",
          toolInvocations: [],
        },
      ],
      handoffs: [],
    };

    expect(() => renderPage()).not.toThrow();
    expect(screen.getByText("Hola desde el widget externo")).toBeInTheDocument();
  });

  it("renders when createdAt arrives as ISO string and as Date in the same payload", () => {
    const mixed = productionShopifyMessages().map((message, index) =>
      index % 2 === 0
        ? { ...message, createdAt: new Date(message.createdAt as Date).toISOString() }
        : message,
    );
    loaderData = shopifyLoaderData({ messages: mixed });

    expect(() => renderPage()).not.toThrow();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("does not crash when a message createdAt is missing or unparseable", () => {
    const broken = productionShopifyMessages();
    broken[3] = { ...broken[3], createdAt: undefined };
    broken[7] = { ...broken[7], createdAt: "0000-00-00 00:00:00" };
    loaderData = shopifyLoaderData({ messages: broken });

    expect(() => renderPage()).not.toThrow();
    expect(screen.getByText("Entre 3 y 5 días hábiles.")).toBeInTheDocument();
  });

  it("does not crash when the conversation startedAt is unparseable", () => {
    loaderData = shopifyLoaderData({
      conversation: { ...shopifyLoaderData().conversation, startedAt: "not-a-date" },
    });

    expect(() => renderPage()).not.toThrow();
    expect(screen.getByText("Transcripción")).toBeInTheDocument();
  });

  it("does not crash when handoffs or messages are missing from the payload", () => {
    loaderData = {
      source: "shopify",
      conversation: shopifyLoaderData().conversation,
    };

    expect(() => renderPage()).not.toThrow();
    expect(screen.getByText("Sin mensajes")).toBeInTheDocument();
  });

  it("logs a render marker so the browser console proves the component mounted", () => {
    const infoSpy = vi.spyOn(console, "info");
    renderPage();

    expect(infoSpy).toHaveBeenCalledWith(
      "[conversations:detail] render",
      expect.objectContaining({ id: "prod-conv", source: "shopify", messageCount: 12 }),
    );
  });
});
