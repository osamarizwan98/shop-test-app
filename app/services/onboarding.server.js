import prisma from '../db.server.js';
import { syncBundlesToShopify, syncBundleStyleConfigToShopify } from '../utils/bundleSync.js';
import { getDefaultBundleStyleConfig } from '../utils/styleConfig.server.js';

const TOP_SELLING_PRODUCTS_QUERY = `#graphql
  query TopSellingProductsForOnboarding {
    products(first: 3, sortKey: BEST_SELLING) {
      edges {
        node {
          id
          title
          handle
          totalInventory
          variants(first: 1) {
            edges {
              node {
                id
                price
              }
            }
          }
        }
      }
    }
  }
`;

function parseTopSellingProducts(data) {
  const edges = data?.data?.products?.edges;
  if (!Array.isArray(edges)) {
    return [];
  }

  return edges
    .map((edge) => edge?.node)
    .filter(Boolean)
    .map((product) => {
      const firstVariant = product?.variants?.edges?.[0]?.node;
      return {
        id: product.id,
        title: product.title || 'Product',
        handle: product.handle || '',
        totalInventory: Number(product.totalInventory || 0),
        variantId: firstVariant?.id || '',
        price: firstVariant?.price || '',
      };
    })
    .filter((product) => typeof product.id === 'string' && product.id.startsWith('gid://shopify/Product/'));
}

async function fetchTopSellingProducts(admin) {
  // For first-3 onboarding, a direct query is faster than bulk operations.
  const response = await admin.graphql(TOP_SELLING_PRODUCTS_QUERY);
  const payload = await response.json();

  if (payload?.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join('; '));
  }

  return parseTopSellingProducts(payload);
}

export async function initializeStoreOnboarding({ admin, shop }) {
  if (!admin || !shop) {
    return { success: false, setupComplete: false, reason: 'missing_context' };
  }

  try {
    const topProducts = await fetchTopSellingProducts(admin);
    let seededBundleId = null;

    await prisma.bundleStyleSettings.upsert({
      where: { shop },
      create: {
        shop,
        config: getDefaultBundleStyleConfig(),
      },
      update: {},
    });

    if (topProducts.length >= 2) {
      const existingStarterBundle = await prisma.bundle.findFirst({
        where: {
          shop,
          title: 'Default FBT Bundle',
        },
        select: { id: true },
      });

      if (existingStarterBundle?.id) {
        seededBundleId = existingStarterBundle.id;
        await prisma.bundle.update({
          where: { id: existingStarterBundle.id },
          data: {
            productIds: topProducts.slice(0, 3),
            discountType: 'percentage',
            discountValue: 10,
            status: 'inactive',
          },
        });
      } else {
        const createdBundle = await prisma.bundle.create({
          data: {
            shop,
            title: 'Default FBT Bundle',
            status: 'inactive',
            discountType: 'percentage',
            discountValue: 10,
            productIds: topProducts.slice(0, 3),
            inventoryHidden: false,
          },
        });
        seededBundleId = createdBundle.id;
      }
    }

    await Promise.all([
      syncBundlesToShopify(admin, shop),
      syncBundleStyleConfigToShopify(admin, shop),
    ]);

    const onboardingStatus = topProducts.length >= 2 ? 'completed' : 'needs_products';
    await prisma.onboardingState.upsert({
      where: { shop },
      create: {
        shop,
        status: onboardingStatus,
        seededBundleId,
        seededProductsCount: topProducts.length,
        completedAt: new Date(),
      },
      update: {
        status: onboardingStatus,
        seededBundleId,
        seededProductsCount: topProducts.length,
        lastError: null,
        completedAt: new Date(),
      },
    });

    return {
      success: true,
      setupComplete: onboardingStatus === 'completed',
      seededProductsCount: topProducts.length,
      seededDraftBundle: topProducts.length >= 2,
    };
  } catch (error) {
    console.error('Onboarding initialization failed:', error);
    await prisma.onboardingState.upsert({
      where: { shop },
      create: {
        shop,
        status: 'failed',
        lastError: error.message,
      },
      update: {
        status: 'failed',
        lastError: error.message,
      },
    });
    return {
      success: false,
      setupComplete: false,
      reason: error.message,
    };
  }
}

export async function queueInitialOnboarding({ admin, shop }) {
  if (!admin || !shop) {
    return { queued: false, reason: 'missing_context' };
  }

  const existingState = await prisma.onboardingState.findUnique({
    where: { shop },
    select: { status: true },
  });

  if (existingState?.status === 'processing' || existingState?.status === 'completed' || existingState?.status === 'needs_products') {
    return { queued: false, reason: 'already_initialized' };
  }

  await prisma.onboardingState.upsert({
    where: { shop },
    create: {
      shop,
      status: 'processing',
    },
    update: {
      status: 'processing',
      lastError: null,
    },
  });

  void initializeStoreOnboarding({ admin, shop });

  return { queued: true };
}
