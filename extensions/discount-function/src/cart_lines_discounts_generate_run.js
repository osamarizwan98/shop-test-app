const PRODUCT_DISCOUNT_SELECTION_STRATEGY_FIRST = "FIRST";

const EMPTY_RESULT = {
  operations: [],
};

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

function toPositiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function extractBundleItems(bundle) {
  const rawItems = bundle?.products ?? [];

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return [];
  }

  const mergedItems = new Map();

  for (const rawItem of rawItems) {
    const productId =
      typeof rawItem === "string"
        ? rawItem
        : typeof rawItem?.id === "string"
          ? rawItem.id
          : null;

    if (
      typeof productId !== "string" ||
      productId.length === 0 ||
      !productId.startsWith("gid://shopify/Product/")
    ) {
      continue;
    }

    const existing = mergedItems.get(productId) ?? 0;
    mergedItems.set(productId, existing + 1);
  }

  return Array.from(mergedItems, ([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

function normalizeBundle(bundle) {
  if (!bundle || typeof bundle !== "object") {
    return null;
  }

  const title =
    typeof bundle.title === "string" && bundle.title.trim().length > 0
      ? bundle.title.trim()
      : "Bundle discount";

  const discountType = normalizeDiscountType(bundle.type);
  const discountValue = Number(bundle.value);
  const items = extractBundleItems(bundle);

  if (!discountType || !Number.isFinite(discountValue) || discountValue <= 0) {
    return null;
  }

  if (discountType === "percentage" && discountValue > 100) {
    return null;
  }

  if (items.length === 0) {
    return null;
  }

  return {
    id: typeof bundle.id === "string" ? bundle.id : null,
    title,
    discountType,
    discountValue,
    items,
  };
}

function buildCartIndex(lines) {
  const linesByProductId = new Map();

  for (const line of lines) {
    const productId = line?.merchandise?.product?.id;

    if (typeof productId !== "string" || productId.length === 0) {
      continue;
    }

    const quantity = toPositiveInteger(line.quantity, 0);
    if (quantity <= 0) {
      continue;
    }

    const indexedLine = {
      id: line.id,
      quantity,
    };

    const existingLines = linesByProductId.get(productId) ?? [];
    existingLines.push(indexedLine);
    linesByProductId.set(productId, existingLines);
  }

  return linesByProductId;
}

function getAvailableQuantity(lines) {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

function calculateBundleSets(bundle, linesByProductId) {
  let maxSets = Number.POSITIVE_INFINITY;

  for (const item of bundle.items) {
    const cartLines = linesByProductId.get(item.productId);
    if (!cartLines || cartLines.length === 0) {
      return 0;
    }

    const availableQuantity = getAvailableQuantity(cartLines);
    const setsForItem = Math.floor(availableQuantity / item.quantity);

    if (setsForItem <= 0) {
      return 0;
    }

    maxSets = Math.min(maxSets, setsForItem);
  }

  return Number.isFinite(maxSets) ? maxSets : 0;
}

function buildTargets(bundle, bundleSets, linesByProductId) {
  const targets = [];

  for (const item of bundle.items) {
    const cartLines = linesByProductId.get(item.productId) ?? [];
    let remainingQuantity = bundleSets * item.quantity;

    for (const line of cartLines) {
      if (remainingQuantity <= 0) {
        break;
      }

      const discountedQuantity = Math.min(line.quantity, remainingQuantity);

      if (discountedQuantity > 0) {
        targets.push({
          cartLine: {
            id: line.id,
            quantity: discountedQuantity,
          },
        });
        remainingQuantity -= discountedQuantity;
      }
    }

    if (remainingQuantity > 0) {
      return [];
    }
  }

  return targets;
}

function buildValue(bundle, bundleSets) {
  if (bundle.discountType === "percentage") {
    return {
      percentage: {
        value: bundle.discountValue,
      },
    };
  }

  return {
    fixedAmount: {
      amount: bundle.discountValue * bundleSets,
    },
  };
}

// [START discount-function.run.cart]
export function cartLinesDiscountsGenerateRun(input) {
  const cartLines = input?.cart?.lines ?? [];
  const activeBundles = input?.shop?.metafield?.jsonValue;

  if (cartLines.length === 0 || !Array.isArray(activeBundles) || activeBundles.length === 0) {
    return EMPTY_RESULT;
  }

  const linesByProductId = buildCartIndex(cartLines);
  if (linesByProductId.size === 0) {
    return EMPTY_RESULT;
  }

  const candidates = [];

  // Compare each bundle rule against the cart and emit a discount candidate when matched.
  for (const rawBundle of activeBundles) {
    const bundle = normalizeBundle(rawBundle);
    if (!bundle) {
      continue;
    }

    // Calculate how many complete bundle sets exist across all relevant cart lines.
    const bundleSets = calculateBundleSets(bundle, linesByProductId);
    if (bundleSets <= 0) {
      continue;
    }

    // Target only the cart lines and quantities that belong to the qualifying bundle.
    const targets = buildTargets(bundle, bundleSets, linesByProductId);
    if (targets.length === 0) {
      continue;
    }

    candidates.push({
      message: bundle.title,
      targets,
      value: buildValue(bundle, bundleSets),
    });
  }

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
