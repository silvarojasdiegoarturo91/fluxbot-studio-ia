// @vitest-environment jsdom
/**
 * Component render smoke tests — app.conversations.tsx
 *
 * Renders the real component in jsdom with mocked router/polaris/admin-ui
 * and asserts visible conversation states: stat cards, tables, empty state,
 * action banners, filter buttons and Spanish copy.
 */

import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseIsSpanish } = vi.hoisted(() => ({ mockUseIsSpanish: vi.fn() }));

let loaderData: any;
let actionData: any = undefined;
let navigationState = { state: "idle" };
let locationState = { pathname: "/app/conversations", search: "" };
const mockNavigate = vi.fn();

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
    "backUrl",
    "backLabel",
    "columnContentTypes",
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
    Badge: wrap("span"),
    Button: ({ children, url, ...props }: any) =>
      url
        ? React.createElement("a", { href: url, ...props }, children)
        : React.createElement("button", { type: "button", ...props }, children),
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
  Form: ({ children }: { children?: React.ReactNode }) => React.createElement("form", null, children),
  Link: ({ to, children }: { to: string | { pathname: string; search?: string }; children?: React.ReactNode }) =>
    React.createElement(
      "a",
      { href: typeof to === "string" ? to : `${to.pathname}${to.search ?? ""}` },
      children,
    ),
  Outlet: () => React.createElement("div", { "data-testid": "detail-outlet" }, "detail-outlet"),
  useActionData: () => actionData,
  useLoaderData: () => loaderData,
  useNavigation: () => navigationState,
  useLocation: () => locationState,
  useNavigate: () => mockNavigate,
}));

vi.mock("../../../app/hooks/use-admin-language", () => ({
  useIsSpanish: mockUseIsSpanish,
}));

vi.mock("../../../app/components/admin-ui", () => {
  const React = require("react");
  return {
    AdminPageHeader: ({ title, badge }: any) => React.createElement("header", null, title, badge),
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
vi.mock("../../../app/services/admin-config.server", () => ({ getMerchantAdminConfig: vi.fn() }));
vi.mock("../../../app/services/ia-backend.server", () => ({
  iaClient: { widgetAdmin: { conversationRecent: vi.fn(), conversationDetail: vi.fn() } },
}));

function baseLoaderData(): any {
  return {
    shop: { id: "shop-1", domain: "shop.example.myshopify.com" },
    statusFilter: "ALL",
    limit: 25,
    summary: {
      activeNow: 1,
      escalated7d: 2,
      resolved7d: 3,
      total7d: 4,
      openHandoffs: 1,
    },
    conversations: [
      {
        id: "conv-1",
        channel: "WEB_CHAT",
        status: "ACTIVE",
        locale: "es",
        sessionId: "s1",
        startedAt: new Date("2026-07-01T10:00:00Z"),
        lastMessageAt: new Date("2026-07-01T10:05:00Z"),
        messages: [{ content: "Hola, quiero comprar un abrigo largo con capucha azul para mi hija", createdAt: new Date() }],
        _count: { messages: 3, handoffRequests: 0 },
      },
      {
        id: "conv-2",
        channel: "WHATSAPP",
        status: "ESCALATED",
        locale: "en",
        sessionId: "s2",
        startedAt: new Date("2026-07-01T09:00:00Z"),
        lastMessageAt: null,
        messages: [],
        _count: { messages: 0, handoffRequests: 1 },
      },
    ],
    externalConversations: [
      {
        id: "ext-1",
        source: "external",
        channel: "EXTERNAL_WIDGET",
        status: "EXTERNAL",
        locale: null,
        sessionId: "visitor-9",
        startedAt: new Date("2026-07-02T08:00:00Z"),
        lastMessageAt: null,
        lastMessagePreview: null,
        messageCount: 4,
        handoffCount: 0,
      },
    ],
    pendingHandoffs: [
      {
        id: "h-1",
        reason: "Customer asked for a human",
        status: "PENDING",
        createdAt: new Date("2026-07-01T10:00:00Z"),
        assignedTo: null,
        conversationId: "conv-2",
      },
    ],
  };
}

let ConversationsPage: React.ComponentType<any>;

function renderPage() {
  return render(React.createElement(ConversationsPage));
}

describe("app.conversations component", () => {
  beforeEach(async () => {
    mockUseIsSpanish.mockReturnValue(false);
    loaderData = baseLoaderData();
    actionData = undefined;
    navigationState = { state: "idle" };
    locationState = { pathname: "/app/conversations", search: "" };
    const mod = await import("../../../app/routes/app.conversations");
    ConversationsPage = mod.default;
  });

  it("renders summary stats, conversation rows and pending handoffs in English", () => {
    renderPage();

    expect(screen.getByText("Conversations")).toBeInTheDocument();
    expect(screen.getByText("Active now")).toBeInTheDocument();
    expect(screen.getByText("Total (7d)")).toBeInTheDocument();
    expect(screen.getByText("Escalated (7d)")).toBeInTheDocument();
    expect(screen.getByText("Resolved (7d)")).toBeInTheDocument();
    expect(screen.getByText("Open handoffs")).toBeInTheDocument();
    expect(screen.getByText("Recent conversations")).toBeInTheDocument();
    expect(screen.getByText("Pending handoffs")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Escalated").length).toBeGreaterThan(0);
    expect(screen.getByText("WEB_CHAT")).toBeInTheDocument();
    expect(screen.getByText("WHATSAPP")).toBeInTheDocument();
    expect(screen.getByText("Customer asked for a human")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getAllByText("Resolve").length).toBeGreaterThan(0);
  });

  it("marks external-widget conversations with a source badge", () => {
    renderPage();

    expect(screen.getByText("EXTERNAL_WIDGET")).toBeInTheDocument();
    expect(screen.getAllByText("External").length).toBeGreaterThan(0);
    expect(screen.getByText("Source")).toBeInTheDocument();
  });

  it("renders Spanish copy when the admin language is Spanish", () => {
    mockUseIsSpanish.mockReturnValue(true);
    loaderData = baseLoaderData();

    renderPage();

    expect(screen.getByText("Conversaciones")).toBeInTheDocument();
    expect(screen.getByText("Activas ahora")).toBeInTheDocument();
    expect(screen.getByText("Total (7d)")).toBeInTheDocument();
    expect(screen.getByText("Escaladas (7d)")).toBeInTheDocument();
    expect(screen.getByText("Resueltas (7d)")).toBeInTheDocument();
    expect(screen.getByText("Conversaciones recientes")).toBeInTheDocument();
    expect(screen.getByText("Handoffs pendientes")).toBeInTheDocument();
    expect(screen.getAllByText("Activas").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Escaladas").length).toBeGreaterThan(0);
    expect(screen.getByText("Sin asignar")).toBeInTheDocument();
    expect(screen.getByText("Resolver")).toBeInTheDocument();
  });

  it("navigates to the conversation detail when Ver is clicked", () => {
    mockUseIsSpanish.mockReturnValue(true);
    loaderData = baseLoaderData();

    renderPage();

    // With Link-based navigation, each "Ver" button is wrapped in an <a> element.
    // We verify the href attribute instead of mockNavigate calls.
    const verLinks = screen
      .getAllByText("Ver")
      .map((el) => el.closest("a"))
      .filter((el): el is HTMLAnchorElement => el !== null);
    expect(verLinks).toHaveLength(3);
    expect(verLinks[0].getAttribute("href")).toBe("/app/conversations/conv-1");
    expect(verLinks[2].getAttribute("href")).toBe("/app/conversations/ext-1?source=external");
  });

  it("renders the external source badge in Spanish", () => {
    mockUseIsSpanish.mockReturnValue(true);
    loaderData = baseLoaderData();

    renderPage();

    expect(screen.getByText("Widget externo")).toBeInTheDocument();
  });

  it("shows empty states when there is no data", () => {
    loaderData = {
      ...baseLoaderData(),
      conversations: [],
      externalConversations: [],
      pendingHandoffs: [],
      summary: { activeNow: 0, escalated7d: 0, resolved7d: 0, total7d: 0, openHandoffs: 0 },
    };

    renderPage();

    expect(screen.getByText("No conversations found")).toBeInTheDocument();
    expect(screen.getByText("No pending handoffs")).toBeInTheDocument();
    expect(screen.getByText("No blockers")).toBeInTheDocument();
  });

  it("renders the success banner from action data", () => {
    actionData = { ok: true, message: "Handoff marked as resolved." };

    renderPage();

    expect(screen.getByText("Handoff marked as resolved.")).toBeInTheDocument();
  });

  it("renders the error banner from action data", () => {
    actionData = { ok: false, error: "Handoff not found or already resolved" };

    renderPage();

    expect(screen.getByText("Handoff not found or already resolved")).toBeInTheDocument();
  });

  it("renders the status filter buttons", () => {
    renderPage();

    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Escalated").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Resolved").length).toBeGreaterThan(0);
    expect(screen.getByText("Abandoned")).toBeInTheDocument();
  });

  it("navigates to conversation detail without duplicated query separators", () => {
    mockUseIsSpanish.mockReturnValue(false);
    loaderData = baseLoaderData();
    locationState = {
      pathname: "/app/conversations",
      search: "?shop=test-2-grow.myshopify.com&embedded=1&host=YWRtaW4",
    };

    renderPage();

    // With Link-based navigation, we inspect the rendered href values directly.
    const viewLinks = screen
      .getAllByText("View")
      .map((el) => el.closest("a"))
      .filter((el): el is HTMLAnchorElement => el !== null);
    expect(viewLinks.length).toBeGreaterThan(0);

    for (const link of viewLinks) {
      const href = link.getAttribute("href") ?? "";
      expect(href).not.toContain("??");
      expect(href.split("?").length).toBeLessThanOrEqual(2);
    }

    const externalLink = viewLinks.find((el) => el.getAttribute("href")?.includes("ext-1"));
    expect(externalLink).toBeDefined();
    // Session params (shop, embedded, host) MUST be preserved on the href so
    // App Bridge can restore the authenticated embedded context after clicking.
    const externalHref = externalLink?.getAttribute("href") ?? "";
    expect(externalHref).toContain("/app/conversations/ext-1");
    expect(externalHref).toContain("source=external");
    expect(externalHref).toContain("shop=test-2-grow.myshopify.com");
    expect(externalHref).toContain("embedded=1");
    expect(externalHref).toContain("host=YWRtaW4");
  });

  it("renders the detail child route via Outlet when the URL has a conversation id", () => {
    // Regression: `/app/conversations/:id` is a child route rendered inside the
    // list layout via <Outlet />. Previously the list rendered WITHOUT an
    // Outlet, so the detail component never mounted: URL changed, loader ran
    // (200), but the view stayed frozen on the list. This is the core bug.
    mockUseIsSpanish.mockReturnValue(false);
    locationState = {
      pathname: "/app/conversations/conv-abc",
      search: "?shop=test-2-grow.myshopify.com",
    };

    renderPage();

    // The list content (stat cards / conversation table) must NOT render…
    expect(screen.queryByText("Active now")).not.toBeInTheDocument();
    // …and the Outlet (which React Router fills with the detail component) MUST render.
    expect(screen.getByTestId("detail-outlet")).toBeInTheDocument();
  });
});
