import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loaderData = {
  step: 1,
  totalSteps: 7,
  shop: { id: "shop-1" },
  config: {
    adminLanguage: "es",
    primaryBotLanguage: "es",
    supportedLanguages: ["es"],
    botName: "Asistente IA",
    botTone: "professional",
    botGoal: "SALES_SUPPORT",
    responseStyle: "BALANCED",
    welcomeMessage: "Hola, estoy aqui para ayudarte.",
    enabledCapabilities: {
      answerProducts: true,
      answerPolicies: true,
      answerOrders: true,
      recommendProducts: true,
      captureLeads: false,
    },
    widgetBranding: {
      primaryColor: "#008060",
      launcherPosition: "bottom-right",
      avatarStyle: "assistant",
      launcherLabel: "Asistente",
    },
    onboardingCompleted: false,
    onboardingStep: 1,
    updatedAt: new Date().toISOString(),
  },
  copy: {
    title: "Onboarding inicial",
    subtitle: "Configura tu asistente IA en pocos minutos",
    stepLabel: "Paso",
    progressLabel: "Progreso",
    saveDraft: "Guardar progreso",
    back: "Volver",
    next: "Continuar",
    complete: "Activar asistente",
    welcomeTitle: "Bienvenido",
    welcomeText: "Texto",
    welcomeBullets: ["Uno", "Dos"],
    languageTitle: "Idioma global",
    profileTitle: "Perfil del asistente",
    capabilitiesTitle: "Capacidades iniciales",
    brandingTitle: "Apariencia inicial",
    reviewTitle: "Revision final",
    activateTitle: "Activacion",
    reviewText: "Revision",
    activateText: "Activacion",
    activatedMessage: "Listo",
  },
};

vi.mock("@shopify/polaris", () => {
  const React = require("react");

  const wrap = (Tag = "div") =>
    ({ children, ...props }: React.HTMLAttributes<HTMLElement>) =>
      React.createElement(Tag, props, children);

  const Layout = Object.assign(wrap("div"), {
    Section: wrap("section"),
  });

  const List = Object.assign(wrap("ul"), {
    Item: wrap("li"),
  });

  return {
    Page: wrap("div"),
    Layout,
    Card: wrap("div"),
    BlockStack: wrap("div"),
    InlineStack: wrap("div"),
    InlineGrid: wrap("div"),
    FormLayout: wrap("div"),
    Banner: ({ title }: { title?: string }) => React.createElement("div", null, title),
    Badge: wrap("span"),
    ProgressBar: ({ progress }: { progress: number }) =>
      React.createElement("progress", { value: progress, max: 100 }),
    Text: ({ as = "span", children, ...props }: { as?: keyof JSX.IntrinsicElements; children?: React.ReactNode }) =>
      React.createElement(as, props, children),
    Button: ({ children, onClick, ...props }: { children?: React.ReactNode; onClick?: () => void }) =>
      React.createElement("button", { type: "button", onClick, ...props }, children),
    Select: ({
      label,
      options,
      value,
      onChange,
    }: {
      label: string;
      options: Array<{ label: string; value: string }>;
      value: string;
      onChange: (value: string) => void;
    }) =>
      React.createElement(
        "label",
        null,
        label,
        React.createElement(
          "select",
          {
            "aria-label": label,
            value,
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value),
          },
          options.map((option) =>
            React.createElement("option", { key: option.value, value: option.value }, option.label),
          ),
        ),
      ),
    TextField: ({
      label,
      value,
      onChange,
      multiline,
    }: {
      label: string;
      value: string;
      onChange: (value: string) => void;
      multiline?: boolean | number;
    }) =>
      React.createElement(
        "label",
        null,
        label,
        multiline
          ? React.createElement("textarea", {
              "aria-label": label,
              value,
              onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
            })
          : React.createElement("input", {
              "aria-label": label,
              value,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
            }),
      ),
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
          {
            ...props,
            ref,
            onSubmit: (event: React.FormEvent<HTMLFormElement>) => event.preventDefault(),
          },
          children,
        ),
    ),
    redirect: vi.fn(),
    useActionData: () => undefined,
    useLoaderData: () => loaderData,
    useNavigation: () => ({ state: "idle" }),
  };
});

vi.mock("../../app/services/admin-config.server", () => ({
  getMerchantAdminConfig: vi.fn(),
  saveMerchantAdminConfig: vi.fn(),
}));

vi.mock("../../app/services/shop-context.server", () => ({
  ensureShopForSession: vi.fn(),
}));

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

import OnboardingPage from "../../app/routes/app.onboarding";

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders continue as a client navigation button", () => {
    render(<OnboardingPage />);

    const button = screen.getByRole("button", { name: "Continuar" });
    expect(button).toHaveAttribute("type", "button");
  });
});
