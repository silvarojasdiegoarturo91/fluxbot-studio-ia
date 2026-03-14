/**
 * App Proxy alias route.
 *
 * Shopify app proxy forwards /apps/fluxbot/events to /events.
 * Re-export the proxy handler so storefront calls don't hit a 404.
 */

export { action, loader } from "./apps.fluxbot.events";
