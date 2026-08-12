/**
 * Component render tests for app.data-sources.tsx
 *
 * PROPÓSITO: Verificar que el componente React REALMENTE renderiza lo que debe verse.
 * Esto captura lo que las 3 capas de QA no capturan:
 *  - El build pasa pero la sección no se renderiza (condicional malo)
 *  - Las columnas de la tabla están en el código pero con texto distinto
 *  - Un elemento clave devuelve null por un bug silencioso
 *
 * Corre en jsdom (sin navegador real, sin Shopify), renderizando el componente
 * con datos de prueba fijos y afirmando que el DOM contiene lo esperado.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks de dependencias externas ──────────────────────────────────────────

const mockLoaderData = { current: null as unknown };
let mockActionData: any = null;
let mockNavigation: { state: "idle" | "submitting" | "loading" } = { state: "idle" };
let mockAdminLanguage: string = "es";
let mockSubmit: any;

vi.mock("react-router", () => ({
  Form: ({ children }: { children: React.ReactNode }) =>
    React.createElement("form", {}, children),
  useActionData: () => mockActionData,
  useLoaderData: () => mockLoaderData.current ?? loaderData,
  useLocation: () => ({ search: "" }),
  useNavigate: () => vi.fn(),
  useNavigation: () => mockNavigation,
  useSubmit: () => mockSubmit ?? vi.fn(),
  // useMatches es usado por useAdminLanguage — busca data.adminLanguage directamente
  useMatches: () => [{ id: "root", data: { adminLanguage: mockAdminLanguage } }],
}));

vi.mock("@shopify/app-bridge-react", () => ({
  useAppBridge: () => ({}),
}));

vi.mock("../../app/shopify.server", () => ({
  authenticate: { admin: vi.fn() },
}));

vi.mock("../../app/jobs/sync-worker.server", () => ({
  processPendingSyncJobsForShop: vi.fn().mockResolvedValue({ processed: 0, failed: 0, jobs: [] }),
}));

// Polaris mock mínimo — renderiza HTML plano para poder afirmar sobre el DOM
vi.mock("@shopify/polaris", () => {
  const React = require("react");
  const wrap =
    (tag = "div") =>
    ({ children, ...props }: React.HTMLAttributes<HTMLElement>) =>
      React.createElement(tag, props, children);

  const Layout = Object.assign(wrap("div"), { Section: wrap("section") });
  const List = Object.assign(wrap("ul"), { Item: wrap("li") });

  return {
    Page: wrap("div"),
    Layout,
    Card: wrap("div"),
    BlockStack: wrap("div"),
    InlineStack: wrap("div"),
    InlineGrid: wrap("div"),
    Text: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", {}, children),
    Button: ({
      children,
      onClick,
      accessibilityLabel,
      submit,
      loading,
      tone,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      accessibilityLabel?: string;
      submit?: boolean;
      loading?: boolean;
      tone?: string;
    }) =>
      React.createElement(
        "button",
        {
          onClick,
          "aria-label": accessibilityLabel,
          type: submit ? "submit" : "button",
          disabled: loading,
          "data-tone": tone,
        },
        children,
      ),
    Badge: wrap("span"),
    Banner: ({ title }: { title?: string }) => React.createElement("div", null, title),
    FormLayout: wrap("div"),
    TextField: ({ label }: { label: string }) =>
      React.createElement("label", {}, label),
    Select: ({ label }: { label: string }) =>
      React.createElement("label", {}, label),
    Checkbox: ({ label, onChange }: { label?: string; onChange?: () => void }) =>
      React.createElement("input", { type: "checkbox", "aria-label": label, onChange }),
    Popover: ({ activator, children, active }: { activator: React.ReactNode; children: React.ReactNode; active: boolean }) =>
      React.createElement("div", {}, activator, active ? children : null),
    ActionList: ({ items }: { items: Array<{ content: string; onAction: () => void; disabled?: boolean }> }) =>
      React.createElement(
        "ul",
        {},
        (items || []).map((item) =>
          React.createElement(
            "li",
            { key: item.content },
            React.createElement("button", { onClick: item.onAction, disabled: item.disabled }, item.content),
          ),
        ),
      ),
    Modal: Object.assign(
      ({
        children,
        open,
        title,
        primaryAction,
      }: {
        children: React.ReactNode;
        open: boolean;
        title: string;
        onClose?: () => void;
        primaryAction?: { content: string; onAction: () => void; disabled?: boolean; loading?: boolean };
        secondaryActions?: unknown;
      }) =>
        open
          ? React.createElement(
              "div",
              { role: "dialog", "aria-label": title },
              children,
              primaryAction
                ? React.createElement(
                    "button",
                    { onClick: primaryAction.onAction, disabled: primaryAction.disabled },
                    primaryAction.content,
                  )
                : null,
            )
          : null,
      { Section: wrap("div") },
    ),
    DataTable: ({
      headings,
      rows,
    }: {
      headings: string[];
      rows: unknown[][];
    }) =>
      React.createElement(
        "table",
        {},
        React.createElement(
          "thead",
          {},
          React.createElement(
            "tr",
            {},
            headings.map((h: string) =>
              React.createElement("th", { key: h }, h),
            ),
          ),
        ),
        React.createElement(
          "tbody",
          {},
          (rows || []).map((row: unknown[], i: number) =>
            React.createElement(
              "tr",
              { key: i },
              (row as React.ReactNode[]).map((cell, j) =>
                React.createElement("td", { key: j }, cell),
              ),
            ),
          ),
        ),
      ),
    List,
    Spinner: () => React.createElement("div", { "aria-label": "loading" }),
    SkeletonBodyText: () => React.createElement("div", { "aria-label": "skeleton" }),
    EmptyState: ({ heading }: { heading: string }) =>
      React.createElement("div", {}, heading),
    Divider: () => React.createElement("hr"),
    Icon: () => React.createElement("span"),
  };
});

vi.mock("../../app/components/admin-ui", () => {
  const React = require("react");
  return {
    AdminPageHeader: ({ title, badge }: { title: string; badge?: React.ReactNode }) =>
      React.createElement("header", null, React.createElement("h1", null, title), badge),
    AdminSectionCard: ({
      title,
      children,
    }: {
      title: string;
      children: React.ReactNode;
    }) => React.createElement("section", { "data-title": title }, React.createElement("h2", null, title), children),
    AdminStatCard: ({ label, value }: { label: string; value: unknown }) =>
      React.createElement(
        "div",
        { "data-stat": label },
        `${label}: ${value}`,
      ),
    AdminStatusBadge: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", {}, children),
  };
});

// ── Datos de prueba que simulan lo que devuelve el loader ─────────────────────

function baseLoaderData(overrides: Record<string, unknown> = {}) {
  return {
    shop: { id: "shop-1", name: "Test Shop" },
    sources: [
      {
        id: "src-1",
        name: "Catálogo principal",
        sourceType: "catalog",
        isActive: true,
        url: null,
        lastSyncedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _count: { documents: 42 },
      },
      {
        id: "src-2",
        name: "Políticas",
        sourceType: "policies",
        isActive: false,
        url: null,
        lastSyncedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _count: { documents: 5 },
      },
    ],
    syncJobs: [
      {
        id: "job-1",
        jobType: "initial:catalog",
        status: "COMPLETED",
        progress: 1,
        processedItems: 100,
        totalItems: 100,
        errorMessage: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        startedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        completedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
      {
        id: "job-2",
        jobType: "delta:products",
        status: "FAILED",
        progress: 0.5,
        processedItems: 3,
        totalItems: 10,
        errorMessage: "GraphQL error",
        createdAt: new Date("2026-01-02T00:00:00.000Z").toISOString(),
        startedAt: null,
        completedAt: null,
      },
      {
        id: "job-3",
        jobType: "delta:policies",
        status: "RUNNING",
        progress: 0.25,
        processedItems: 2,
        totalItems: 8,
        errorMessage: null,
        createdAt: new Date("2026-01-03T00:00:00.000Z").toISOString(),
        startedAt: null,
        completedAt: null,
      },
    ],
    runningSyncJobs: 1,
    failedSyncJobs: 1,
    projections: {
      productsProjected: 5,
      policiesProjected: 1,
      ordersProjected: 0,
    },
    // ← Lo más crítico: la sección de gestión de productos
    productRows: [
      {
        id: "prod-proj-1",
        productId: "gid://shopify/Product/111",
        title: "Camiseta Azul",
        handle: "camiseta-azul",
        collections: ["Ropa", "Verano"],
        tags: ["algodón"],
        disabled: false,
        faqCount: 1,
      },
      {
        id: "prod-proj-2",
        productId: "gid://shopify/Product/222",
        title: "Pantalón Negro",
        handle: "pantalon-negro",
        collections: [],
        tags: [],
        disabled: true,
        faqCount: 0,
      },
    ],
    ...overrides,
  };
}

const loaderData = baseLoaderData();

// ── Importar componente bajo test ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DataSourcesPage: React.ComponentType<any>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockActionData = null;
  mockNavigation = { state: "idle" };
  mockAdminLanguage = "es";
  mockLoaderData.current = null;
  const mod = await import("../../app/routes/app.data-sources");
  DataSourcesPage = mod.default;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DataSources — renderizado de componente", () => {
  it("renderiza el heading de la página", () => {
    render(React.createElement(DataSourcesPage));
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("muestra la sección 'Productos aprendidos'", () => {
    render(React.createElement(DataSourcesPage));
    expect(
      screen.getByText(/productos aprendidos/i),
    ).toBeInTheDocument();
  });

  it("la tabla de productos tiene las columnas correctas", () => {
    render(React.createElement(DataSourcesPage));
    expect(screen.getByRole("columnheader", { name: /preguntas frecuentes/i })).toBeInTheDocument();
    const productHeaders = screen.getAllByRole("columnheader", { name: /^producto$/i });
    expect(productHeaders.length).toBeGreaterThanOrEqual(1);
  });

  it("muestra los productos del loader en la tabla", () => {
    render(React.createElement(DataSourcesPage));
    expect(screen.getByText("Camiseta Azul")).toBeInTheDocument();
    expect(screen.getByText("Pantalón Negro")).toBeInTheDocument();
  });

  it("muestra el contador de FAQs por producto", () => {
    render(React.createElement(DataSourcesPage));
    const cells = screen.getAllByRole("cell");
    const faqCells = cells.filter((cell) => cell.textContent === "1");
    expect(faqCells.length).toBeGreaterThanOrEqual(1);
  });

  it("muestra los botones de acción (3 dots) para cada producto", () => {
    render(React.createElement(DataSourcesPage));
    const actionButtons = screen.getAllByRole("button", {
      name: /abrir acciones del producto|open product actions/i,
    });
    expect(actionButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("muestra las estadísticas de la sección superior", () => {
    render(React.createElement(DataSourcesPage));
    expect(screen.getByText(/productos proyectados/i)).toBeInTheDocument();
    expect(screen.getByText(/fuentes activas/i)).toBeInTheDocument();
  });

  it("no renderiza la tabla cuando no hay productos", () => {
    mockLoaderData.current = { ...loaderData, productRows: [] };
    render(React.createElement(DataSourcesPage));
    expect(screen.queryByRole("columnheader", { name: /producto/i })).not.toBeInTheDocument();
    mockLoaderData.current = null;
  });

  it("muestra el estado de sync fallido en la cabecera y en las estadísticas", () => {
    render(React.createElement(DataSourcesPage));
    expect(screen.getByText("1 fallos")).toBeInTheDocument();
    expect(screen.getByText(/sync jobs fallidos/i)).toBeInTheDocument();
  });

  it("renderiza las fuentes configuradas con sus estados", () => {
    render(React.createElement(DataSourcesPage));
    expect(screen.getByText("Catálogo principal")).toBeInTheDocument();
    expect(screen.getByText("Políticas")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("Pausada")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renderiza la tabla de sync jobs con estados y reproceso", () => {
    render(React.createElement(DataSourcesPage));
    expect(screen.getByText("initial:catalog")).toBeInTheDocument();
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    expect(screen.getByText("FAILED")).toBeInTheDocument();
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByText("GraphQL error")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Reprocesar" }).length).toBeGreaterThanOrEqual(2);
  });

  it("muestra empty states cuando no hay fuentes ni sync jobs", () => {
    mockLoaderData.current = { ...loaderData, sources: [], syncJobs: [] };
    render(React.createElement(DataSourcesPage));
    expect(screen.getByText("No hay fuentes configuradas")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay sync jobs")).toBeInTheDocument();
    mockLoaderData.current = null;
  });

  it("muestra el banner de éxito del action", () => {
    mockActionData = { ok: true, message: "Fuente de datos creada." };
    render(React.createElement(DataSourcesPage));
    expect(screen.getByText("Fuente de datos creada.")).toBeInTheDocument();
  });

  it("muestra el banner de error del action", () => {
    mockActionData = { ok: false, error: "Tipo de fuente invalido" };
    render(React.createElement(DataSourcesPage));
    expect(screen.getByText("Tipo de fuente invalido")).toBeInTheDocument();
  });

  it("abre el modal de FAQ al pulsar la acción del producto", () => {
    render(React.createElement(DataSourcesPage));
    fireEvent.click(screen.getAllByRole("button", { name: /abrir acciones del producto/i })[0]);
    fireEvent.click(screen.getByText("Agregar preguntas frecuentes"));
    expect(screen.getByRole("dialog", { name: /Agregar preguntas frecuentes del producto/i })).toBeInTheDocument();
    expect(screen.getAllByText("Camiseta Azul").length).toBeGreaterThanOrEqual(1);
  });

  it("abre el modal de deshabilitar producto al pulsar la acción", () => {
    render(React.createElement(DataSourcesPage));
    fireEvent.click(screen.getAllByRole("button", { name: /abrir acciones del producto/i })[0]);
    fireEvent.click(screen.getAllByText("Disable")[0]);
    expect(screen.getByRole("dialog", { name: /Deshabilitar producto aprendido/i })).toBeInTheDocument();
    expect(screen.getByText(/¿Seguro que quieres deshabilitar/)).toBeInTheDocument();
  });

  it("renderiza en inglés cuando el idioma del admin es en", () => {
    mockAdminLanguage = "en";
    render(React.createElement(DataSourcesPage));
    expect(screen.getByText("Data sources")).toBeInTheDocument();
    expect(screen.getByText("Learned products")).toBeInTheDocument();
    expect(screen.getByText("1 failures")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Reprocess" }).length).toBeGreaterThanOrEqual(2);
  });

  it("muestra botones de habilitar/deshabilitar por fuente", () => {
    render(React.createElement(DataSourcesPage));
    expect(screen.getByRole("button", { name: "Desactivar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activar" })).toBeInTheDocument();
  });

  it("deshabilita el modal de producto cuando se confirma", () => {
    mockSubmit = vi.fn();
    render(React.createElement(DataSourcesPage));
    fireEvent.click(screen.getAllByRole("button", { name: /abrir acciones del producto/i })[0]);
    fireEvent.click(screen.getAllByText("Disable")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.any(FormData),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
