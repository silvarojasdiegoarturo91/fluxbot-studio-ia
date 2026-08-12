import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseIsSpanish } = vi.hoisted(() => ({
  mockUseIsSpanish: vi.fn(),
}));

let loaderData: any;
let actionData: any = undefined;
let navigationState: { state: "idle" | "loading" | "submitting"; formData: FormData | null } = {
  state: "idle",
  formData: null,
};
let locationState = { pathname: "/app/billing", search: "?shop=shop.example.myshopify.com&host=dGVzdA&embedded=1" };

const plans = [
  {
    id: "free",
    name: "Free",
    amountUsd: 0,
    interval: "EVERY_30_DAYS",
    description: "",
    includedMessages: 75,
    extraBlockSize: 0,
    extraBlockPrice: 0,
    cappedAmountUsd: 0,
  },
  {
    id: "starter",
    name: "FluxBot Starter",
    amountUsd: 19,
    interval: "EVERY_30_DAYS",
    description: "",
    includedMessages: 500,
    extraBlockSize: 500,
    extraBlockPrice: 10,
    cappedAmountUsd: 100,
  },
  {
    id: "growth",
    name: "FluxBot Growth",
    amountUsd: 49,
    interval: "EVERY_30_DAYS",
    description: "",
    includedMessages: 2000,
    extraBlockSize: 2000,
    extraBlockPrice: 10,
    cappedAmountUsd: 200,
  },
];

function baseLoaderData(): any {
  return {
    shop: { id: "shop-1", domain: "shop.example.myshopify.com" },
    status: {
      hasActiveSubscription: true,
      subscriptions: [
        {
          id: "sub-1",
          name: "FluxBot Starter",
          status: "ACTIVE",
          test: true,
          priceAmount: "19",
          priceCurrency: "USD",
          interval: "EVERY_30_DAYS",
          createdAt: "2026-01-15T00:00:00Z",
        },
      ],
    },
    plans,
    usageStatus: {
      currentUsage: 125,
      includedUsage: 500,
      billedBlocks: 0,
      cappedAmount: 100,
      status: "active",
    },
    resolvedCurrentPlanId: "starter",
    resolvedHasActiveSubscription: true,
    error: null,
  };
}

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
    Card: wrap("div"),
    BlockStack: wrap("div"),
    InlineStack: wrap("div"),
    InlineGrid: wrap("div"),
    Box: wrap("div"),
    Banner: ({ title, children }: { title?: string; children?: React.ReactNode }) =>
      React.createElement("div", null, title, children),
    Badge: wrap("span"),
    Button: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("button", { type: "submit", ...props }, children),
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
              row.map((cell, j) => React.createElement("td", { key: j }, String(cell))),
            ),
          ),
        ),
      ),
    ProgressBar: ({ progress }: { progress: number }) =>
      React.createElement("progress", { value: progress, max: 100 }),
    Text: ({ as = "span", children, ...props }: { as?: keyof JSX.IntrinsicElements; children?: React.ReactNode }) => {
      const clean: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(props)) {
        if (!IGNORED_PROPS.has(key)) clean[key] = value;
      }
      return React.createElement(as, clean, children);
    },
    List,
  };
});

vi.mock("react-router", async () => {
  const React = await import("react");
  return {
    Form: React.forwardRef<HTMLFormElement, React.FormHTMLAttributes<HTMLFormElement>>(
      ({ children, ...props }, ref) =>
        React.createElement(
          "form",
          { ...props, ref, onSubmit: (event: React.FormEvent<HTMLFormElement>) => event.preventDefault() },
          children,
        ),
    ),
    useActionData: () => actionData,
    useLoaderData: () => loaderData,
    useNavigation: () => navigationState,
    useLocation: () => locationState,
  };
});

vi.mock("../../app/hooks/use-admin-language", () => ({
  useIsSpanish: mockUseIsSpanish,
}));

vi.mock("../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: vi.fn(),
}));

vi.mock("../../app/services/shop-context.server", () => ({
  ensureShopForSession: vi.fn(),
}));

import BillingPage from "../../app/routes/app.billing";

describe("BillingPage component", () => {
  beforeEach(() => {
    mockUseIsSpanish.mockReturnValue(false);
    loaderData = baseLoaderData();
    actionData = undefined;
    navigationState = { state: "idle", formData: null };
    locationState = { pathname: "/app/billing", search: "?shop=shop.example.myshopify.com&host=dGVzdA&embedded=1" };
  });

  it("renders billing status, usage meter and plan cards in English", () => {
    render(<BillingPage />);

    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("Active subscription")).toBeInTheDocument();
    expect(screen.getByText("Current cycle usage")).toBeInTheDocument();
    expect(screen.getByText("Change plan")).toBeInTheDocument();
    expect(screen.getAllByText("FluxBot Starter").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Upgrade to FluxBot Growth")).toBeInTheDocument();
    expect(screen.getByText("Variable cap: $200 USD")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("renders Spanish copy when the admin language is Spanish", () => {
    mockUseIsSpanish.mockReturnValue(true);
    loaderData = baseLoaderData();

    render(<BillingPage />);

    expect(screen.getByText("Facturación")).toBeInTheDocument();
    expect(screen.getByText("Consumo del ciclo actual")).toBeInTheDocument();
    expect(screen.getByText("Suscripción activa")).toBeInTheDocument();
    expect(screen.getByText("Mensajes del plan base")).toBeInTheDocument();
    expect(screen.getByText("Cambiar plan")).toBeInTheDocument();
    expect(screen.getByText("Tope variable: $200 USD")).toBeInTheDocument();
  });

  it("shows the extra tranches banner when usage exceeds the included base", () => {
    loaderData = {
      ...baseLoaderData(),
      usageStatus: {
        currentUsage: 1200,
        includedUsage: 500,
        billedBlocks: 2,
        cappedAmount: 100,
        status: "active",
      },
    };

    render(<BillingPage />);

    expect(screen.getByText("Extra tranches active")).toBeInTheDocument();
    expect(screen.getByText(/2 tranche\(s\) charged/)).toBeInTheDocument();
  });

  it("renders the subscription error banner from action data", () => {
    actionData = { ok: false, error: "You are already subscribed to this plan." };

    render(<BillingPage />);

    expect(screen.getByText("Subscription error")).toBeInTheDocument();
    expect(screen.getByText("You are already subscribed to this plan.")).toBeInTheDocument();
  });

  it("renders the billing status error banner when the loader errored", () => {
    loaderData = {
      ...baseLoaderData(),
      status: { hasActiveSubscription: false, subscriptions: [] },
      usageStatus: { currentUsage: 0, includedUsage: 500, billedBlocks: 0, cappedAmount: 100, status: "active" },
      resolvedCurrentPlanId: null,
      resolvedHasActiveSubscription: false,
      error: "Billing unavailable",
    };

    render(<BillingPage />);

    expect(screen.getByText("Error loading status")).toBeInTheDocument();
    expect(screen.getByText("Billing unavailable")).toBeInTheDocument();
    expect(screen.getByText("No active plan")).toBeInTheDocument();
    expect(screen.getByText(/There are no active subscriptions/)).toBeInTheDocument();
  });

  it("detects an unknown external plan as an upgrade-only state", () => {
    loaderData = {
      ...baseLoaderData(),
      status: {
        hasActiveSubscription: true,
        subscriptions: [{ id: "sub-x", name: "Custom Enterprise Deal", status: "ACTIVE" }],
      },
      resolvedCurrentPlanId: null,
      resolvedHasActiveSubscription: true,
      plans: plans.filter((plan) => plan.id === "starter"),
    };

    render(<BillingPage />);

    expect(screen.getByText("External plan detected")).toBeInTheDocument();
    expect(screen.getByText("Upgrade to FluxBot Starter")).toBeInTheDocument();
  });

  it("shows a no-changes banner when every plan is already the active one", () => {
    loaderData = {
      ...baseLoaderData(),
      plans: [plans[1]],
      resolvedCurrentPlanId: "starter",
      resolvedHasActiveSubscription: true,
    };

    render(<BillingPage />);

    expect(screen.getByText("No plan changes available")).toBeInTheDocument();
  });

  it("navigates the top frame to the confirmation URL when action succeeds", () => {
    const topLocation = { href: "" };
    Object.defineProperty(window, "top", { value: { location: topLocation }, configurable: true });
    actionData = { ok: true, confirmationUrl: "https://shopify.example/confirm" };

    render(<BillingPage />);

    expect(topLocation.href).toBe("https://shopify.example/confirm");
  });

  it("shows a loading state on the submitting plan card", () => {
    const formData = new FormData();
    formData.set("intent", "create_subscription");
    formData.set("planId", "growth");
    navigationState = { state: "submitting", formData };

    render(<BillingPage />);

    expect(screen.getByRole("button", { name: "Upgrade to FluxBot Growth" })).toHaveAttribute("type", "submit");
  });
});
