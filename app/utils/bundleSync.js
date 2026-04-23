import prisma from '../db.server.js';
import { getDefaultBundleStyleConfig, sanitizeBundleStyleConfig } from './styleConfig.server.js';

/**
 * Utility functions for bundle synchronization and validation
 */

const CURRENT_APP_INSTALLATION_QUERY = `#graphql
  query CurrentAppInstallation {
    currentAppInstallation {
      id
    }
  }
`;

const METAFIELDS_SET_MUTATION = `#graphql
  mutation SetActiveBundlesMetafield($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Format active bundles payload for metafield storage
 * @param {Array} bundles - Array of bundle objects
 * @returns {Array} - Formatted payload
 */
export function formatActiveBundlesPayload(bundles) {
  return bundles.map((bundle) => {
    const rawProducts = Array.isArray(bundle.productIds) ? bundle.productIds : [];
    const products = rawProducts
      .map((product) => {
        if (typeof product === 'string') {
          return product;
        }

        if (typeof product?.id === 'string') {
          return {
            id: product.id,
            title: typeof product.title === 'string' ? product.title : '',
            handle: typeof product.handle === 'string' ? product.handle : '',
            variantId:
              typeof product.variantId === 'string'
                ? product.variantId
                : typeof product?.variants?.[0]?.id === 'string'
                  ? product.variants[0].id
                  : '',
            price:
              typeof product.price === 'string' || typeof product.price === 'number'
                ? product.price
                : typeof product?.variants?.[0]?.price === 'string' || typeof product?.variants?.[0]?.price === 'number'
                  ? product.variants[0].price
                  : '',
          };
        }

        return null;
      })
      .filter((productId) => {
        if (typeof productId === 'string') {
          return productId.startsWith('gid://shopify/Product/');
        }

        return (
          typeof productId?.id === 'string' &&
          productId.id.startsWith('gid://shopify/Product/')
        );
      });

    return {
      id: bundle.id,
      title: bundle.title,
      products,
      type: bundle.discountType === 'fixed_amount' ? 'fixed' : 'percentage',
      value: bundle.discountValue,
    };
  }).filter((bundle) => bundle.products.length >= 2);
}

/**
 * Sync active bundles to Shopify metafield with rate limit handling
 * @param {Object} admin - Shopify admin API client
 * @param {string} shop - Shop domain
 * @param {number} retryCount - Current retry attempt (internal)
 * @returns {Promise<Object>} - Sync result
 */
export async function syncBundlesToShopify(admin, shop, retryCount = 0) {
  try {
    // Fetch active bundles from database
    const activeBundles = await prisma.bundle.findMany({
      where: {
        shop,
        status: 'active',
      },
      select: {
        id: true,
        title: true,
        discountType: true,
        discountValue: true,
        productIds: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const payload = formatActiveBundlesPayload(activeBundles);

    // Get app installation ID
    const installationResponse = await admin.graphql(CURRENT_APP_INSTALLATION_QUERY);
    const installationData = await installationResponse.json();

    if (installationData?.errors?.length) {
      throw new Error(installationData.errors.map((error) => error.message).join('; '));
    }

    const ownerId = installationData?.data?.currentAppInstallation?.id;

    if (!ownerId) {
      throw new Error('Unable to resolve current app installation ID');
    }

    // Set metafield with rate limit handling
    const metafieldsResponse = await admin.graphql(METAFIELDS_SET_MUTATION, {
      variables: {
        metafields: [
          {
            ownerId,
            namespace: 'smart_bundle',
            key: 'active_bundles',
            type: 'json',
            value: JSON.stringify(payload),
          },
        ],
      },
    });

    const metafieldsData = await metafieldsResponse.json();

    // Handle GraphQL errors
    if (metafieldsData?.errors?.length) {
      const errorMessage = metafieldsData.errors.map((error) => error.message).join('; ');
      throw new Error(errorMessage);
    }

    // Handle user errors (including rate limits)
    const userErrors = metafieldsData?.data?.metafieldsSet?.userErrors ?? [];

    if (userErrors.length > 0) {
      const errorMessage = userErrors.map((error) => error.message).join('; ');

      // Check for rate limit error (429)
      if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
        if (retryCount < 3) {
          // Exponential backoff: wait 2^retryCount seconds
          const waitTime = Math.pow(2, retryCount) * 1000;
          console.log(`Rate limited, retrying in ${waitTime}ms (attempt ${retryCount + 1}/3)`);

          await new Promise(resolve => setTimeout(resolve, waitTime));
          return syncBundlesToShopify(admin, shop, retryCount + 1);
        } else {
          throw new Error(`Rate limit exceeded after ${retryCount} retries: ${errorMessage}`);
        }
      }

      throw new Error(errorMessage);
    }

    return {
      success: true,
      syncedBundles: payload.length,
      totalActiveBundles: activeBundles.length,
    };

  } catch (error) {
    console.error('Bundle sync failed:', error);
    throw error;
  }
}

export async function syncBundleStyleConfigToShopify(admin, shop) {
  const styleRecord = await prisma.bundleStyleSettings.findUnique({
    where: { shop },
    select: { config: true },
  });

  const styleConfig = sanitizeBundleStyleConfig(
    styleRecord?.config ?? getDefaultBundleStyleConfig(),
  );

  const installationResponse = await admin.graphql(CURRENT_APP_INSTALLATION_QUERY);
  const installationData = await installationResponse.json();

  if (installationData?.errors?.length) {
    throw new Error(installationData.errors.map((error) => error.message).join('; '));
  }

  const ownerId = installationData?.data?.currentAppInstallation?.id;
  if (!ownerId) {
    throw new Error('Unable to resolve current app installation ID');
  }

  const metafieldsResponse = await admin.graphql(METAFIELDS_SET_MUTATION, {
    variables: {
      metafields: [
        {
          ownerId,
          namespace: 'smart_bundle',
          key: 'ui_style_config',
          type: 'json',
          value: JSON.stringify(styleConfig),
        },
      ],
    },
  });

  const metafieldsData = await metafieldsResponse.json();

  if (metafieldsData?.errors?.length) {
    const errorMessage = metafieldsData.errors.map((error) => error.message).join('; ');
    throw new Error(errorMessage);
  }

  const userErrors = metafieldsData?.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(userErrors.map((error) => error.message).join('; '));
  }

  return {
    success: true,
    config: styleConfig,
  };
}

/**
 * Check for product collisions in active bundles
 * @param {string} shop - Shop domain
 * @param {Array} productIds - Array of product GIDs to check
 * @param {string} excludeBundleId - Bundle ID to exclude from check (for updates)
 * @returns {Promise<Object>} - Collision result
 */
export async function checkProductCollisions(shop, productIds, excludeBundleId = null) {
  const collisions = [];

  // Find all active bundles for shop (hasSome is PostgreSQL-only, filter in JS instead)
  const allBundles = await prisma.bundle.findMany({
    where: {
      shop,
      status: 'active',
      ...(excludeBundleId && { id: { not: excludeBundleId } }),
    },
    select: {
      id: true,
      title: true,
      productIds: true,
    },
  });

  const conflictingBundles = allBundles.filter(bundle => {
    const ids = bundle.productIds;
    if (!Array.isArray(ids) || ids.length === 0) return false;
    return ids.some(pid => productIds.includes(pid));
  });

  // Analyze collisions
  for (const bundle of conflictingBundles) {
    const overlappingProducts = bundle.productIds.filter(pid => productIds.includes(pid));

    if (overlappingProducts.length > 0) {
      collisions.push({
        bundleId: bundle.id,
        bundleTitle: bundle.title,
        overlappingProducts,
        overlapCount: overlappingProducts.length,
      });
    }
  }

  return {
    hasCollisions: collisions.length > 0,
    collisions,
    totalCollisions: collisions.length,
  };
}
