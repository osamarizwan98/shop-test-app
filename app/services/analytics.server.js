import prisma from "../db.server.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundCurrency(value) {
  return Math.round(toNumber(value, 0) * 100) / 100;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getOrderId(order) {
  const id = order?.admin_graphql_api_id || order?.id;
  return id ? String(id) : "";
}

function getOrderSubtotal(order) {
  // Prefer subtotal (excludes shipping/tax) for consistent uplift comparisons.
  return roundCurrency(
    order?.current_subtotal_price ??
      order?.subtotal_price ??
      order?.total_price ??
      0,
  );
}

function getOrderRefundedAmount(order) {
  return roundCurrency(order?.total_refunded ?? 0);
}

function extractBundleProperties(lineItem) {
  const properties = Array.isArray(lineItem?.properties) ? lineItem.properties : [];
  const propertyMap = new Map(
    properties
      .map((entry) => [normalizeString(entry?.name), entry?.value])
      .filter(([key]) => key.length > 0),
  );

  const bundleId = normalizeString(propertyMap.get("SB_bundle_id"));
  const bundleTitle = normalizeString(propertyMap.get("SB_bundle_title"));

  if (!bundleId && !bundleTitle) {
    return null;
  }

  return {
    bundleId: bundleId || null,
    bundleTitle: bundleTitle || null,
  };
}

function buildAttributedBundlesFromLineItems(order) {
  const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];
  const grouped = new Map();

  for (const item of lineItems) {
    const bundle = extractBundleProperties(item);
    if (!bundle) {
      continue;
    }

    const key = bundle.bundleId || bundle.bundleTitle || "unknown";
    const quantity = toNumber(item?.quantity, 0);
    const price = toNumber(item?.price, 0);
    const gross = roundCurrency(price * quantity);

    const existing = grouped.get(key) || {
      bundleId: bundle.bundleId,
      bundleTitle: bundle.bundleTitle,
      grossRevenue: 0,
      netRevenue: 0,
    };

    existing.grossRevenue = roundCurrency(existing.grossRevenue + gross);
    existing.netRevenue = existing.grossRevenue;
    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).filter(
    (entry) => entry.grossRevenue > 0 && (entry.bundleId || entry.bundleTitle),
  );
}

async function resolveBundleTitles({ shop, attributedBundles }) {
  const needsResolution = attributedBundles.some(
    (entry) => entry.bundleId && !entry.bundleTitle,
  );
  if (!needsResolution) {
    return attributedBundles;
  }

  const bundleIds = Array.from(
    new Set(attributedBundles.map((entry) => entry.bundleId).filter(Boolean)),
  );
  if (bundleIds.length === 0) {
    return attributedBundles;
  }

  const bundles = await prisma.bundle.findMany({
    where: { shop, id: { in: bundleIds } },
    select: { id: true, title: true },
  });
  const titlesById = new Map(bundles.map((bundle) => [bundle.id, bundle.title]));

  return attributedBundles.map((entry) => ({
    ...entry,
    bundleTitle: entry.bundleTitle || titlesById.get(entry.bundleId) || null,
  }));
}

function applyRefundScaling({ attribution, newRefundedAmount }) {
  const grossRevenue = roundCurrency(attribution.grossRevenue);
  const refundedAmount = Math.min(roundCurrency(newRefundedAmount), grossRevenue);
  const netRevenue = roundCurrency(Math.max(0, grossRevenue - refundedAmount));
  const ratio = grossRevenue > 0 ? netRevenue / grossRevenue : 0;

  const bundleRevenue = roundCurrency(attribution.bundleRevenue * ratio);
  const nonBundleRevenue = roundCurrency(attribution.nonBundleRevenue * ratio);

  const attributedBundles = Array.isArray(attribution.attributedBundles)
    ? attribution.attributedBundles.map((bundle) => ({
        ...bundle,
        netRevenue: roundCurrency(toNumber(bundle.grossRevenue, 0) * ratio),
      }))
    : [];

  return {
    ...attribution,
    refundedAmount,
    netRevenue,
    bundleRevenue,
    nonBundleRevenue,
    attributedBundles,
  };
}

export class AnalyticsService {
  static async processOrderCreated(shop, order) {
    const orderId = getOrderId(order);
    if (!shop || !orderId) {
      return;
    }

    const grossRevenue = getOrderSubtotal(order);
    const refundedAmount = getOrderRefundedAmount(order);
    const isCanceled = Boolean(order?.cancelled_at);

    let attributedBundles = buildAttributedBundlesFromLineItems(order);
    attributedBundles = await resolveBundleTitles({ shop, attributedBundles });

    const bundleRevenue = roundCurrency(
      attributedBundles.reduce((sum, entry) => sum + toNumber(entry.grossRevenue, 0), 0),
    );
    const nonBundleRevenue = roundCurrency(Math.max(0, grossRevenue - bundleRevenue));

    const baseAttribution = {
      shop,
      orderId,
      orderName: normalizeString(order?.name) || null,
      currency: normalizeString(order?.currency) || null,
      isBundleOrder: attributedBundles.length > 0,
      attributedBundles,
      grossRevenue,
      refundedAmount,
      netRevenue: roundCurrency(Math.max(0, grossRevenue - refundedAmount)),
      bundleRevenue,
      nonBundleRevenue,
      isCanceled,
    };

    await prisma.$transaction(async (tx) => {
      const existing = await tx.orderAttribution.findUnique({
        where: { shop_orderId: { shop, orderId } },
      });

      // Idempotency: if we already processed this order, don't double-count conversions/revenue.
      if (existing) {
        await tx.orderAttribution.update({
          where: { shop_orderId: { shop, orderId } },
          data: {
            orderName: baseAttribution.orderName,
            currency: baseAttribution.currency,
            isBundleOrder: baseAttribution.isBundleOrder,
            attributedBundles: baseAttribution.attributedBundles,
            grossRevenue: baseAttribution.grossRevenue,
            refundedAmount: baseAttribution.refundedAmount,
            netRevenue: baseAttribution.netRevenue,
            bundleRevenue: baseAttribution.bundleRevenue,
            nonBundleRevenue: baseAttribution.nonBundleRevenue,
            isCanceled: baseAttribution.isCanceled,
            updatedAt: new Date(),
          },
        });
        return;
      }

      await tx.orderAttribution.create({
        data: {
          shop,
          orderId,
          orderName: baseAttribution.orderName,
          currency: baseAttribution.currency,
          isBundleOrder: baseAttribution.isBundleOrder,
          attributedBundles: baseAttribution.attributedBundles,
          grossRevenue: baseAttribution.grossRevenue,
          refundedAmount: baseAttribution.refundedAmount,
          netRevenue: baseAttribution.netRevenue,
          bundleRevenue: baseAttribution.bundleRevenue,
          nonBundleRevenue: baseAttribution.nonBundleRevenue,
          isCanceled: baseAttribution.isCanceled,
        },
      });

      if (baseAttribution.isCanceled) {
        return;
      }

      for (const bundle of baseAttribution.attributedBundles) {
        const bundleId = bundle.bundleId || "unknown";
        const bundleTitle = bundle.bundleTitle || "SB_Unknown bundle";
        await tx.bundleAnalytics.upsert({
          where: { shop_bundleId: { shop, bundleId } },
          update: {
            bundleTitle,
            conversions: { increment: 1 },
            revenue: { increment: roundCurrency(bundle.netRevenue) },
            updatedAt: new Date(),
          },
          create: {
            shop,
            bundleId,
            bundleTitle,
            conversions: 1,
            revenue: roundCurrency(bundle.netRevenue),
          },
        });
      }
    });
  }

  static async processOrderCancelled(shop, payload) {
    const orderId = payload?.admin_graphql_api_id || payload?.id;
    if (!shop || !orderId) {
      return;
    }

    const orderIdString = String(orderId);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.orderAttribution.findUnique({
        where: { shop_orderId: { shop, orderId: orderIdString } },
      });

      if (!existing || existing.isCanceled) {
        return;
      }

      const attributedBundles = Array.isArray(existing.attributedBundles)
        ? existing.attributedBundles
        : [];

      if (existing.isBundleOrder) {
        for (const bundle of attributedBundles) {
          const bundleId = bundle?.bundleId || "unknown";
          const netRevenue = roundCurrency(bundle?.netRevenue ?? 0);
          await tx.bundleAnalytics.updateMany({
            where: { shop, bundleId },
            data: {
              conversions: { decrement: 1 },
              revenue: { decrement: netRevenue },
              updatedAt: new Date(),
            },
          });
        }
      }

      await tx.orderAttribution.update({
        where: { shop_orderId: { shop, orderId: orderIdString } },
        data: {
          isCanceled: true,
          refundedAmount: existing.grossRevenue,
          netRevenue: 0,
          bundleRevenue: 0,
          nonBundleRevenue: 0,
          attributedBundles: attributedBundles.map((bundle) => ({
            ...bundle,
            netRevenue: 0,
          })),
          updatedAt: new Date(),
        },
      });
    });
  }

  static async processRefundCreated(shop, payload) {
    const orderId = payload?.order_id || payload?.orderId;
    if (!shop || !orderId) {
      return;
    }

    const orderIdString = String(orderId);
    const refundedLineItems = Array.isArray(payload?.refund_line_items)
      ? payload.refund_line_items
      : [];

    const refundSubtotal = roundCurrency(
      refundedLineItems.reduce((sum, entry) => {
        const lineSubtotal =
          entry?.subtotal ??
          entry?.subtotal_amount ??
          entry?.line_item?.subtotal ??
          0;
        return sum + toNumber(lineSubtotal, 0);
      }, 0),
    );

    if (refundSubtotal <= 0) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.orderAttribution.findUnique({
        where: { shop_orderId: { shop, orderId: orderIdString } },
      });

      if (!existing || existing.isCanceled) {
        return;
      }

      const nextRefunded = roundCurrency(existing.refundedAmount + refundSubtotal);
      const next = applyRefundScaling({
        attribution: existing,
        newRefundedAmount: nextRefunded,
      });

      const attributedBundles = Array.isArray(existing.attributedBundles)
        ? existing.attributedBundles
        : [];

      if (existing.isBundleOrder && attributedBundles.length) {
        for (const bundle of attributedBundles) {
          const bundleId = bundle?.bundleId || "unknown";
          const previousNet = roundCurrency(bundle?.netRevenue ?? 0);
          const nextEntry = Array.isArray(next.attributedBundles)
            ? next.attributedBundles.find(
                (entry) =>
                  (entry.bundleId || "unknown") === bundleId ||
                  (entry.bundleTitle && entry.bundleTitle === bundle.bundleTitle),
              )
            : null;
          const nextNet = roundCurrency(nextEntry?.netRevenue ?? 0);
          const delta = roundCurrency(nextNet - previousNet);

          if (delta !== 0) {
            await tx.bundleAnalytics.updateMany({
              where: { shop, bundleId },
              data: {
                revenue: { increment: delta },
                updatedAt: new Date(),
              },
            });
          }
        }
      }

      await tx.orderAttribution.update({
        where: { shop_orderId: { shop, orderId: orderIdString } },
        data: {
          refundedAmount: next.refundedAmount,
          netRevenue: next.netRevenue,
          bundleRevenue: next.bundleRevenue,
          nonBundleRevenue: next.nonBundleRevenue,
          attributedBundles: next.attributedBundles,
          updatedAt: new Date(),
        },
      });
    });
  }

  static async getDashboardAnalytics(shop) {
    const [totalOrders, bundleOrders, bundleRevenueAgg, nonBundleRevenueAgg, topBundles] =
      await Promise.all([
        prisma.orderAttribution.count({ where: { shop, isCanceled: false } }),
        prisma.orderAttribution.count({
          where: { shop, isBundleOrder: true, isCanceled: false },
        }),
        prisma.orderAttribution.aggregate({
          where: { shop, isCanceled: false },
          _sum: { bundleRevenue: true },
        }),
        prisma.orderAttribution.aggregate({
          where: { shop, isCanceled: false },
          _sum: { nonBundleRevenue: true },
        }),
        prisma.bundleAnalytics.findMany({
          where: { shop },
          orderBy: { revenue: "desc" },
          take: 5,
          select: {
            bundleId: true,
            bundleTitle: true,
            conversions: true,
            revenue: true,
          },
        }),
      ]);

    const bundleRevenue = roundCurrency(bundleRevenueAgg?._sum?.bundleRevenue ?? 0);
    const nonBundleRevenue = roundCurrency(
      nonBundleRevenueAgg?._sum?.nonBundleRevenue ?? 0,
    );
    const bundleConversionRate =
      totalOrders > 0 ? bundleOrders / totalOrders : 0;

    const nonBundleOrders = Math.max(totalOrders - bundleOrders, 0);
    const bundleAov = bundleOrders > 0 ? bundleRevenue / bundleOrders : 0;
    const nonBundleAov =
      nonBundleOrders > 0 ? nonBundleRevenue / nonBundleOrders : 0;
    const revenueUplift =
      nonBundleAov > 0 ? bundleAov / nonBundleAov - 1 : 0;

    // Trend: last 14 days (bucketed client-side for SQLite compatibility).
    const since = new Date();
    since.setDate(since.getDate() - 13);

    const recentOrders = await prisma.orderAttribution.findMany({
      where: { shop, isCanceled: false, createdAt: { gte: since } },
      select: { createdAt: true, bundleRevenue: true, nonBundleRevenue: true },
      orderBy: { createdAt: "asc" },
    });

    const buckets = new Map();
    for (const row of recentOrders) {
      const dayKey = new Date(row.createdAt).toISOString().slice(0, 10);
      const current = buckets.get(dayKey) || {
        day: dayKey,
        bundleRevenue: 0,
        nonBundleRevenue: 0,
      };
      current.bundleRevenue = roundCurrency(
        current.bundleRevenue + toNumber(row.bundleRevenue, 0),
      );
      current.nonBundleRevenue = roundCurrency(
        current.nonBundleRevenue + toNumber(row.nonBundleRevenue, 0),
      );
      buckets.set(dayKey, current);
    }

    const trend = Array.from(buckets.values());

    return {
      totalOrders,
      bundleOrders,
      bundleRevenue,
      nonBundleRevenue,
      bundleConversionRate,
      revenueUplift,
      topBundles,
      trend,
    };
  }
}

