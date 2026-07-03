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
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks de dependencias externas ──────────────────────────────────────────

const mockLoaderData = { current: null as unknown };

vi.mock("react-router", () => ({
  Form: ({ children }: { children: React.ReactNode }) =>
    React.createElement("form", {}, children),
  useActionData: () => null,
  useLoaderData: () => mockLoaderData.current ?? loaderData,
  useLocation: () => ({ search: "" }),
  useNavigate: () => vi.fn(),
  useNavigation: () => ({ state: "idle" }),
  useSubmit: () => vi.fn(),
  // useMatches es usado por useAdminLanguage — busca data.adminLanguage directamente
  useMatches: () => [{ id: "root", data: { adminLanguage: "es" } }],
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
    Banner: wrap("div"),
    FormLayout: wrap("div"),
    TextField: ({ label }: { label: string }) =>
      React.createElement("label", {}, label),
    Select: ({ label }: { label: string }) =>
      React.createElement("label", {}, label),
    Checkbox: ({ label, onChange }: { label?: string; onChange?: () => void }) =>
      React.createElement("input", { type: "checkbox", "aria-label": label, onChange }),
    Popover: ({ activator, children, active }: { activator: React.ReactNode; children: React.ReactNode; active: boolean }) =>
      React.createElement("div", {}, activator, active ? children : null),
    ActionList: ({ items }: { items: Array<{ content: string; onAction: () => void }> }) =>
      React.createElement(
        "ul",
        {},
        (items || []).map((item) =>
          React.createElement("li", { key: item.content }, item.content),
        ),
      ),
    Modal: Object.assign(
      ({
        children,
        open,
        title,
      }: {
        children: React.ReactNode;
        open: boolean;
        title: string;
        onClose?: () => void;
        primaryAction?: unknown;
        secondaryActions?: unknown;
      }) =>
        open
          ? React.createElement("div", { role: "dialog", "aria-label": title }, children)
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
    AdminPageHeader: ({ title }: { title: string }) =>
      React.createElement("h1", {}, title),
    AdminSectionCard: ({
      title,
      children,
    }: {
      title: string;
      children: React.ReactNode;
    }) => React.createElement("section", { "data-title": title }, React.createElement("h2", {}, title), children),
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

const loaderData = {
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
  ],
  syncJobs: [],
  runningSyncJobs: 0,
  failedSyncJobs: 0,
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
};

// ── Importar componente bajo test ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DataSourcesPage: React.ComponentType<any>;

beforeEach(async () => {
  vi.clearAllMocks();
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
    // "Preguntas frecuentes" solo existe en la tabla de productos — selector único
    expect(screen.getByRole("columnheader", { name: /preguntas frecuentes/i })).toBeInTheDocument();
    // "Producto" puede aparecer en esa misma tabla
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
    // Camiseta Azul tiene faqCount: 1 → la tabla muestra "1"
    // Buscamos en las celdas de la tabla
    const cells = screen.getAllByRole("cell");
    const faqCells = cells.filter((cell) => cell.textContent === "1");
    expect(faqCells.length).toBeGreaterThanOrEqual(1);
  });

  it("muestra los botones de acción (3 dots) para cada producto", () => {
    render(React.createElement(DataSourcesPage));
    // accessibilityLabel del botón Popover activator
    const actionButtons = screen.getAllByRole("button", {
      name: /abrir acciones del producto|open product actions/i,
    });
    expect(actionButtons.length).toBeGreaterThanOrEqual(2); // uno por producto
  });

  it("muestra las estadísticas de la sección superior", () => {
    render(React.createElement(DataSourcesPage));
    expect(screen.getByText(/productos proyectados/i)).toBeInTheDocument();
    expect(screen.getByText(/fuentes activas/i)).toBeInTheDocument();
  });

  it("no renderiza la tabla cuando no hay productos", () => {
    mockLoaderData.current = { ...loaderData, productRows: [] };
    render(React.createElement(DataSourcesPage));
    // Sin productos no debe haber tabla de productos
    expect(screen.queryByRole("columnheader", { name: /producto/i })).not.toBeInTheDocument();
    mockLoaderData.current = null;
  });
});
