import prisma from "../db.server.js";
import { syncBundlesToShopify } from "../utils/bundleSync.js";

const VARIANT_AVAILABILITY_QUERY = `#graphql
  query SmartBundleVariantAvailability($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        inventoryPolicy
        inventoryQuantity
        product {
          id
        }
        inventoryItem {
          id
          tracked
        }
      }
    }
  }
`;

const INVENTORY_ITEM_VARIANTS_QUERY = `#graphql
  query SmartBundleInventoryItemVariants($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on InventoryItem {
        id
        tracked
        variants(first: 25) {
          nodes {
            id
            product {
              id
            }
          }
        }
      }
    }
  }
`;

function chunk(array, size) {
  const chunks = [];

  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }

  return chunks;
}

function normalizeGid(value, type) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith(`gid://shopify/${type}/`)) {
      return trimmed;
    }

    if (/^\d+$/.test(trimmed)) {
      return `gid://shopify/${type}/${trimmed}`;
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `gid://shopify/${type}/${Math.trunc(value)}`;
  }

  return null;
}

function extractBundleItems(productIds) {
  if (!Array.isArray(productIds)) {
    return [];
  }

  return productIds
    .map((item) => {
      if (typeof item === "string") {
        return {
          productId: normalizeGid(item, "Product"),
          variantId: null,
        };
      }

      if (!item || typeof item !== "object") {
        return null;
      }

      return {
        productId: normalizeGid(item.id, "Product"),
        variantId:
          normalizeGid(item.variantId, "ProductVariant") ||
          normalizeGid(item.variant_id, "ProductVariant"),
      };
    })
    .filter(Boolean);
}

function bundleContainsReferences(bundle, referenceSets) {
  const bundleItems = extractBundleItems(bundle.productIds);

  return bundleItems.some((item) => (
    (item.productId && referenceSets.productIds.has(item.productId)) ||
    (item.variantId && referenceSets.variantIds.has(item.variantId))
  ));
}

function isVariantSellable(variant) {
  if (!variant) {
    return false;
  }

  if (!variant.inventoryItem?.tracked) {
    return true;
  }

  if (variant.inventoryPolicy === "CONTINUE") {
    return true;
  }

  return Number(variant.inventoryQuantity || 0) > 0;
}

async function runAdminGraphQL(admin, query, variables) {
  const response = await admin.graphql(query, { variables });
  const payload = await response.json();

  if (payload?.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload?.data ?? {};
}

export class BundleAvailabilityService {
  static async syncAffectedBundles({
    admin,
    shop,
    productIds = [],
    variantIds = [],
    inventoryItemIds = [],
  }) {
    const referenceSets = await this.buildReferenceSets({
      admin,
      productIds,
      variantIds,
      inventoryItemIds,
    });

    if (referenceSets.productIds.size === 0 && referenceSets.variantIds.size === 0) {
      return this.syncShopBundles({ admin, shop });
    }

    const candidateBundles = await prisma.bundle.findMany({
      where: {
        shop,
        OR: [
          { status: "active" },
          { inventoryHidden: true },
        ],
      },
      select: {
        id: true,
        shop: true,
        status: true,
        inventoryHidden: true,
        productIds: true,
      },
    });

    const affectedBundles = candidateBundles.filter((bundle) =>
      bundleContainsReferences(bundle, referenceSets),
    );

    if (affectedBundles.length === 0) {
      return { updatedBundles: 0, checkedBundles: 0 };
    }

    return this.applyAvailabilityUpdates({ admin, shop, bundles: affectedBundles });
  }

  static async syncShopBundles({ admin, shop }) {
    const bundles = await prisma.bundle.findMany({
      where: {
        shop,
        OR: [
          { status: "active" },
          { inventoryHidden: true },
        ],
      },
      select: {
        id: true,
        shop: true,
        status: true,
        inventoryHidden: true,
        productIds: true,
      },
    });

    if (bundles.length === 0) {
      return { updatedBundles: 0, checkedBundles: 0 };
    }

    return this.applyAvailabilityUpdates({ admin, shop, bundles });
  }

  static async applyAvailabilityUpdates({ admin, shop, bundles }) {
    const variantIds = Array.from(
      new Set(
        bundles.flatMap((bundle) =>
          extractBundleItems(bundle.productIds)
            .map((item) => item.variantId)
            .filter(Boolean),
        ),
      ),
    );

    const variantAvailabilityMap = await this.fetchVariantAvailabilityMap(admin, variantIds);
    const bundleUpdates = [];

    for (const bundle of bundles) {
      const isAvailable = this.isBundleAvailable(bundle, variantAvailabilityMap);

      if (isAvailable) {
        if (bundle.inventoryHidden) {
          bundleUpdates.push(
            prisma.bundle.update({
              where: { id: bundle.id },
              data: {
                status: "active",
                inventoryHidden: false,
              },
            }),
          );
        }

        continue;
      }

      if (bundle.status === "active") {
        bundleUpdates.push(
          prisma.bundle.update({
            where: { id: bundle.id },
            data: {
              status: "inactive",
              inventoryHidden: true,
            },
          }),
        );
      }
    }

    if (bundleUpdates.length === 0) {
      return { updatedBundles: 0, checkedBundles: bundles.length };
    }

    await prisma.$transaction(bundleUpdates);
    await syncBundlesToShopify(admin, shop);

    return {
      updatedBundles: bundleUpdates.length,
      checkedBundles: bundles.length,
    };
  }

  static isBundleAvailable(bundle, variantAvailabilityMap) {
    const bundleItems = extractBundleItems(bundle.productIds);

    if (bundleItems.length < 2) {
      return false;
    }

    return bundleItems.every((item) => {
      if (!item.variantId) {
        return false;
      }

      return isVariantSellable(variantAvailabilityMap.get(item.variantId));
    });
  }

  static async buildReferenceSets({
    admin,
    productIds = [],
    variantIds = [],
    inventoryItemIds = [],
  }) {
    const productIdSet = new Set(productIds.map((id) => normalizeGid(id, "Product")).filter(Boolean));
    const variantIdSet = new Set(variantIds.map((id) => normalizeGid(id, "ProductVariant")).filter(Boolean));
    const normalizedInventoryItemIds = inventoryItemIds
      .map((id) => normalizeGid(id, "InventoryItem"))
      .filter(Boolean);

    if (normalizedInventoryItemIds.length === 0) {
      return {
        productIds: productIdSet,
        variantIds: variantIdSet,
      };
    }

    for (const batch of chunk(normalizedInventoryItemIds, 50)) {
      const data = await runAdminGraphQL(admin, INVENTORY_ITEM_VARIANTS_QUERY, { ids: batch });
      const nodes = data?.nodes ?? [];

      for (const inventoryItem of nodes) {
        const variants = inventoryItem?.variants?.nodes ?? [];

        for (const variant of variants) {
          const normalizedVariantId = normalizeGid(variant?.id, "ProductVariant");
          const normalizedProductId = normalizeGid(variant?.product?.id, "Product");

          if (normalizedVariantId) {
            variantIdSet.add(normalizedVariantId);
          }

          if (normalizedProductId) {
            productIdSet.add(normalizedProductId);
          }
        }
      }
    }

    return {
      productIds: productIdSet,
      variantIds: variantIdSet,
    };
  }

  static async fetchVariantAvailabilityMap(admin, variantIds) {
    if (variantIds.length === 0) {
      return new Map();
    }

    const variantsById = new Map();

    for (const batch of chunk(variantIds, 50)) {
      const data = await runAdminGraphQL(admin, VARIANT_AVAILABILITY_QUERY, { ids: batch });
      const nodes = data?.nodes ?? [];

      for (const node of nodes) {
        const normalizedVariantId = normalizeGid(node?.id, "ProductVariant");
        if (normalizedVariantId) {
          variantsById.set(normalizedVariantId, node);
        }
      }
    }

    return variantsById;
  }
}

export { normalizeGid };
