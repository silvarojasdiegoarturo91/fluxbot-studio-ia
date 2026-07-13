# Shopify Admin chat context and human-tone requirements

## Objective

Ensure the Shopify Admin chat flow always sends the shopper's current question as the primary IA input, enriched with store context, widget context, and available conversation history, so the assistant answers like a human service agent instead of repeating catalog fragments.

## Traceability

- Shopify Admin: `REQ-IA-SHOPIFY-010`
- Related: `REQ-IA-SHOPIFY-008`, `REQ-IA-SHOPIFY-009`, `REQ-IA-AI-001`

## Functional requirements

- **FR-ACH-001:** The chat proxy MUST preserve the shopper's exact current question and send it as the primary user message to IA.
- **FR-ACH-002:** The chat request MUST attach canonical store context when available, including shop identity, widget configuration, relevant catalog snapshot, and assistant configuration.
- **FR-ACH-003:** The chat request MUST include the current conversation history and, when available, prior-session summaries or recent prior conversations as context only.
- **FR-ACH-004:** Product fallback results MUST be treated as supporting context, not as an automatic replacement for the assistant response.
- **FR-ACH-005:** The assistant response MUST remain human, service-oriented, and question-first; product recommendations are allowed only when relevant to the shopper's message.
- **FR-ACH-006:** The system MUST log the shop ID, conversation ID, current question, context sources, and trace ID for diagnostics when composing the IA request.
- **FR-ACH-007:** If no prior conversation history exists, the request MUST still be valid and the assistant MUST answer with the available store context only.

## Acceptance criteria

1. Given a shopper says "hola", when the proxy forwards the message, then the AI receives that exact text as the primary user input and responds with a natural service greeting, not a product list.
2. Given a shopper asks "tienen algo de invierno?", when context includes catalog and store settings, then the AI can mention relevant products without losing the original question.
3. Given a shopper asks about shipping or returns, when the conversation has prior messages, then the AI receives the previous turns as context and answers the current question first.
4. Given the shop has previous sessions available, when the request is built, then those sessions are included as contextual memory only and never overwrite the current question.
5. Given product fallback data exists, when the assistant responds to a non-product question, then the response remains human and conversational and does not become a generic catalog dump.
6. Given no history is available, when the request is built, then the chat still succeeds with shop and widget context only.
