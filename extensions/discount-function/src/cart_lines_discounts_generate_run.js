import { validateBundle } from "./bundleValidation";

const PRODUCT_DISCOUNT_SELECTION_STRATEGY_FIRST = "FIRST";
const PRODUCT_DISCOUNT_CLASS = "PRODUCT";
const DEFAULT_MAX_DISCOUNT_CAP_PERCENT = 80;
const MAX_ALLOWED_CAP_PERCENT = 100;
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

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function normalizeCode(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeMerchandiseReference(rawItem) {
  if (typeof rawItem === "string") {
    return {
      productId: normalizeGid(rawItem, "Product"),
      variantId: null,
      quantity: 1,
      noStackingWithManualCode: false,
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
    noStackingWithManualCode: false,
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

  const items = rawItems.map(normalizeMerchandiseReference).filter(Boolean);
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

  if (discountType === "percentage" && discountValue > MAX_ALLOWED_CAP_PERCENT) {
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

  if (discountType === "percentage" && discountValue > MAX_ALLOWED_CAP_PERCENT) {
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
  let normalizedTiers = [];

  if (Array.isArray(rawTiers)) {
    normalizedTiers = rawTiers.map(normalizeTier).filter(Boolean);
  } else if (rawTiers && typeof rawTiers === "object") {
    normalizedTiers = Object.entries(rawTiers)
      .map(([minimumQuantity, discountValue]) => {
        const minQty = toPositiveInteger(minimumQuantity, 0);
        const value = toPositiveNumber(discountValue);

        if (!minQty || !value || value > MAX_ALLOWED_CAP_PERCENT) {
          return null;
        }

        return {
          minimumQuantity: minQty,
          discountType: "percentage",
          discountValue: value,
        };
      })
      .filter(Boolean);
  }

  if (normalizedTiers.length > 0) {
    return normalizedTiers.sort(
      (left, right) => left.minimumQuantity - right.minimumQuantity,
    );
  }

  const legacyTier = buildLegacyTier(bundle);
  return legacyTier ? [legacyTier] : [];
}

function parseStackingPolicy(bundle, globalConfig) {
  const localNoStacking = Boolean(
    bundle?.SB_noStackingWithManualCode ??
      bundle?.noStackingWithManualCode ??
      bundle?.noStacking,
  );

  if (localNoStacking) {
    return "no_manual_codes";
  }

  if (globalConfig?.allowManualCodeStacking === true) {
    return "allow_all";
  }

  if (globalConfig?.allowManualCodeStacking === false) {
    return "no_manual_codes";
  }

  const configuredPolicy = String(globalConfig?.stackingPolicy || "").trim().toLowerCase();
  if (configuredPolicy === "allow_all" || configuredPolicy === "no_manual_codes") {
    return configuredPolicy;
  }

  return "allow_all";
}

function normalizeBundle(bundle, globalConfig) {
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
    stackingPolicy: parseStackingPolicy(bundle, globalConfig),
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
    const subtotalAmount = toNumber(line?.cost?.subtotalAmount?.amount, 0);

    const indexedLine = {
      id: line.id,
      quantity,
      subtotalAmount,
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

function resolveTier(bundleSets, tiers) {
  let matchedTier = null;

  for (const tier of tiers) {
    if (bundleSets >= tier.minimumQuantity) {
      matchedTier = tier;
    }
  }

  return matchedTier;
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

function estimateDiscountAmount(tier, appliedSets, targetedSubtotal) {
  if (!(targetedSubtotal > 0)) {
    return 0;
  }

  if (tier.discountType === "percentage") {
    return targetedSubtotal * (tier.discountValue / 100);
  }

  return tier.discountValue * appliedSets;
}

function buildTierMessage(bundleTitle, tier) {
  if (tier.discountType === "percentage") {
    return `${bundleTitle} - ${tier.discountValue}% Off Applied`;
  }

  return `${bundleTitle} - Bundle Savings Applied`;
}

function parseFunctionConfig(discountMetafield) {
  const raw = discountMetafield?.jsonValue;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      stackingPolicy: "allow_all",
      allowManualCodeStacking: true,
      maxDiscountCapPercent: DEFAULT_MAX_DISCOUNT_CAP_PERCENT,
    };
  }

  const configuredCap = toNumber(raw.maxDiscountCapPercent, DEFAULT_MAX_DISCOUNT_CAP_PERCENT);
  const maxDiscountCapPercent = Math.min(
    MAX_ALLOWED_CAP_PERCENT,
    Math.max(1, configuredCap),
  );

  const stackingPolicy = String(raw.stackingPolicy || "").trim().toLowerCase();
  const allowManualCodeStacking =
    typeof raw.allowManualCodeStacking === "boolean"
      ? raw.allowManualCodeStacking
      : stackingPolicy === "no_manual_codes"
        ? false
        : true;

  return {
    stackingPolicy:
      stackingPolicy === "no_manual_codes" ? "no_manual_codes" : "allow_all",
    allowManualCodeStacking,
    maxDiscountCapPercent,
  };
}

class Validator {
  constructor(input) {
    this.input = input || {};
    this.cartLines = this.input?.cart?.lines ?? [];
    this.activeBundles = this.input?.shop?.activeBundlesConfig?.jsonValue ?? [];
    this.discountClasses = this.input?.discount?.discountClasses ?? [];
    this.enteredDiscountCodes = this.input?.enteredDiscountCodes ?? [];
    this.triggeringDiscountCode = this.input?.triggeringDiscountCode ?? null;
    this.orderSubtotal = toNumber(this.input?.cart?.cost?.subtotalAmount?.amount, 0);
    this.config = parseFunctionConfig(this.input?.discount?.metafield);
    this.indexes = buildCartIndexes(this.cartLines);
  }

  isProductDiscountSupported() {
    return this.discountClasses.includes(PRODUCT_DISCOUNT_CLASS);
  }

  hasEligibleInput() {
    return (
      this.cartLines.length > 0 &&
      Array.isArray(this.activeBundles) &&
      this.activeBundles.length > 0 &&
      this.isProductDiscountSupported()
    );
  }

  hasExternalManualDiscountCode() {
    const triggerCode = normalizeCode(this.triggeringDiscountCode);

    return this.enteredDiscountCodes.some((entry) => {
      const code = normalizeCode(entry?.code);
      if (!code) {
        return false;
      }

      if (!triggerCode) {
        return true;
      }

      return code !== triggerCode;
    });
  }

  isStackingBlocked(bundle) {
    if (bundle.stackingPolicy !== "no_manual_codes") {
      return false;
    }

    return this.hasExternalManualDiscountCode();
  }

  getOrderDiscountCapAmount() {
    return this.orderSubtotal * (this.config.maxDiscountCapPercent / 100);
  }

  buildCandidate(bundle, remainingByLineId) {
    if (this.isStackingBlocked(bundle)) {
      return null;
    }

    const validation = validateBundle(bundle, this.indexes, remainingByLineId);
    if (!validation) {
      return null;
    }

    const tier = resolveTier(validation.appliedSets, bundle.tiers);
    if (!tier) {
      return null;
    }

    const estimatedDiscountAmount = estimateDiscountAmount(
      tier,
      validation.appliedSets,
      validation.targetedSubtotal,
    );
    const discountCapAmount = this.getOrderDiscountCapAmount();

    if (estimatedDiscountAmount <= 0 || estimatedDiscountAmount > discountCapAmount) {
      return null;
    }

    return {
      candidate: {
        message: buildTierMessage(bundle.title, tier),
        targets: validation.targets,
        value: buildDiscountValue(tier, validation.appliedSets),
      },
      consumedLineQuantities: validation.consumedLineQuantities,
    };
  }

  buildCandidates() {
    if (
      this.indexes.linesByVariantId.size === 0 &&
      this.indexes.linesByProductId.size === 0
    ) {
      return [];
    }

    const normalizedBundles = this.activeBundles
      .map((bundle) => normalizeBundle(bundle, this.config))
      .filter(Boolean);

    const remainingByLineId = new Map();
    for (const line of this.cartLines) {
      const quantity = toPositiveInteger(line?.quantity, 0);
      if (quantity > 0 && typeof line?.id === "string") {
        remainingByLineId.set(line.id, quantity);
      }
    }

    const candidates = [];
    for (const bundle of normalizedBundles) {
      const evaluated = this.buildCandidate(bundle, remainingByLineId);
      if (!evaluated) {
        continue;
      }

      for (const [lineId, consumedQuantity] of evaluated.consumedLineQuantities.entries()) {
        const current = remainingByLineId.get(lineId) ?? 0;
        remainingByLineId.set(lineId, Math.max(0, current - consumedQuantity));
      }

      candidates.push(evaluated.candidate);
    }

    return candidates;
  }
}

// [START discount-function.run.cart]
export function cartLinesDiscountsGenerateRun(input) {
  const validator = new Validator(input);

  if (!validator.hasEligibleInput()) {
    return EMPTY_RESULT;
  }

  const candidates = validator.buildCandidates();
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
