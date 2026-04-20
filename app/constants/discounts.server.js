export const SMART_BUNDLE_DISCOUNT_TITLE = 'SmartBundle AI Discount';

function normalizeAppEnvironment() {
  return (
    process.env.SHOPIFY_APP_ENV?.trim().toLowerCase() ||
    process.env.NODE_ENV?.trim().toLowerCase() ||
    'development'
  );
}

function resolveDiscountFunctionId() {
  const appEnvironment = normalizeAppEnvironment();

  if (appEnvironment === 'production') {
    return (
      process.env.SHOPIFY_DISCOUNT_FUNCTION_ID_PRODUCTION?.trim() ||
      process.env.SHOPIFY_DISCOUNT_FUNCTION_ID?.trim() ||
      ''
    );
  }

  if (appEnvironment === 'staging') {
    return (
      process.env.SHOPIFY_DISCOUNT_FUNCTION_ID_STAGING?.trim() ||
      process.env.SHOPIFY_DISCOUNT_FUNCTION_ID?.trim() ||
      ''
    );
  }

  return (
    process.env.SHOPIFY_DISCOUNT_FUNCTION_ID_DEVELOPMENT?.trim() ||
    process.env.SHOPIFY_DISCOUNT_FUNCTION_ID_STAGING?.trim() ||
    process.env.SHOPIFY_DISCOUNT_FUNCTION_ID?.trim() ||
    ''
  );
}

export const DISCOUNT_FUNCTION_ID = resolveDiscountFunctionId();

export const WRITE_DISCOUNTS_SCOPE_ERROR =
  'Bundle saved, but SmartBundle AI Discount could not be registered because the app is missing the write_discounts scope. Add write_discounts to the active Shopify app config, reinstall the app, and try again.';

export const MISSING_DISCOUNT_FUNCTION_ID_ERROR =
  'Bundle saved, but SmartBundle AI Discount could not be registered because no deployed Product Discount function ID is configured. Set SHOPIFY_DISCOUNT_FUNCTION_ID, SHOPIFY_DISCOUNT_FUNCTION_ID_STAGING, or SHOPIFY_DISCOUNT_FUNCTION_ID_PRODUCTION for the active environment.';

export function getSmartBundleDiscountFunctionId() {
  return DISCOUNT_FUNCTION_ID;
}
