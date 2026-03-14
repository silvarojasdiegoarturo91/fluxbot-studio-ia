/**
 * App Proxy alias route.
 * Shopify forwards /apps/fluxbot/messages/:sessionId to /messages/:sessionId.
 */
export { action, loader } from "./apps.fluxbot.messages.$sessionId";
