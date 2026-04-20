import { authenticate } from "../shopify.server";
import { handleProductDeleted } from "../utils/webhooks.server";
import { syncBundlesToShopify } from "../utils/bundleSync.js";

export const action = async ({ request }) => {
  const { admin, payload, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Defer DB update work and acknowledge webhook quickly.
  setTimeout(() => {
    handleProductDeleted({ shop, payload })
      .then(async ({ updatedBundles }) => {
        if (updatedBundles > 0) {
          console.log(`Marked ${updatedBundles} bundle(s) inactive for ${shop} after product delete`);

          if (admin) {
            await syncBundlesToShopify(admin, shop);
          }
        }
      })
      .catch((error) => {
        console.error(`Failed product-delete webhook processing for ${shop}`, error);
      });
  }, 0);

  return new Response(null, { status: 202 });
};
