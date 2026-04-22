import { authenticate } from "../shopify.server";
import { AnalyticsService } from "../services/analytics.server.js";

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    // Keep strict topic checks to avoid accidental writes from misrouted webhooks.
    if (topic !== "ORDERS_CANCELLED") {
      return new Response(null, { status: 200 });
    }

    setTimeout(() => {
      AnalyticsService.processOrderCancelled(shop, payload).catch((error) => {
        console.error(`Failed cancel attribution for ${shop}`, error);
      });
    }, 0);

    return new Response(null, { status: 202 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(null, { status: 200 });
  }
};

