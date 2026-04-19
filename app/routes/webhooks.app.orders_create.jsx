import { authenticate } from "../shopify.server";
// import { AnalyticsService } from "../services/analytics.server.js";

export const action = async ({ request }) => {
  try {
    const { topic, shop } = await authenticate.webhook(request);

    if (topic !== "ORDERS_CREATE") {
      return { error: "Invalid topic" };
    }

    // Process analytics asynchronously to avoid blocking webhook response
    // Use setTimeout instead of setImmediate for better compatibility
    setTimeout(() => {
      console.log(`Processing analytics for shop ${shop}`);
    }, 0);

    return { success: true };
  } catch (error) {
    console.error("Webhook error:", error);
    return { error: "Webhook processing failed" };
  }
};