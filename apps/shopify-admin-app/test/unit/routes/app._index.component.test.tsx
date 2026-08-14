// @vitest-environment jsdom
/**
 * Component render smoke tests — app._index.tsx (dashboard index)
 *
 * Renders the real component in jsdom with mocked router/polaris/admin-ui
 * and asserts visible dashboard states: stats, assistant health, alerts,
 * onboarding success banner and Spanish copy.
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseIsSpanish } = vi.hoisted(() => ({ mockUseIsSpanish: vi.fn() }));

let loaderData: any;
let locationState = { pathname: "/app", search: "" };
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
    Page: wrap("div"),
    Layout,
    BlockStack: wrap("div"),
    InlineStack: wrap("div"),
    InlineGrid: wrap("div"),
    Banner: ({ title, children }: { title?: string; children?: React.ReactNode }) =>
      React.createElement("div", null, title, children),
    Badge: wrap("span"),
    Button: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("button", { type: "button", ...props }, children),
    Text: ({ as = "span", children }: { as?: keyof JSX.IntrinsicElements; children?: React.ReactNode }) =>
      React.createElement(as, {}, children),
    List,
    ProgressBar: ({ progress }: { progress: number }) =>
      React.createElement("progress", { value: progress, max: 100 }),
  };
});

vi.mock("react-router", () => ({
  useLoaderData: () => loaderData,
  useLocation: () => locationState,
  useNavigate: () => mockNavigate,
}));

vi.mock("../../../app/hooks/use-admin-language", () => ({
  useIsSpanish: mockUseIsSpanish,
}));

vi.mock("../../../app/components/admin-ui", () => {
  const React = require("react");
  return {
    AdminPageHeader: ({ title, badge, actions }: any) =>
      React.createElement("header", null, title, badge, actions),
    AdminSectionCard: ({ title, description, children, badge }: any) =>
      React.createElement("section", null, title, description, badge, children),
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
    AdminInfoCallout: ({ title, children }: any) =>
      React.createElement("div", { "data-callout": title }, title, children),
  };
});

vi.mock("../../../app/db.server", () => ({ default: {} }));
vi.mock("../../../app/utils/authenticate-admin.server", () => ({ authenticateAdminRequest: vi.fn() }));
vi.mock("../../../app/services/shop-context.server", () => ({ ensureShopForSession: vi.fn() }));
vi.mock("../../../app/services/shop-connection.server", () => ({ fetchShopConnection: vi.fn() }));
vi.mock("../../../app/services/admin-config.server", () => ({ getMerchantAdminConfig: vi.fn() }));
vi.mock("../../../app/services/analytics.server", () => ({ AnalyticsService: {} }));

function baseLoaderData(): any {
  return {
    shopConnection: {
      connected: true,
      name: "Example Store",
      myshopifyDomain: "shop.example.myshopify.com",
      primaryDomainHost: "example.com",
      planName: "Basic",
      error: null,
      source: "live",
    },
    business: {
      conversationsLast7d: 42,
      assistedRevenueLast7d: 129.5,
      proactiveSentLast7d: 7,
      openHandoffs: 0,
      activeCampaigns: 2,
      activeSources: 3,
      totalSources: 4,
      failedSyncJobs: 0,
      runningSyncJobs: 0,
      hasCompletedSync: true,
      lastSyncLabel: "FULL_CATALOG · 7/1/2026, 10:00:00 AM",
    },
    assistant: {
      isActive: true,
      language: "en",
      tone: "professional",
      enableProactive: true,
      enableHandoff: true,
    },
    alerts: [],
    showOnboardingSuccess: false,
  };
}

let DashboardIndex: React.ComponentType<any>;

function renderPage() {
  return render(React.createElement(DashboardIndex));
}

describe("app._index component", () => {
  beforeEach(async () => {
    mockUseIsSpanish.mockReturnValue(false);
    loaderData = baseLoaderData();
    locationState = { pathname: "/app", search: "" };
    const mod = await import("../../../app/routes/app._index");
    DashboardIndex = mod.default;
  });

  it("renders the dashboard header, stats and assistant health in English", () => {
    renderPage();

    expect(screen.getByText("FluxBot Control Center")).toBeInTheDocument();
    expect(screen.getByText("Assistant active")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Conversations (7d)")).toBeInTheDocument();
    expect(screen.getByText("Revenue influenced (7d)")).toBeInTheDocument();
    expect(screen.getByText("$129.50")).toBeInTheDocument();
    expect(screen.getByText("Proactive messages (7d)")).toBeInTheDocument();
    expect(screen.getByText("Open handoffs")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 tasks completed")).toBeInTheDocument();
  });

  it("renders Spanish copy when the admin language is Spanish", () => {
    mockUseIsSpanish.mockReturnValue(true);
    loaderData = baseLoaderData();

    renderPage();

    expect(screen.getByText("FluxBot Centro de Control")).toBeInTheDocument();
    expect(screen.getByText("Asistente activo")).toBeInTheDocument();
    expect(screen.getByText("Conectada")).toBeInTheDocument();
    expect(screen.getByText("Conversaciones (7d)")).toBeInTheDocument();
    expect(screen.getByText("Ingresos influenciados (7d)")).toBeInTheDocument();
    expect(screen.getByText("Mensajes proactivos (7d)")).toBeInTheDocument();
    expect(screen.getByText("Handoffs abiertos")).toBeInTheDocument();
    expect(screen.getByText("Realizada")).toBeInTheDocument();
  });

  it("shows the onboarding success banner when the flag is set", () => {
    loaderData = { ...baseLoaderData(), showOnboardingSuccess: true };

    renderPage();

    expect(screen.getByText("Assistant activated")).toBeInTheDocument();
  });

  it("marks the assistant as needing attention when paused", () => {
    loaderData = {
      ...baseLoaderData(),
      assistant: { ...baseLoaderData().assistant, isActive: false },
    };

    renderPage();

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("shows a disconnected store connection with the error message", () => {
    loaderData = {
      ...baseLoaderData(),
      shopConnection: {
        connected: false,
        name: null,
        myshopifyDomain: null,
        primaryDomainHost: null,
        planName: null,
        error: "Admin API timeout",
        source: "live",
      },
    };

    renderPage();

    expect(screen.getByText("Check required")).toBeInTheDocument();
    expect(screen.getByText(/Could not fetch shop data from Admin API/)).toBeInTheDocument();
    expect(screen.getByText(/Admin API timeout/)).toBeInTheDocument();
  });

  it("renders pending-sync status while sync jobs are running", () => {
    loaderData = {
      ...baseLoaderData(),
      business: { ...baseLoaderData().business, runningSyncJobs: 1 },
    };

    renderPage();

    expect(screen.getByText("Sync in progress")).toBeInTheDocument();
  });

  it("renders the alerts list and the all-good state", () => {
    renderPage();
    expect(screen.getByText("All good")).toBeInTheDocument();

    loaderData = { ...baseLoaderData(), alerts: ["Alert one", "Alert two"] };
    renderPage();
    expect(screen.getByText("2 alerts")).toBeInTheDocument();
    expect(screen.getByText("Alert one")).toBeInTheDocument();
    expect(screen.getByText("Alert two")).toBeInTheDocument();
  });
});
