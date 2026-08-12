import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let navigationState: { state: "idle" | "loading" | "submitting"; location: { pathname: string; search: string } | null } = {
  state: "idle",
  location: null,
};

let locationState = {
  pathname: "/app/onboarding",
  search: "?step=1",
};

let actionData: any = undefined;

const navigateMock = vi.fn();

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    adminLanguage: "es",
    primaryBotLanguage: "es",
    supportedLanguages: ["es"],
    botName: "Asistente IA",
    botTone: "professional",
    botGoal: "SALES_SUPPORT",
    responseStyle: "BALANCED",
    welcomeMessage: "Hola, estoy aquí para ayudarte.",
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
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeCopy(overrides: Record<string, unknown> = {}) {
  return {
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
    languageTitle: "Identidad",
    profileTitle: "Perfil del asistente",
    capabilitiesTitle: "Capacidades iniciales",
    brandingTitle: "Estilo",
    reviewTitle: "Revision final",
    activateTitle: "Activacion",
    reviewText: "Revision",
    activateText: "Activacion",
    activatedMessage: "Listo",
    ...overrides,
  };
}

function makeLoaderData(overrides: Record<string, unknown> = {}) {
  return {
    step: 1,
    totalSteps: 4,
    shop: { id: "shop-1", domain: "shop.example.myshopify.com" },
    config: makeConfig(),
    copy: makeCopy(),
    ...overrides,
  };
}

let loaderData: any = makeLoaderData();

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
    redirect: vi.fn(() => new Response(null, { status: 302 })),
    isRouteErrorResponse: (error: unknown) => {
      const e = error as { status?: number };
      return typeof e?.status === "number";
    },
    useActionData: () => actionData,
    useLoaderData: () => loaderData,
    useNavigation: () => navigationState,
    useLocation: () => locationState,
    useNavigate: () => navigateMock,
    useRouteError: () => ({ status: 500, statusText: "Server error" }),
  };
});

vi.mock("../../app/services/admin-config.server", () => ({
  getDefaultMerchantAdminConfig: vi.fn(() => makeConfig()),
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

vi.mock("../../app/services/shop-backend-sync.server", () => ({
  syncShopReferenceToIABackend: vi.fn(),
}));

import OnboardingPage, { ErrorBoundary } from "../../app/routes/app.onboarding";

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    navigateMock.mockReset();
    navigationState = { state: "idle", location: null };
    locationState = { pathname: "/app/onboarding", search: "?step=1" };
    actionData = undefined;
    loaderData = makeLoaderData();
  });

  it("renders continue as a client navigation button", () => {
    render(<OnboardingPage />);

    const button = screen.getByRole("button", { name: "Continuar" });
    expect(button).toHaveAttribute("type", "button");
  });

  it("navigates to the next onboarding step without a full reload", () => {
    render(<OnboardingPage />);

    screen.getByRole("button", { name: "Continuar" }).click();

    expect(navigateMock).toHaveBeenCalledWith(
      expect.stringContaining("step=2"),
      expect.objectContaining({ preventScrollReset: true }),
    );
  });

  it("shows a loading overlay while the next step is resolving", () => {
    navigationState = {
      state: "loading",
      location: { pathname: "/app/onboarding", search: "?step=2" },
    };

    render(<OnboardingPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando el paso 2");
    expect(screen.getByText(/Cargando el siguiente paso del onboarding/i)).toBeInTheDocument();
  });

  it("renders step 2 body with mission and capability choices", () => {
    loaderData = makeLoaderData({ step: 2 });
    locationState = { pathname: "/app/onboarding", search: "?step=2" };

    render(<OnboardingPage />);

    expect(screen.getByText("¿Cuál es su misión?")).toBeInTheDocument();
    expect(screen.getByText("Vender productos")).toBeInTheDocument();
    expect(screen.getByText("Resolver dudas")).toBeInTheDocument();
    expect(screen.getByText("¿Qué superpoderes tendrá tu bot?")).toBeInTheDocument();
    expect(screen.getByText("Responder sobre productos")).toBeInTheDocument();
    expect(screen.getByText("Capturar leads")).toBeInTheDocument();
  });

  it("renders step 3 branding choices and color presets", () => {
    loaderData = makeLoaderData({ step: 3 });
    locationState = { pathname: "/app/onboarding", search: "?step=3" };

    render(<OnboardingPage />);

    expect(screen.getByText("Color principal")).toBeInTheDocument();
    expect(screen.getByText("Avatar")).toBeInTheDocument();
    expect(screen.getByText("Posición del launcher")).toBeInTheDocument();
    expect(screen.getByText("Inferior derecha")).toBeInTheDocument();
    expect(screen.getByText("Inferior izquierda")).toBeInTheDocument();
    expect(screen.getByLabelText("Usar color #008060")).toBeInTheDocument();
  });

  it("renders step 4 review and activation summary", () => {
    loaderData = makeLoaderData({ step: 4 });
    locationState = { pathname: "/app/onboarding", search: "?step=4" };

    render(<OnboardingPage />);

    expect(screen.getAllByText("Identidad").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Cerebro").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Momento Aha")).toBeInTheDocument();
    expect(screen.getByText("Registro de tienda al activar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activar asistente" })).toBeInTheDocument();
  });

  it("shows the activated progress animation while submitting on step 4", () => {
    loaderData = makeLoaderData({ step: 4 });
    locationState = { pathname: "/app/onboarding", search: "?step=4" };
    navigationState = { state: "submitting", location: null };

    render(<OnboardingPage />);

    expect(screen.getByText("Registrando tienda en backend IA...")).toBeInTheDocument();
  });

  it("renders summary section cards when onboarding is completed", () => {
    loaderData = makeLoaderData({
      config: makeConfig({ onboardingCompleted: true, onboardingStep: 4 }),
    });

    render(<OnboardingPage />);

    expect(screen.getByText("Fase 01")).toBeInTheDocument();
    expect(screen.getByText("Fase 04")).toBeInTheDocument();
  });

  it("renders success and error banners from action data", () => {
    actionData = { ok: true, message: "Progreso guardado" };
    const { rerender } = render(<OnboardingPage />);
    expect(screen.getByText("Progreso guardado")).toBeInTheDocument();

    actionData = { ok: false, error: "Algo salió mal" };
    rerender(<OnboardingPage />);
    expect(screen.getByText("Algo salió mal")).toBeInTheDocument();
  });

  it("renders the full preview with product cards and quick replies", () => {
    loaderData = makeLoaderData({ step: 2 });
    locationState = { pathname: "/app/onboarding", search: "?step=2" };

    render(<OnboardingPage />);

    expect(screen.getByText("Vista previa")).toBeInTheDocument();
    expect(screen.getByText("Flux Shell Lite")).toBeInTheDocument();
    expect(screen.getByText("EUR 79")).toBeInTheDocument();
    expect(screen.getByText("Anadir al carrito")).toBeInTheDocument();
  });

  it("omits product cards when product answers are disabled", () => {
    loaderData = makeLoaderData({
      step: 2,
      config: makeConfig({
        enabledCapabilities: { ...makeConfig().enabledCapabilities, answerProducts: false },
      }),
    });
    locationState = { pathname: "/app/onboarding", search: "?step=2" };

    render(<OnboardingPage />);

    expect(screen.queryByText("Flux Shell Lite")).not.toBeInTheDocument();
  });

  it("renders English copy when the admin language is English", () => {
    loaderData = makeLoaderData({
      config: makeConfig({ adminLanguage: "en", botName: "Fluxy" }),
      copy: makeCopy({
        title: "Activate Fluxbot in 4 steps",
        next: "Continue",
        complete: "Activate Fluxbot in my store",
      }),
    });

    render(<OnboardingPage />);

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByText("Activate Fluxbot in 4 steps")).toBeInTheDocument();
  });

  it("renders a bottom-left launcher and spark avatar on step 3", () => {
    loaderData = makeLoaderData({
      step: 3,
      config: makeConfig({
        widgetBranding: {
          ...makeConfig().widgetBranding,
          launcherPosition: "bottom-left",
          avatarStyle: "spark",
        },
      }),
    });
    locationState = { pathname: "/app/onboarding", search: "?step=3" };

    render(<OnboardingPage />);

    expect(screen.getByText(/listo en inferior izquierda/)).toBeInTheDocument();
  });

  it("renders the ErrorBoundary for route errors", () => {
    render(<ErrorBoundary />);

    expect(screen.getByText("Onboarding unavailable")).toBeInTheDocument();
    expect(screen.getByText("Onboarding could not load (500)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to app" })).toHaveAttribute("href", "/app?step=1");
  });
});
