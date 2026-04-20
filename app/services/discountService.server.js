/**
 * Discount Registration Service
 * Manages automatic discount creation and duplicate prevention
 */

import {
  QUERY_EXISTING_DISCOUNTS,
  CREATE_AUTOMATIC_APP_DISCOUNT,
  buildDiscountVariables,
} from '../graphql/discountMutations.js';
import {
  SMART_BUNDLE_DISCOUNT_TITLE,
  WRITE_DISCOUNTS_SCOPE_ERROR,
} from '../constants/discounts.server.js';

function formatGraphQLErrorMessage(errors = []) {
  return errors
    .map((error) => error?.message)
    .filter(Boolean)
    .join(', ');
}

function formatUserErrorMessage(userErrors = []) {
  return userErrors
    .map(({ field, message }) => {
      const fieldName = Array.isArray(field) ? field.join('.') : field;
      return fieldName ? `${fieldName}: ${message}` : message;
    })
    .filter(Boolean)
    .join(', ');
}

function isWriteDiscountsScopeError(message = '') {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes('write_discounts') || normalizedMessage.includes('access denied');
}

/**
 * Check if SmartBundle AI discount already exists
 * @param {object} admin - Shopify Admin API client
 * @returns {object} { exists: boolean, discount: object | null }
 */
export async function checkExistingSmartBundleDiscount(admin) {
  try {
    const response = await admin.graphql(QUERY_EXISTING_DISCOUNTS);
    const data = await response.json();

    if (data.errors) {
      const errorMessage = formatGraphQLErrorMessage(data.errors);
      console.error('GraphQL query error:', data.errors);

      if (isWriteDiscountsScopeError(errorMessage)) {
        return {
          exists: false,
          discount: null,
          error: WRITE_DISCOUNTS_SCOPE_ERROR,
          code: 'MISSING_WRITE_DISCOUNTS_SCOPE',
        };
      }

      return {
        exists: false,
        discount: null,
        error: errorMessage,
      };
    }

    const edges = data?.data?.automaticDiscountNodes?.edges || [];
    const activeDiscount = edges
      .map(({ node }) => ({
        id: node.id,
        ...(node.discount || {}),
      }))
      .find(
        (discount) =>
          discount?.title === SMART_BUNDLE_DISCOUNT_TITLE &&
          discount?.status === 'ACTIVE',
      );

    if (activeDiscount) {
      return {
        exists: true,
        discount: activeDiscount,
        error: null,
      };
    }

    return { exists: false, discount: null, error: null };
  } catch (error) {
    console.error('Error checking existing discounts:', error);
    return {
      exists: false,
      discount: null,
      error: `Failed to check existing discounts: ${error.message}`,
    };
  }
}

/**
 * Register SmartBundle AI automatic discount
 * @param {object} admin - Shopify Admin API client
 * @param {string} functionId - Shopify Function ID from shopify.app.toml
 * @param {object} options - Additional configuration options
 * @returns {object} { success: boolean, discountId: string | null, error: string | null }
 */
export async function registerSmartBundleDiscount(admin, functionId, options = {}) {
  try {
    if (!functionId) {
      return {
        success: false,
        discountId: null,
        error:
          'Missing Shopify Function ID. Set SHOPIFY_DISCOUNT_FUNCTION_ID to your deployed Product Discount function ID.',
      };
    }

    // Step 1: Check if discount already exists
    const {
      exists,
      discount: existingDiscount,
      error: checkError,
      code: checkErrorCode,
    } = await checkExistingSmartBundleDiscount(admin);

    if (checkError) {
      return { success: false, discountId: null, error: checkError, code: checkErrorCode };
    }

    if (exists && existingDiscount?.status === 'ACTIVE') {
      return {
        success: true,
        discountId: existingDiscount.id,
        message: 'SmartBundle AI discount already exists and is active',
        duplicate: true,
      };
    }

    // Step 2: Build mutation variables
    const variables = buildDiscountVariables(functionId, SMART_BUNDLE_DISCOUNT_TITLE, options);

    // Step 3: Execute mutation
    const response = await admin.graphql(CREATE_AUTOMATIC_APP_DISCOUNT, { variables });
    const data = await response.json();

    // Step 4: Handle GraphQL errors
    if (data.errors) {
      const errorMessage = formatGraphQLErrorMessage(data.errors) || 'Unknown GraphQL error';

      // Check for permission errors
      if (isWriteDiscountsScopeError(errorMessage)) {
        return {
          success: false,
          discountId: null,
          error: WRITE_DISCOUNTS_SCOPE_ERROR,
          code: 'MISSING_WRITE_DISCOUNTS_SCOPE',
        };
      }

      return { success: false, discountId: null, error: errorMessage };
    }

    // Step 5: Handle mutation-level errors
    const { userErrors, automaticAppDiscount } = data?.data?.discountAutomaticAppCreate || {};

    if (userErrors && userErrors.length > 0) {
      const errorMessage = formatUserErrorMessage(userErrors);

      if (isWriteDiscountsScopeError(errorMessage)) {
        return {
          success: false,
          discountId: null,
          error: WRITE_DISCOUNTS_SCOPE_ERROR,
          code: 'MISSING_WRITE_DISCOUNTS_SCOPE',
        };
      }

      return { success: false, discountId: null, error: errorMessage };
    }

    if (!automaticAppDiscount?.id) {
      return {
        success: false,
        discountId: null,
        error: 'Discount created but ID not returned. Please verify in Shopify Admin.',
      };
    }

    return {
      success: true,
      discountId: automaticAppDiscount.discountId || automaticAppDiscount.id,
      discount: automaticAppDiscount,
      message: `SmartBundle AI discount registered successfully (ID: ${automaticAppDiscount.discountId || automaticAppDiscount.id})`,
    };
  } catch (error) {
    console.error('Error registering SmartBundle discount:', error);
    return {
      success: false,
      discountId: null,
      error: `Failed to register discount: ${error.message}`,
    };
  }
}
