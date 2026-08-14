// @vitest-environment jsdom
/**
 * Component render tests — app.conversations.$id.tsx
 *
 * Renders the real detail component in jsdom with mocked router/polaris/admin-ui
 * and asserts the transcript bubbles, tool chips, handoff cards and empty state.
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseIsSpanish } = vi.hoisted(() => ({ mockUseIsSpanish: vi.fn() }));

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
    Banner: ({ title, tone, children }: { title?: string; tone?: string; children?: React.ReactNode }) =>
      React.createElement("div", { "data-banner": tone || "" }, title, children),
    Text: ({ as = "span", children }: { as?: keyof JSX.IntrinsicElements; children?: React.ReactNode }) =>
      React.createElement(as, {}, children),
    EmptyState: ({ heading, children }: any) => React.createElement("div", null, heading, children),
    DataTable: ({ headings, rows }: { headings: string[]; rows: unknown[][] }) =>
      React.createElement(
        "table",
        null,
        React.createElement(
          "thead",
          null,
          React.createElement("tr", null, headings.map((h, i) => React.createElement("th", { key: i }, h))),
        ),
        React.createElement(
          "tbody",
          null,
          rows.map((row, i) =>
            React.createElement(
              "tr",
              { key: i },
              row.map((cell, j) => React.createElement("td", { key: j }, cell)),
            ),
          ),
        ),
      ),
  };
});

vi.mock("react-router", () => ({
  useLoaderData: () => loaderData,
  useMatches: () => [],
  useLocation: () => ({ search: "", pathname: "/app/conversations/test-conv", key: "k", hash: "", state: null }),
}));

vi.mock("../../../app/hooks/use-admin-language", () => ({
  useIsSpanish: mockUseIsSpanish,
}));

vi.mock("../../../app/components/admin-ui", () => {
  const React = require("react");
  return {
    AdminPageHeader: ({ title, badge, description }: any) =>
      React.createElement(
        "header",
        null,
        React.createElement("h1", null, title),
        badge,
        description,
      ),
    AdminSectionCard: ({ title, description, children, badge }: any) =>
      React.createElement(
        "section",
        null,
        React.createElement("h2", null, title),
        description ? React.createElement("p", null, description) : null,
        badge,
        children,
      ),
    AdminStatCard: ({ label, value, meta, badge }: any) =>
      React.createElement(
        "div",
        { "data-stat": label },
        React.createElement("span", null, label),
        React.createElement("strong", null, value),
        meta ? React.createElement("small", null, meta) : null,
        badge,
      ),
    AdminStatusBadge: ({ children }: any) => React.createElement("span", { "data-badge": true }, children),
  };
});

vi.mock("../../../app/db.server", () => ({ default: {} }));
vi.mock("../../../app/utils/authenticate-admin.server", () => ({ authenticateAdminRequest: vi.fn() }));
vi.mock("../../../app/services/shop-context.server", () => ({ ensureShopForSession: vi.fn() }));
vi.mock("../../../app/services/ia-backend.server", () => ({
  iaClient: { widgetAdmin: { conversationRecent: vi.fn(), conversationDetail: vi.fn() } },
}));

function baseLoaderData(): any {
  return {
    conversation: {
      id: "conv-1",
      channel: "WEB_CHAT",
      status: "ACTIVE",
      locale: "es",
      visitorId: "v1",
      customerId: null,
      sessionId: "s1",
      startedAt: new Date("2026-07-01T10:00:00Z"),
    },
    messages: [
      {
        id: "m1",
        role: "USER",
        content: "Hola, quiero comprar un abrigo",
        confidence: null,
        tokensUsed: null,
        metadata: null,
        createdAt: new Date("2026-07-01T10:00:00Z"),
        toolInvocations: [],
      },
      {
        id: "m2",
        role: "ASSISTANT",
        content: "Claro, ¿qué talla buscas?",
        confidence: 0.9,
        tokensUsed: 120,
        metadata: { toolsUsed: [{ name: "searchCatalog", success: true }] },
        createdAt: new Date("2026-07-01T10:00:05Z"),
        toolInvocations: [
          { toolName: "getTrackingStatus", success: false, errorMessage: "Order not found" },
        ],
      },
      {
        id: "m3",
        role: "SYSTEM",
        content: "Handoff requested by the assistant",
        confidence: null,
        tokensUsed: null,
        metadata: null,
        createdAt: new Date("2026-07-01T10:02:00Z"),
        toolInvocations: [],
      },
    ],
    handoffs: [
      {
        id: "h-1",
        reason: "Customer asked for a human",
        status: "pending",
        assignedTo: "agent@shop.com",
        agentNotes: "Revisar estado del envío",
        createdAt: new Date("2026-07-01T10:02:00Z"),
        resolvedAt: null,
      },
    ],
  };
}

let ConversationDetailPage: React.ComponentType<any>;

function renderPage() {
  return render(React.createElement(ConversationDetailPage));
}

describe("app.conversations.$id component", () => {
  beforeEach(async () => {
    mockUseIsSpanish.mockReturnValue(false);
    loaderData = baseLoaderData();
    const mod = await import("../../../app/routes/app.conversations.$id");
    ConversationDetailPage = mod.default;
  });

  it("renders the conversation header with session metadata", () => {
    renderPage();

    expect(screen.getByText("Conversation")).toBeInTheDocument();
    expect(screen.getByText("WEB_CHAT")).toBeInTheDocument();
    expect(screen.getByText("es")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/Session: s1/)).toBeInTheDocument();
    expect(screen.getByText(/Visitor: v1/)).toBeInTheDocument();
  });

  it("renders transcript bubbles with role and content", () => {
    renderPage();

    expect(screen.getByText("Hola, quiero comprar un abrigo")).toBeInTheDocument();
    expect(screen.getByText("Claro, ¿qué talla buscas?")).toBeInTheDocument();
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("Assistant")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Tokens: 120")).toBeInTheDocument();
    expect(screen.getByText("Confidence: 90%")).toBeInTheDocument();
  });

  it("renders tool chips from metadata.toolsUsed and toolInvocations", () => {
    renderPage();

    expect(screen.getByText("searchCatalog")).toBeInTheDocument();
    expect(screen.getByText("getTrackingStatus")).toBeInTheDocument();
    expect(screen.getByText("Order not found")).toBeInTheDocument();
  });

  it("renders the handoff card with reason, status, assignee and notes", () => {
    renderPage();

    expect(screen.getByText("Customer asked for a human")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText(/agent@shop.com/)).toBeInTheDocument();
    expect(screen.getByText(/Revisar estado del envío/)).toBeInTheDocument();
  });

  it("renders the empty state when there are no messages", () => {
    loaderData = { ...baseLoaderData(), messages: [], handoffs: [] };

    renderPage();

    expect(screen.getByText("No messages")).toBeInTheDocument();
    expect(screen.queryByText("Hola, quiero comprar un abrigo")).not.toBeInTheDocument();
  });

  it("renders Spanish copy when the admin language is Spanish", () => {
    mockUseIsSpanish.mockReturnValue(true);
    loaderData = baseLoaderData();

    renderPage();

    expect(screen.getByText("Conversación")).toBeInTheDocument();
    expect(screen.getByText("Cliente")).toBeInTheDocument();
    expect(screen.getByText("Asistente")).toBeInTheDocument();
    expect(screen.getByText("Confianza: 90%")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.queryByText("Sin asignar")).not.toBeInTheDocument();
  });

  it("renders the Spanish empty state when there are no messages", () => {
    mockUseIsSpanish.mockReturnValue(true);
    loaderData = { ...baseLoaderData(), messages: [], handoffs: [] };

    renderPage();

    expect(screen.getByText("Sin mensajes")).toBeInTheDocument();
  });

  it("renders an external-widget conversation transcript with the external badge", () => {
    loaderData = {
      source: "external",
      conversation: {
        id: "ext-1",
        channel: "EXTERNAL_WIDGET",
        status: "EXTERNAL",
        locale: null,
        visitorId: "v9",
        sessionId: "s9",
        startedAt: new Date("2026-07-02T08:00:00Z"),
        lastMessageAt: null,
      },
      messages: [
        { id: "ext-user-1", role: "USER", content: "Hola desde el widget", confidence: null, tokensUsed: null, metadata: null, createdAt: "2026-07-02T08:00:01Z", toolInvocations: [] },
        { id: "ext-assistant-1", role: "ASSISTANT", content: "Hola, ¿en qué te ayudo?", confidence: null, tokensUsed: null, metadata: null, createdAt: "2026-07-02T08:00:02Z", toolInvocations: [] },
      ],
      handoffs: [],
    };

    renderPage();

    expect(screen.getByText("External widget")).toBeInTheDocument();
    expect(screen.getByText("EXTERNAL_WIDGET")).toBeInTheDocument();
    expect(screen.getByText("Hola desde el widget")).toBeInTheDocument();
    expect(screen.getByText("Hola, ¿en qué te ayudo?")).toBeInTheDocument();
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("Assistant")).toBeInTheDocument();
  });

  it("renders the external source badge in Spanish", () => {
    mockUseIsSpanish.mockReturnValue(true);
    loaderData = {
      source: "external",
      conversation: {
        id: "ext-1",
        channel: "EXTERNAL_WIDGET",
        status: "EXTERNAL",
        locale: null,
        visitorId: "v9",
        sessionId: "s9",
        startedAt: new Date("2026-07-02T08:00:00Z"),
        lastMessageAt: null,
      },
      messages: [],
      handoffs: [],
    };

    renderPage();

    expect(screen.getAllByText("Widget externo").length).toBeGreaterThan(0);
    expect(screen.getByText("Sin mensajes")).toBeInTheDocument();
  });
});
