/**
 * Component render tests for app.assistant-config.tsx
 *
 * Renders the real component in jsdom with mocked router/polaris and asserts
 * the visible DOM: identity fields, banners (backend availability, action
 * results) and sync badges.
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoaderData: { current: unknown } = { current: null };
const mockActionData: { current: unknown } = { current: null };
const mockNavState: { current: string } = { current: "idle" };

vi.mock("react-router", () => ({
  Form: ({ children }: { children: React.ReactNode }) =>
    React.createElement("form", {}, children),
  useActionData: () => mockActionData.current,
  useLoaderData: () => mockLoaderData.current,
  useNavigation: () => ({ state: mockNavState.current }),
  useMatches: () => [{ id: "root", data: { adminLanguage: "es" } }],
}));

vi.mock("@shopify/polaris", () => {
  const React = require("react");
  const wrap =
    (tag = "div") =>
    ({ children, ...props }: React.HTMLAttributes<HTMLElement>) =>
      React.createElement(tag, props, children);

  const Layout = Object.assign(wrap("div"), { Section: wrap("section") });

  return {
    Page: wrap("div"),
    Layout,
    BlockStack: wrap("div"),
    InlineStack: wrap("div"),
    Box: wrap("div"),
    Divider: wrap("hr"),
    Text: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", {}, children),
    TextField: ({ name, value, onChange }: { name?: string; value?: string; onChange?: (v: string) => void }) =>
      React.createElement("textarea", {
        name,
        value,
        onChange: onChange ? () => undefined : undefined,
        "data-testid": name,
      }),
    Select: ({ name, value }: { name?: string; value?: string }) =>
      React.createElement("select", { name, "data-testid": name, "data-value": value }),
    Button: ({ children, submit, disabled }: { children: React.ReactNode; submit?: boolean; disabled?: boolean }) =>
      React.createElement("button", { type: submit ? "submit" : "button", disabled }, children),
    Banner: ({ title, children }: { title?: React.ReactNode; children?: React.ReactNode }) =>
      React.createElement("div", { "data-banner": true }, title, children),
    FormLayout: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", {}, children),
    Badge: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", {}, children),
  };
});

vi.mock("../../../app/components/admin-ui", () => ({
  AdminPageHeader: ({ title }: { title: string }) => React.createElement("h1", { "data-testid": "page-header" }, title),
  AdminSectionCard: ({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) =>
    React.createElement("section", { "data-testid": "section-card" }, title, description, children),
}));

vi.mock("@shopify/app-bridge-react", () => ({
  useAppBridge: () => ({}),
}));

vi.mock("../../../app/shopify.server", () => ({
  authenticate: { admin: vi.fn() },
}));

const BASE_CONFIG = {
  shopId: "shop-1",
  assistantName: "Flux Advisor",
  persona: "FRIENDLY",
  tone: "cercano y claro",
  systemInstructions: "Siempre ofrece envío gratis",
  welcomeMessage: "¡Hola! ¿En qué te ayudo?",
  language: "es",
  productCategories: [],
};

let AssistantConfigPage: React.ComponentType<any>;

function renderPage() {
  return render(React.createElement(AssistantConfigPage));
}

describe("app.assistant-config component", () => {
  beforeEach(async () => {
    mockLoaderData.current = { config: BASE_CONFIG, backendAvailable: true };
    mockActionData.current = null;
    mockNavState.current = "idle";
    const mod = await import("../../../app/routes/app.assistant-config");
    AssistantConfigPage = mod.default;
  });

  it("renders the page header and identity fields with loader config values", () => {
    renderPage();

    expect(screen.getByTestId("page-header")).toHaveTextContent("Personalidad IA");
    expect(screen.getByTestId("assistantName")).toHaveValue("Flux Advisor");
    expect(screen.getByTestId("persona")).toHaveAttribute("data-value", "FRIENDLY");
    expect(screen.getByTestId("language")).toHaveAttribute("data-value", "es");
    expect(screen.getByText("Flux Advisor")).toBeInTheDocument();
    expect(screen.getByText("Guardar configuración")).toBeInTheDocument();
    expect(screen.getByText("Sincronizar catálogo")).toBeInTheDocument();
  });

  it("shows a warning banner when the IA backend is unavailable", () => {
    mockLoaderData.current = { config: BASE_CONFIG, backendAvailable: false };
    renderPage();

    expect(screen.getByText("Backend IA no disponible")).toBeInTheDocument();
    expect(screen.getByText("Sincronizar catálogo").closest("button")).toBeDisabled();
  });

  it("renders the backend-unavailable help text", () => {
    mockLoaderData.current = { config: BASE_CONFIG, backendAvailable: false };
    renderPage();

    expect(screen.getByText(/fluxbot-studio-back-ia esté en ejecución/)).toBeInTheDocument();
  });

  it("shows a success banner when the action succeeded", () => {
    mockActionData.current = { ok: true, message: "Configuración del asistente guardada" };
    renderPage();

    expect(screen.getByText("Configuración del asistente guardada")).toBeInTheDocument();
  });

  it("shows a critical banner when the action failed", () => {
    mockActionData.current = { ok: false, error: "Error al sincronizar catálogo: boom" };
    renderPage();

    expect(screen.getByText("Error al sincronizar catálogo: boom")).toBeInTheDocument();
  });

  it("renders sync result badges with duration", () => {
    mockActionData.current = {
      ok: true,
      message: "Sincronización completada: 120 fragmentos indexados en 1.5s",
      syncResult: { chunksIndexed: 120, durationMs: 1500 },
    };
    renderPage();

    expect(screen.getByText("120 productos indexados")).toBeInTheDocument();
    expect(screen.getByText("1.5s")).toBeInTheDocument();
  });
});
