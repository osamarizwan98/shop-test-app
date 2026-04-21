import { authenticate } from "../shopify.server";
import { enqueueBundleAvailabilityJob } from "../services/bundleAvailabilityQueue.server.js";
import { normalizeGid } from "../services/bundleAvailability.server.js";

function extractVariantIds(payload) {
  const variants = Array.isArray(payload?.variants) ? payload.variants : [];
  const variantGids = Array.isArray(payload?.variant_gids) ? payload.variant_gids : [];

  const idsFromVariants = variants
    .map((variant) => normalizeGid(variant?.admin_graphql_api_id || variant?.id, "ProductVariant"))
    .filter(Boolean);

  const idsFromVariantGids = variantGids
    .map((variant) => normalizeGid(variant?.admin_graphql_api_id || variant?.id, "ProductVariant"))
    .filter(Boolean);

  return Array.from(new Set([...idsFromVariants, ...idsFromVariantGids]));
}

export const action = async ({ request }) => {
  const { admin, payload, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const productId = normalizeGid(
    payload?.admin_graphql_api_id || payload?.id,
    "Product",
  );

  enqueueBundleAvailabilityJob({
    admin,
    shop,
    fullSync: !productId,
    productIds: productId ? [productId] : [],
    variantIds: extractVariantIds(payload),
  });

  return new Response(null, { status: 202 });
};
