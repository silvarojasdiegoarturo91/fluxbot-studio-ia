import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useLoaderData: vi.fn(),
    useLocation: vi.fn(),
    useRouteError: vi.fn(),
    Outlet: () => <div data-testid="outlet" />,
  };
});

vi.mock("@shopify/shopify-app-react-router/server", () => ({
  boundary: {
    error: vi.fn((error) => ({ error })),
    headers: vi.fn((args) => args),
  },
}));

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

vi.mock("@shopify/shopify-app-react-router/react", () => ({
  AppProvider: ({ children }: { children: any }) => (
    <div data-testid="embedded-provider">{children}</div>
  ),
}));

vi.mock("@shopify/polaris", async () => {
  const actual = await vi.importActual<typeof import("@shopify/polaris")>("@shopify/polaris");
  return {
    ...actual,
    AppProvider: ({ children }: { children: any }) => (
      <div data-testid="polaris-provider">{children}</div>
    ),
  };
});

vi.mock("@shopify/app-bridge-react", () => ({
  NavMenu: ({ children }: { children: any }) => (
    <nav data-testid="navmenu">{children}</nav>
  ),
}));

vi.mock("../../app/components/admin-shell", () => ({
  AdminShell: ({ children }: { children: any }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

import { headers, default as AppLayout, ErrorBoundary } from "../../app/routes/app";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLoaderData, useLocation, useRouteError } from "react-router";

const mockUseLoaderData = vi.mocked(useLoaderData);
const mockUseLocation = vi.mocked(useLocation);
const mockUseRouteError = vi.mocked(useRouteError);

describe("app shell render", () => {
  const routeError = new Error("boom");

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocation.mockReturnValue({ search: "?shop=example.myshopify.com" } as any);
    mockUseRouteError.mockReturnValue(routeError);
  });

  it("renders the embedded shell and navigation menu after hydration when onboarding is complete", async () => {
    mockUseLoaderData.mockReturnValue({
      apiKey: "test-api-key",
      adminLanguage: "en",
      storeDomain: "example.myshopify.com",
      onboardingCompleted: true,
      isE2ETestMode: false,
    } as any);

    render(<AppLayout />);

    await waitFor(() => expect(screen.getByTestId("embedded-provider")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("navmenu")).toBeInTheDocument());
    expect(screen.getByTestId("shell")).toBeInTheDocument();
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("does not render the nav menu when onboarding is incomplete", async () => {
    mockUseLoaderData.mockReturnValue({
      apiKey: "test-api-key",
      adminLanguage: "es",
      storeDomain: "example.myshopify.com",
      onboardingCompleted: false,
      isE2ETestMode: false,
    } as any);

    render(<AppLayout />);

    await waitFor(() => expect(screen.getByTestId("embedded-provider")).toBeInTheDocument());
    expect(screen.queryByTestId("navmenu")).toBeNull();
    expect(screen.getByTestId("shell")).toBeInTheDocument();
  });

  it("falls back to the E2E shell when test mode is enabled", async () => {
    mockUseLoaderData.mockReturnValue({
      apiKey: "test-api-key",
      adminLanguage: "en",
      storeDomain: "example.myshopify.com",
      onboardingCompleted: true,
      isE2ETestMode: true,
    } as any);

    render(<AppLayout />);

    await waitFor(() => expect(screen.getByTestId("polaris-provider")).toBeInTheDocument());
    expect(screen.queryByTestId("embedded-provider")).toBeNull();
    expect(screen.queryByTestId("navmenu")).toBeNull();
    expect(screen.getByTestId("shell")).toBeInTheDocument();
  });

  it("exposes the route error boundary and headers passthrough", () => {
    expect(ErrorBoundary()).toEqual({ error: routeError });

    const args = { loaderHeaders: new Headers(), parentHeaders: new Headers(), responseHeaders: new Headers() } as any;
    const response = headers(args);
    expect(response).toBe(args);
    expect(boundary.headers).toHaveBeenCalled();
  });
});
