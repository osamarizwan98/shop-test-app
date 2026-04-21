const PRODUCT_DISCOUNT_SELECTION_STRATEGY_FIRST = "FIRST";
const PRODUCT_DISCOUNT_CLASS = "PRODUCT";
const MAX_PERCENTAGE_DISCOUNT = 90;
const EMPTY_RESULT = {
  operations: [],
};

function toPositiveInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeDiscountType(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "percentage") {
    return "percentage";
  }

  if (
    normalized === "fixed" ||
    normalized === "fixed_amount" ||
    normalized === "fixed-amount"
  ) {
    return "fixed_amount";
  }

  return null;
}

function normalizeGid(value, expectedType) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(`gid://shopify/${expectedType}/`)) {
    return trimmed;
  }

  if (/^\d+$/.test(trimmed)) {
    return `gid://shopify/${expectedType}/${trimmed}`;
  }

  return null;
}

function normalizeMerchandiseReference(rawItem) {
  if (typeof rawItem === "string") {
    return {
      productId: normalizeGid(rawItem, "Product"),
      variantId: null,
      quantity: 1,
    };
  }

  if (!rawItem || typeof rawItem !== "object") {
    return null;
  }

  const variantId =
    normalizeGid(rawItem.variantId, "ProductVariant") ||
    normalizeGid(rawItem.variant_id, "ProductVariant");
  const productId = normalizeGid(rawItem.id, "Product");
  const quantity =
    toPositiveInteger(rawItem.quantity, 0) ||
    toPositiveInteger(rawItem.SB_quantity, 0) ||
    1;

  if (!variantId && !productId) {
    return null;
  }

  return {
    variantId,
    productId,
    quantity,
  };
}

function mergeBundleItems(items) {
  const mergedItems = new Map();

  for (const item of items) {
    const key =
      item.variantId || (item.productId ? `product:${item.productId}` : null);

    if (!key) {
      continue;
    }

    const existing = mergedItems.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      continue;
    }

    mergedItems.set(key, { ...item });
  }

  return Array.from(mergedItems.values());
}

function extractBundleItems(bundle) {
  const rawItems = bundle?.products ?? bundle?.SB_products ?? [];
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return [];
  }

  const items = rawItems
    .map(normalizeMerchandiseReference)
    .filter(Boolean);

  return mergeBundleItems(items);
}

function normalizeTier(rawTier) {
  if (!rawTier || typeof rawTier !== "object") {
    return null;
  }

  const minimumQuantity =
    toPositiveInteger(rawTier.minimumQuantity, 0) ||
    toPositiveInteger(rawTier.minimum_quantity, 0) ||
    toPositiveInteger(rawTier.SB_minimumQuantity, 0);
  const discountType = normalizeDiscountType(
    rawTier.type ?? rawTier.SB_type,
  );
  const discountValue = toPositiveNumber(rawTier.value ?? rawTier.SB_value);

  if (!minimumQuantity || !discountType || !discountValue) {
    return null;
  }

  if (discountType === "percentage" && discountValue > MAX_PERCENTAGE_DISCOUNT) {
    return null;
  }

  return {
    minimumQuantity,
    discountType,
    discountValue,
  };
}

function buildLegacyTier(bundle) {
  const discountType = normalizeDiscountType(bundle?.type ?? bundle?.SB_type);
  const discountValue = toPositiveNumber(bundle?.value ?? bundle?.SB_value);

  if (!discountType || !discountValue) {
    return null;
  }

  if (discountType === "percentage" && discountValue > MAX_PERCENTAGE_DISCOUNT) {
    return null;
  }

  return {
    minimumQuantity: 1,
    discountType,
    discountValue,
  };
}

function extractTiers(bundle) {
  const rawTiers = bundle?.SB_tiers ?? bundle?.tiers;
  const normalizedTiers = Array.isArray(rawTiers)
    ? rawTiers.map(normalizeTier).filter(Boolean)
    : [];

  if (normalizedTiers.length > 0) {
    return normalizedTiers.sort(
      (left, right) => left.minimumQuantity - right.minimumQuantity,
    );
  }

  const legacyTier = buildLegacyTier(bundle);
  return legacyTier ? [legacyTier] : [];
}

function normalizeBundle(bundle) {
  if (!bundle || typeof bundle !== "object") {
    return null;
  }

  const items = extractBundleItems(bundle);
  const tiers = extractTiers(bundle);

  if (items.length === 0 || tiers.length === 0) {
    return null;
  }

  return {
    id: typeof bundle.id === "string" ? bundle.id : null,
    title:
      typeof bundle.title === "string" && bundle.title.trim().length > 0
        ? bundle.title.trim()
        : "SB_Bundle discount",
    items,
    tiers,
  };
}

function buildCartIndexes(lines) {
  const linesByVariantId = new Map();
  const linesByProductId = new Map();

  for (const line of lines) {
    const quantity = toPositiveInteger(line?.quantity, 0);
    if (!quantity) {
      continue;
    }

    const variantId = normalizeGid(line?.merchandise?.id, "ProductVariant");
    const productId = normalizeGid(line?.merchandise?.product?.id, "Product");
    const subtotalAmount = Number(line?.cost?.subtotalAmount?.amount ?? 0);

    const indexedLine = {
      id: line.id,
      quantity,
      subtotalAmount: Number.isFinite(subtotalAmount) ? subtotalAmount : 0,
    };

    if (variantId) {
      const existingVariantLines = linesByVariantId.get(variantId) ?? [];
      existingVariantLines.push(indexedLine);
      linesByVariantId.set(variantId, existingVariantLines);
    }

    if (productId) {
      const existingProductLines = linesByProductId.get(productId) ?? [];
      existingProductLines.push(indexedLine);
      linesByProductId.set(productId, existingProductLines);
    }
  }

  return { linesByVariantId, linesByProductId };
}

function getAvailableLines(item, indexes) {
  if (item.variantId) {
    return indexes.linesByVariantId.get(item.variantId) ?? [];
  }

  if (item.productId) {
    return indexes.linesByProductId.get(item.productId) ?? [];
  }

  return [];
}

function getAvailableQuantity(lines) {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

function calculateBundleSets(bundle, indexes) {
  let maxSets = Number.POSITIVE_INFINITY;

  for (const item of bundle.items) {
    const lines = getAvailableLines(item, indexes);
    if (lines.length === 0) {
      return 0;
    }

    const setsForItem = Math.floor(getAvailableQuantity(lines) / item.quantity);
    if (setsForItem <= 0) {
      return 0;
    }

    maxSets = Math.min(maxSets, setsForItem);
  }

  return Number.isFinite(maxSets) ? maxSets : 0;
}

function resolveTier(bundleSets, tiers) {
  let matchedTier = null;

  for (const tier of tiers) {
    if (bundleSets >= tier.minimumQuantity) {
      matchedTier = tier;
    }
  }

  return matchedTier;
}

function buildTargets(bundle, appliedSets, indexes) {
  const targets = [];
  let targetedSubtotal = 0;

  for (const item of bundle.items) {
    const lines = getAvailableLines(item, indexes);
    let remainingQuantity = appliedSets * item.quantity;

    for (const line of lines) {
      if (remainingQuantity <= 0) {
        break;
      }

      const discountedQuantity = Math.min(line.quantity, remainingQuantity);
      if (discountedQuantity <= 0) {
        continue;
      }

      const unitSubtotal = line.quantity > 0 ? line.subtotalAmount / line.quantity : 0;
      targetedSubtotal += unitSubtotal * discountedQuantity;
      targets.push({
        cartLine: {
          id: line.id,
          quantity: discountedQuantity,
        },
      });
      remainingQuantity -= discountedQuantity;
    }

    if (remainingQuantity > 0) {
      return { targets: [], targetedSubtotal: 0 };
    }
  }

  return { targets, targetedSubtotal };
}

function buildDiscountValue(tier, appliedSets) {
  if (tier.discountType === "percentage") {
    return {
      percentage: {
        value: tier.discountValue,
      },
    };
  }

  return {
    fixedAmount: {
      amount: tier.discountValue * appliedSets,
    },
  };
}

function exceedsSafetyGuard(tier, appliedSets, targetedSubtotal) {
  if (tier.discountType === "percentage") {
    return tier.discountValue > MAX_PERCENTAGE_DISCOUNT;
  }

  if (!(targetedSubtotal > 0)) {
    return true;
  }

  const totalDiscountAmount = tier.discountValue * appliedSets;
  return totalDiscountAmount > targetedSubtotal * 0.9;
}

function buildCandidate(bundle, indexes) {
  const bundleSets = calculateBundleSets(bundle, indexes);
  if (bundleSets <= 0) {
    return null;
  }

  const tier = resolveTier(bundleSets, bundle.tiers);
  if (!tier) {
    return null;
  }

  const { targets, targetedSubtotal } = buildTargets(bundle, bundleSets, indexes);
  if (targets.length === 0) {
    return null;
  }

  if (exceedsSafetyGuard(tier, bundleSets, targetedSubtotal)) {
    return null;
  }

  return {
    message: bundle.title,
    targets,
    value: buildDiscountValue(tier, bundleSets),
  };
}

// [START discount-function.run.cart]
export function cartLinesDiscountsGenerateRun(input) {
  const cartLines = input?.cart?.lines ?? [];
  const activeBundles = input?.shop?.metafield?.jsonValue;
  const discountClasses = input?.discount?.discountClasses ?? [];

  if (
    cartLines.length === 0 ||
    !Array.isArray(activeBundles) ||
    activeBundles.length === 0 ||
    !discountClasses.includes(PRODUCT_DISCOUNT_CLASS)
  ) {
    return EMPTY_RESULT;
  }

  const indexes = buildCartIndexes(cartLines);
  if (indexes.linesByVariantId.size === 0 && indexes.linesByProductId.size === 0) {
    return EMPTY_RESULT;
  }

  const candidates = activeBundles
    .map(normalizeBundle)
    .filter(Boolean)
    .map((bundle) => buildCandidate(bundle, indexes))
    .filter(Boolean);

  if (candidates.length === 0) {
    return EMPTY_RESULT;
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: PRODUCT_DISCOUNT_SELECTION_STRATEGY_FIRST,
        },
      },
    ],
  };
}
// [END discount-function.run.cart]
