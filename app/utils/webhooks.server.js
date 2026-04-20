import prisma from "../db.server";

function toProductGid(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `gid://shopify/Product/${Math.trunc(value)}`;
  }

  if (typeof value === "string") {
    if (value.startsWith("gid://shopify/Product/")) {
      return value;
    }

    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return `gid://shopify/Product/${parsed}`;
    }
  }

  return null;
}

function bundleContainsProduct(productIds, deletedProductGid) {
  if (!Array.isArray(productIds)) {
    return false;
  }

  return productIds.some((item) => {
    if (typeof item === "string") {
      return item === deletedProductGid;
    }

    return typeof item?.id === "string" && item.id === deletedProductGid;
  });
}

export async function handleAppUninstalled(shop) {
  if (!shop) {
    return;
  }

  await prisma.$transaction([
    prisma.bundle.deleteMany({ where: { shop } }),
    prisma.analytics.deleteMany({ where: { shop } }),
    prisma.inventoryAnalysis.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);
}

export async function handleProductDeleted({ shop, payload }) {
  if (!shop) {
    return { updatedBundles: 0 };
  }

  const deletedProductGid = toProductGid(payload?.id);
  if (!deletedProductGid) {
    return { updatedBundles: 0 };
  }

  const activeBundles = await prisma.bundle.findMany({
    where: {
      shop,
      status: "active",
    },
    select: {
      id: true,
      productIds: true,
    },
  });

  const affectedBundleIds = activeBundles
    .filter((bundle) => bundleContainsProduct(bundle.productIds, deletedProductGid))
    .map((bundle) => bundle.id);

  if (affectedBundleIds.length === 0) {
    return { updatedBundles: 0 };
  }

  const updateResult = await prisma.bundle.updateMany({
    where: {
      id: { in: affectedBundleIds },
      shop,
      status: "active",
    },
    data: {
      status: "inactive",
    },
  });

  return { updatedBundles: updateResult.count };
}
