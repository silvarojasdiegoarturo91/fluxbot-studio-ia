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
let locationState = { pathname: "/app/privacy", search: "?days=30" };

function baseLoaderData(overrides: Record<string, unknown> = {}) {
  return {
    shop: { id: "shop-1", domain: "shop.example.myshopify.com" },
    days: 30,
    report: {
      shopId: "shop-1",
      generatedAt: new Date("2026-01-01T00:00:00.000Z"),
      period: { from: new Date(), to: new Date() },
      totalConsentEvents: 10,
      consentBreakdown: { consent_granted: 7, consent_revoked: 3 },
      dataExportRequests: 2,
      dataDeletionRequests: 1,
      deletedRecords: 0,
      auditLogEntries: 5,
      processingActivities: [],
    },
    residencyConfig: {
      shopId: "shop-1",
      region: "GLOBAL",
      enforced: true,
      enforcedCountries: ["DE", "FR"],
      updatedAt: new Date(),
    },
    breaches: [],
    processingActivities: [],
    activeSupportTokens: 3,
    deliveryStatus: {
      omnichannelBridge: { configured: true },
      integratedChannels: ["chat"],
      pendingChannels: [],
    },
    retentionPolicy: {
      shopId: "shop-1",
      conversationRetentionDays: 365,
      behaviorEventRetentionDays: 90,
      consentRecordRetentionDays: 365,
      auditLogRetentionDays: 730,
    },
    deploymentControl: {
      shopId: "shop-1",
      primaryRegion: "GLOBAL",
      failoverRegions: [],
      strictIsolation: false,
      piiRestrictedToPrimary: false,
    },
    legalHolds: [],
    activeLegalHolds: 0,
    scheduler: {
      isRunning: { retention: false },
      retention: {
        lastRunAt: null,
        runs: 3,
        conversationsDeleted: 2,
        eventsDeleted: 5,
      },
    },
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
  const List = Object.assign(wrap("ul"), { Item: wrap("li") });

  return {
    Page: ({ title, subtitle, children }: { title?: string; subtitle?: string; children?: React.ReactNode }) =>
      React.createElement(
        "div",
        null,
        title ? React.createElement("h1", null, title) : null,
        subtitle ? React.createElement("p", null, subtitle) : null,
        children,
      ),
    Layout,
    Card: wrap("div"),
    BlockStack: wrap("div"),
    Text: ({ as = "span", children }: { as?: string; children?: React.ReactNode }) =>
      React.createElement(as, null, children),
    Badge: wrap("span"),
    InlineGrid: wrap("div"),
    EmptyState: ({ heading }: { heading: string }) => React.createElement("div", null, heading),
    Button: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("button", { type: "submit" }, children),
    FormLayout: wrap("div"),
    TextField: ({ label }: { label?: string }) => React.createElement("label", null, label),
    Select: ({ label }: { label?: string }) => React.createElement("label", null, label),
    Banner: ({ title }: { title?: string }) => React.createElement("div", null, title),
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

import PrivacyPage from "../../app/routes/app.privacy";

describe("PrivacyPage component", () => {
  beforeEach(() => {
    mockUseIsSpanish.mockReturnValue(false);
    loaderData = baseLoaderData();
    actionData = undefined;
    navigationState = { state: "idle", formData: null };
    locationState = { pathname: "/app/privacy", search: "?days=30" };
  });

  it("renders the compliance header and stat cards in English", () => {
    render(<PrivacyPage />);

    expect(screen.getByText("Privacy & Compliance")).toBeInTheDocument();
    expect(screen.getByText("Consent Events (365d)")).toBeInTheDocument();
    expect(screen.getByText("Audit Log Entries")).toBeInTheDocument();
    expect(screen.getByText("Data Subject Requests")).toBeInTheDocument();
    expect(screen.getByText("Active Support Tokens")).toBeInTheDocument();
    expect(screen.getByText("Data Residency Controls")).toBeInTheDocument();
    expect(screen.getByText("Legal Hold Workflow")).toBeInTheDocument();
    expect(screen.getByText("SIEM Export Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Retention Automation")).toBeInTheDocument();
    expect(screen.getByText("Consent Breakdown")).toBeInTheDocument();
  });

  it("renders Spanish copy when the admin language is Spanish", () => {
    mockUseIsSpanish.mockReturnValue(true);
    loaderData = baseLoaderData();

    render(<PrivacyPage />);

    expect(screen.getByText("Privacidad y cumplimiento")).toBeInTheDocument();
    expect(screen.getByText("Controles de residencia de datos")).toBeInTheDocument();
    expect(screen.getByText("Flujo de bloqueo legal")).toBeInTheDocument();
    expect(screen.getByText("Pipeline de exportacion SIEM")).toBeInTheDocument();
    expect(screen.getByText("Automatización de retención")).toBeInTheDocument();
  });

  it("shows empty states when no legal holds, breaches, consent or activities exist", () => {
    loaderData = baseLoaderData({
      report: { ...baseLoaderData().report, consentBreakdown: {} },
    });

    render(<PrivacyPage />);

    expect(screen.getByText("No legal holds")).toBeInTheDocument();
    expect(screen.getByText("No consent events")).toBeInTheDocument();
    expect(screen.getByText("No processing activities")).toBeInTheDocument();
    expect(screen.getByText("No breaches registered")).toBeInTheDocument();
  });

  it("renders a data table when legal holds exist and exposes release actions", () => {
    loaderData = baseLoaderData({
      legalHolds: [
        {
          id: "hold-1",
          shopId: "shop-1",
          title: "Regulatory review",
          reason: "External audit",
          scope: ["ALL"],
          placedBy: "admin",
          placedAt: new Date("2026-01-01T00:00:00.000Z"),
          expiresAt: new Date("2026-12-31T00:00:00.000Z"),
        },
      ],
      activeLegalHolds: 1,
    });

    render(<PrivacyPage />);

    expect(screen.getByText("Regulatory review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release" })).toBeInTheDocument();
  });

  it("renders the active legal holds retention warning banner", () => {
    loaderData = baseLoaderData({ activeLegalHolds: 1 });

    render(<PrivacyPage />);

    expect(screen.getByText(/Retention exclusions are active/)).toBeInTheDocument();
  });

  it("renders consent, processing and breach rows from loader data", () => {
    loaderData = baseLoaderData({
      report: {
        ...baseLoaderData().report,
        totalConsentEvents: 10,
        consentBreakdown: { consent_granted: 7 },
      },
      breaches: [
        {
          id: "br-1",
          shopId: "shop-1",
          detectedAt: new Date("2026-01-01T00:00:00.000Z"),
          severity: "HIGH",
          description: "Leak",
          affectedDataSubjects: 12,
          mitigationTaken: "",
          dataCategories: [],
          reportedToAuthority: true,
          reportedAt72h: true,
        },
      ],
      processingActivities: [
        {
          id: "act-1",
          shopId: "shop-1",
          activityName: "Chat processing",
          purpose: "Support",
          legalBasis: "Contract",
          retentionDays: 365,
          dataCategories: [],
          dataSubjects: [],
          thirdParties: [],
          transferCountries: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    render(<PrivacyPage />);

    expect(screen.getByText("Chat processing")).toBeInTheDocument();
    expect(screen.getAllByText("HIGH").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("12").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("Met")).toBeInTheDocument();
  });

  it("renders the scheduler running state and last-run label", () => {
    loaderData = baseLoaderData({
      scheduler: {
        isRunning: { retention: true },
        retention: {
          lastRunAt: new Date("2026-01-02T00:00:00.000Z"),
          runs: 3,
          conversationsDeleted: 2,
          eventsDeleted: 5,
        },
      },
    });

    render(<PrivacyPage />);

    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByText(/Last run/)).toBeInTheDocument();
  });

  it("shows the SIEM export and dispatch tables from action data", () => {
    actionData = {
      ok: true,
      message: "SIEM export generated (12 events).",
      siemExport: {
        exportId: "export-1",
        generatedAt: "2026-01-02T00:00:00.000Z",
        windowDays: 30,
        eventCount: 12,
      },
      siemDispatch: {
        connectors: [
          { connector: "datadog", attempted: true, delivered: true, statusCode: 200, ingestedEvents: 12 },
          { connector: "splunk", attempted: true, delivered: false, statusCode: 503, error: "down" },
        ],
      },
    };

    render(<PrivacyPage />);

    expect(screen.getByText("export-1")).toBeInTheDocument();
    expect(screen.getByText("datadog")).toBeInTheDocument();
    expect(screen.getByText("splunk")).toBeInTheDocument();
    expect(screen.getByText("down")).toBeInTheDocument();
  });

  it("renders the success and error banners from action data", () => {
    actionData = { ok: true, message: "Retention policy updated." };
    const { rerender } = render(<PrivacyPage />);
    expect(screen.getByText("Retention policy updated.")).toBeInTheDocument();

    actionData = { ok: false, error: "Invalid region" };
    rerender(<PrivacyPage />);
    expect(screen.getByText("Invalid region")).toBeInTheDocument();
  });

  it("renders the delivery status omnichannel bridge row", () => {
    render(<PrivacyPage />);

    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.getByText("chat")).toBeInTheDocument();
  });
});
