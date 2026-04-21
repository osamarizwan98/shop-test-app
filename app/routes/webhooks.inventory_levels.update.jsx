import { authenticate } from "../shopify.server";
import { enqueueBundleAvailabilityJob } from "../services/bundleAvailabilityQueue.server.js";
import { normalizeGid } from "../services/bundleAvailability.server.js";

export const action = async ({ request }) => {
  const { admin, payload, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  enqueueBundleAvailabilityJob({
    admin,
    shop,
    fullSync: !payload?.inventory_item_id,
    inventoryItemIds: payload?.inventory_item_id
      ? [normalizeGid(payload.inventory_item_id, "InventoryItem")]
      : [],
  });

  return new Response(null, { status: 202 });
};
