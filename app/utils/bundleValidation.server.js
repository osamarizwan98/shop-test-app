const ALLOWED_DISCOUNT_TYPES = new Set(["percentage", "fixed_amount"]);
const PRODUCT_GID_PREFIX = "gid://shopify/Product/";

function asString(value) {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value) {
  return typeof value === "string" ? value : undefined;
}

function normalizeDiscountValue(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isValidProductGid(value) {
  return typeof value === "string" && value.startsWith(PRODUCT_GID_PREFIX);
}

function sanitizeProduct(rawProduct) {
  if (!rawProduct || typeof rawProduct !== "object") {
    return null;
  }

  if (!isValidProductGid(rawProduct.id)) {
    return null;
  }

  return {
    id: rawProduct.id,
    title: asString(rawProduct.title),
    handle: asString(rawProduct.handle),
    variantId: asOptionalString(rawProduct.variantId),
    price:
      typeof rawProduct.price === "number" || typeof rawProduct.price === "string"
        ? rawProduct.price
        : "",
    image: asOptionalString(rawProduct.image) || null,
  };
}

export function validateBundleSubmission({
  bundleTitle,
  discountType,
  discountValueRaw,
  productsJson,
}) {
  const normalizedTitle = asString(bundleTitle).trim();
  if (!normalizedTitle) {
    return { success: false, error: "Bundle title is required" };
  }

  if (!ALLOWED_DISCOUNT_TYPES.has(discountType)) {
    return { success: false, error: "Invalid discount type" };
  }

  const discountValue = normalizeDiscountValue(discountValueRaw);
  if (Number.isNaN(discountValue) || discountValue < 0) {
    return { success: false, error: "Discount value must be a positive number" };
  }

  if (discountType === "percentage" && (discountValue < 1 || discountValue > 99)) {
    return { success: false, error: "Discount percentage must be between 1 and 99" };
  }

  let parsedProducts;
  try {
    parsedProducts = JSON.parse(asString(productsJson) || "[]");
  } catch {
    return { success: false, error: "Invalid product data" };
  }

  if (!Array.isArray(parsedProducts)) {
    return { success: false, error: "Invalid product data" };
  }

  const selectedProducts = parsedProducts
    .map((product) => sanitizeProduct(product))
    .filter(Boolean);

  if (selectedProducts.length < 2) {
    return { success: false, error: "At least 2 valid products must be selected for a bundle" };
  }

  return {
    success: true,
    data: {
      bundleTitle: normalizedTitle,
      discountType,
      discountValue,
      selectedProducts,
    },
  };
}
