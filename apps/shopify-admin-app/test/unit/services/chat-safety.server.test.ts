import { describe, expect, it } from "vitest";
import {
  safeFallbackMessage,
  sanitizeAssistantMessage,
  safeGreetingMessage,
  safeClarificationMessage,
} from "../../../app/services/chat-safety.server";

describe("chat-safety.server", () => {
  it("keeps the model response unless it matches a blocked legacy opener", () => {
    expect(sanitizeAssistantMessage("Hola, te ayudo con lo que necesites.")).toBe(
      "Hola, te ayudo con lo que necesites.",
    );
    expect(
      sanitizeAssistantMessage("Hola 👋 Estoy aquí para ayudarte. ¿Qué necesitas?"),
    ).toBe(safeClarificationMessage());
  });

  it("returns a neutral clarification for empty assistant output", () => {
    expect(sanitizeAssistantMessage("   ")).toBe(safeClarificationMessage());
  });

  it("uses a human support opener instead of the old greeting fallback", () => {
    expect(safeGreetingMessage()).toBe("Claro, dime en qué te ayudo.");
    expect(safeFallbackMessage("greeting")).toBe("Claro, dime en qué te ayudo.");
  });
});
