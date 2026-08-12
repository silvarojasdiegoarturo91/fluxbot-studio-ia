// @vitest-environment jsdom
/**
 * Component render smoke tests — app.campaigns.tsx
 *
 * Renders the real component in jsdom with mocked router/polaris/admin-ui
 * and asserts visible campaign states: stats, table rows, empty state,
 * the create-campaign modal and Spanish copy.
 */

import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseIsSpanish, mockSubmit } = vi.hoisted(() => ({
  mockUseIsSpanish: vi.fn(),
  mockSubmit: vi.fn(),
}));

let loaderData: any;
let locationState = { pathname: "/app/campaigns", search: "" };

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
    "requiredIndicator",
    "multiline",
    "autoComplete",
    "helpText",
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

  const ModalComponent = ({ open, title, children, primaryAction }: any) =>
    open
      ? React.createElement(
          "div",
          { "data-modal": true },
          title,
          children,
          React.createElement("button", { type: "button", onClick: primaryAction.onAction }, primaryAction.content),
        )
      : null;

  return {
    Page: wrap("div"),
    Layout,
    InlineGrid: wrap("div"),
    InlineStack: wrap("div"),
    Badge: wrap("span"),
    Button: ({ children, onClick, ...props }: any) =>
      React.createElement("button", { type: "button", onClick, ...props }, children),
    Banner: ({ title, children }: { title?: string; children?: React.ReactNode }) =>
      React.createElement("div", null, title, children),
    EmptyState: ({ heading, action, children }: any) =>
      React.createElement(
        "div",
        null,
        heading,
        action ? React.createElement("button", { type: "button", onClick: action.onAction }, action.content) : null,
        children,
      ),
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
    FormLayout: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
    TextField: ({ label, value, onChange }: any) =>
      React.createElement(
        "label",
        null,
        React.createElement("span", null, label),
        React.createElement("input", { value, onChange: onChange ? () => undefined : undefined }),
      ),
    Select: ({ label, options, value }: any) =>
      React.createElement(
        "label",
        null,
        React.createElement("span", null, label),
        React.createElement("select", { "data-value": value },
          (options || []).map((opt: any, i: number) =>
            React.createElement("option", { key: i, value: opt.value }, opt.label),
          ),
        ),
      ),
    Modal: Object.assign(ModalComponent, { Section: wrap("section") }),
  };
});

vi.mock("react-router", () => ({
  useLoaderData: () => loaderData,
  useLocation: () => locationState,
  useSubmit: () => mockSubmit,
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

vi.mock("../../../app/utils/authenticate-admin.server", () => ({ authenticateAdminRequest: vi.fn() }));
vi.mock("../../../app/services/shop-context.server", () => ({ ensureShopForSession: vi.fn() }));
vi.mock("../../../app/services/campaign.server", () => ({
  listCampaigns: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
}));

const CAMPAIGNS = [
  {
    id: "camp-1",
    name: "Black Friday",
    status: "ACTIVE",
    scheduleType: "IMMEDIATE",
    totalDispatched: 100,
    totalConverted: 25,
  },
  {
    id: "camp-2",
    name: "Welcome",
    status: "DRAFT",
    scheduleType: "RECURRING",
    totalDispatched: 0,
    totalConverted: 0,
  },
];

let CampaignsPage: React.ComponentType<any>;

function renderPage() {
  return render(React.createElement(CampaignsPage));
}

describe("app.campaigns component", () => {
  beforeEach(async () => {
    mockUseIsSpanish.mockReturnValue(false);
    loaderData = { campaigns: CAMPAIGNS };
    locationState = { pathname: "/app/campaigns", search: "" };
    const mod = await import("../../../app/routes/app.campaigns");
    CampaignsPage = mod.default;
  });

  it("renders campaign stats and the campaigns table in English", () => {
    renderPage();

    expect(screen.getByText("Marketing campaigns")).toBeInTheDocument();
    expect(screen.getByText("Active campaigns")).toBeInTheDocument();
    expect(screen.getByText("Total dispatched")).toBeInTheDocument();
    expect(screen.getByText("Overall CVR")).toBeInTheDocument();
    expect(screen.getByText("Configured campaigns")).toBeInTheDocument();
    expect(screen.getByText("Black Friday")).toBeInTheDocument();
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Immediate")).toBeInTheDocument();
    expect(screen.getByText("Recurring")).toBeInTheDocument();
    expect(screen.getAllByText("25.0%").length).toBeGreaterThan(0);
    expect(screen.getByText("1 active")).toBeInTheDocument();
  });

  it("renders Spanish copy when the admin language is Spanish", () => {
    mockUseIsSpanish.mockReturnValue(true);
    loaderData = { campaigns: CAMPAIGNS };

    renderPage();

    expect(screen.getByText("Campañas de marketing")).toBeInTheDocument();
    expect(screen.getByText("Campañas activas")).toBeInTheDocument();
    expect(screen.getByText("Total de envíos")).toBeInTheDocument();
    expect(screen.getByText("CVR global")).toBeInTheDocument();
    expect(screen.getByText("Campañas configuradas")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("Borrador")).toBeInTheDocument();
  });

  it("renders the empty state when there are no campaigns", () => {
    loaderData = { campaigns: [] };

    renderPage();

    expect(screen.getByText("No campaigns yet")).toBeInTheDocument();
    expect(screen.getByText(/Create locale-aware proactive campaigns/)).toBeInTheDocument();
  });

  it("opens the create-campaign modal from the header action", () => {
    renderPage();

    fireEvent.click(screen.getByText("New campaign"));

    expect(screen.getByText("New marketing campaign")).toBeInTheDocument();
    expect(screen.getByText("Campaign name")).toBeInTheDocument();
    expect(screen.getByText("Schedule type")).toBeInTheDocument();
    expect(screen.getByText("Message templates")).toBeInTheDocument();
    expect(screen.getByText("English template (en)")).toBeInTheDocument();
    expect(screen.getByText("Spanish template (es)")).toBeInTheDocument();
  });

  it("submits the create form with the collected fields", () => {
    renderPage();

    fireEvent.click(screen.getByText("New campaign"));
    fireEvent.click(screen.getByText("Create"));

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const formData = mockSubmit.mock.calls[0][0];
    expect(formData.get("intent")).toBe("create");
    expect(formData.get("scheduleType")).toBe("IMMEDIATE");
  });
});
