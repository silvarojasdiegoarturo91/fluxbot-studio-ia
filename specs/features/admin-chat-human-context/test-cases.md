# Shopify Admin chat context and human-tone test cases

1. [happy-path] Given the shopper says "Hola", when the chat request is built, then the current question is sent first and the assistant returns a human greeting with no catalog list.
2. [product-question] Given the shopper asks for winter products, when catalog and shop context are available, then the assistant may recommend products while still answering the question in a conversational way.
3. [history] Given an active conversation with previous turns, when a new shopper message arrives, then the request includes current and prior messages and the assistant answers the new question first.
4. [previous-sessions] Given previous session summaries exist, when the request is built, then those summaries are passed as context only and do not replace the current message.
5. [fallback-context] Given proxy fallback products are available but the shopper asked about shipping, when the assistant responds, then the response stays about shipping and the fallback products remain contextual metadata.
6. [no-history] Given no prior conversation exists, when the shopper sends the first message, then the request remains valid and the assistant responds using store and widget context only.
