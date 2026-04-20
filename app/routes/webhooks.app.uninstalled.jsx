import { authenticate } from "../shopify.server";
import { handleAppUninstalled } from "../utils/webhooks.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Defer heavy cleanup to avoid blocking Shopify webhook delivery retries.
  setTimeout(() => {
    handleAppUninstalled(shop).catch((error) => {
      console.error(`Failed cleanup for ${shop} after uninstall`, error);
    });
  }, 0);

  return new Response(null, { status: 202 });
};
