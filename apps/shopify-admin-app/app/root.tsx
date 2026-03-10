import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { type LoaderFunctionArgs } from "react-router";
import { startProactiveJobScheduler } from "./jobs/scheduler.server";
import "@shopify/polaris/build/esm/styles.css";

/**
 * Initialize server-side jobs on app startup
 */
export async function loader(_: LoaderFunctionArgs) {
  // Initialize proactive messaging scheduler only once
  startProactiveJobScheduler();

  return null;
}

export default function App() {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
