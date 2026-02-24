export async function callChatbotApi(message: string, settings: any) {
  const EXTERNAL_API_URL = process.env.CHATBOT_API_URL || "https://tu-api-de-chatbot.com/api";
  
  try {
    const response = await fetch(EXTERNAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.CHATBOT_API_KEY}`,
      },
      body: JSON.stringify({
        query: message,
        customization: settings,
      }),
    });

    if (!response.ok) {
      throw new Error("Error calling chatbot API");
    }

    return await response.json();
  } catch (error) {
    console.error("Chatbot API Error:", error);
    return { error: "Failed to connect to chatbot service" };
  }
}
