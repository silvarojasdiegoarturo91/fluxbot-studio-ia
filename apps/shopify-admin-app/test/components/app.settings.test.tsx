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
let locationState = { pathname: "/app/settings", search: "?shop=shop.example.myshopify.com&host=dGVzdA" };

function baseLoaderData(overrides: Record<string, unknown> = {}) {
  return {
    shop: { id: "shop-1", domain: "shop.example.myshopify.com" },
    config: {
      name: "Fluxy",
      tone: "professional",
      language: "es",
      temperature: 0.8,
      maxTokens: 700,
      systemPrompt: "Be helpful",
      userPrompt: "Context",
      enableProactive: true,
      enableHandoff: true,
      confidenceThreshold: 0.65,
      isActive: true,
      updatedAt: "2026-01-15T00:00:00.000Z",
    },
    localeOptions: [
      { label: "ES - Español", value: "es" },
      { label: "EN - English", value: "en" },
    ],
    ...overrides,
  };
}

vi.mock("@shopify/polaris", () => {
  const React = require("react");

  const wrap =
    (Tag = "div") =>
    ({ children, ...props }: any) =>
      React.createElement(Tag, props, children);

  const Layout = Object.assign(wrap("div"), { Section: wrap("section") });

  return {
    Page: wrap("div"),
    Layout,
    BlockStack: wrap("div"),
    Text: ({ as = "span", children }: { as?: string; children?: React.ReactNode }) =>
      React.createElement(as, null, children),
    TextField: ({ label }: { label?: string }) => React.createElement("label", null, label),
    Select: ({ label }: { label?: string }) => React.createElement("label", null, label),
    InlineGrid: wrap("div"),
    Button: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("button", { type: "submit" }, children),
    Banner: ({ title, children }: { title?: string; children?: React.ReactNode }) =>
      React.createElement("div", null, title, children),
    FormLayout: wrap("div"),
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

vi.mock("../../app/components/admin-ui", () => {
  const React = require("react");
  return {
    AdminPageHeader: ({ eyebrow, title, description, badge }: { eyebrow: string; title: string; description: string; badge?: React.ReactNode }) =>
      React.createElement(
        "header",
        null,
        React.createElement("h1", null, title),
        React.createElement("p", null, eyebrow),
        React.createElement("p", null, description),
        badge,
      ),
    AdminSectionCard: ({ title, children }: { title: string; children: React.ReactNode }) =>
      React.createElement("section", null, React.createElement("h2", null, title), children),
    AdminStatCard: ({ label, value, meta }: { label: string; value: unknown; meta?: unknown }) =>
      React.createElement("div", null, `${label}: ${value}`, meta ? ` (${meta})` : null),
    AdminStatusBadge: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", null, children),
    AdminInfoCallout: ({ title, children }: { title: string; children: React.ReactNode }) =>
      React.createElement("div", null, title, children),
  };
});

import SettingsPage from "../../app/routes/app.settings";

describe("SettingsPage component", () => {
  beforeEach(() => {
    mockUseIsSpanish.mockReturnValue(false);
    loaderData = baseLoaderData();
    actionData = undefined;
    navigationState = { state: "idle", formData: null };
    locationState = { pathname: "/app/settings", search: "?shop=shop.example.myshopify.com&host=dGVzdA" };
  });

  it("renders the settings header and identity fields in English", () => {
    render(<SettingsPage />);

    expect(screen.getByText("Assistant settings")).toBeInTheDocument();
    expect(screen.getByText("Assistant identity and voice")).toBeInTheDocument();
    expect(screen.getByText("Assistant name")).toBeInTheDocument();
    expect(screen.getByText("Global language")).toBeInTheDocument();
    expect(screen.getByText("How the assistant responds")).toBeInTheDocument();
    expect(screen.getByText("Automation and escalation")).toBeInTheDocument();
    expect(screen.getByText("Advanced guidance and extra context")).toBeInTheDocument();
    expect(screen.getByText("Save settings")).toBeInTheDocument();
  });

  it("renders Spanish copy when the admin language is Spanish", () => {
    mockUseIsSpanish.mockReturnValue(true);
    loaderData = baseLoaderData();

    render(<SettingsPage />);

    expect(screen.getByText("Configuración del asistente")).toBeInTheDocument();
    expect(screen.getByText("Identidad y voz del asistente")).toBeInTheDocument();
    expect(screen.getByText("Como responde el asistente")).toBeInTheDocument();
    expect(screen.getByText("Automatización y escalado")).toBeInTheDocument();
    expect(screen.getByText("Guardar configuración")).toBeInTheDocument();
  });

  it("shows a paused status badge when the assistant is inactive", () => {
    loaderData = baseLoaderData({ config: { ...baseLoaderData().config, isActive: false } });

    render(<SettingsPage />);

    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("renders the success banner from action data", () => {
    actionData = { ok: true, message: "Configuración del asistente guardada." };

    render(<SettingsPage />);

    expect(screen.getByText("Configuración del asistente guardada.")).toBeInTheDocument();
  });

  it("renders the error banner from action data", () => {
    actionData = { ok: false, error: "Assistant name is required" };

    render(<SettingsPage />);

    expect(screen.getByText("Assistant name is required")).toBeInTheDocument();
  });

  it("shows the last-updated timestamp", () => {
    render(<SettingsPage />);

    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
  });

  it("shows the no-saved-settings message when there is no updatedAt", () => {
    loaderData = baseLoaderData({ config: { ...baseLoaderData().config, updatedAt: null } });

    render(<SettingsPage />);

    expect(screen.getByText("No saved settings yet.")).toBeInTheDocument();
  });

  it("renders response style summaries from the config numbers", () => {
    loaderData = baseLoaderData({
      config: {
        ...baseLoaderData().config,
        temperature: 0.3,
        maxTokens: 200,
        confidenceThreshold: 0.9,
      },
    });

    render(<SettingsPage />);

    expect(screen.getByText(/Very precise and predictable/)).toBeInTheDocument();
    expect(screen.getByText(/Short and direct/)).toBeInTheDocument();
    expect(screen.getByText(/Very cautious before replying/)).toBeInTheDocument();
  });

  it("marks the submit button as loading while submitting", () => {
    navigationState = { state: "submitting", formData: new FormData() };

    render(<SettingsPage />);

    expect(screen.getByRole("button", { name: "Save settings" })).toBeInTheDocument();
  });
});
