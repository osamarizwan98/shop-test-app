/**
 * Discount Registration Service
 * Manages automatic discount creation and duplicate prevention
 */

import {
  QUERY_EXISTING_DISCOUNTS,
  CREATE_AUTOMATIC_APP_DISCOUNT,
  buildDiscountVariables,
} from '../graphql/discountMutations.js';

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
      console.error('GraphQL query error:', data.errors);
      return { exists: false, discount: null, error: data.errors[0].message };
    }

    const edges = data?.data?.automaticDiscountNodes?.edges || [];

    if (edges.length > 0) {
      const discount = edges[0].node.discount;
      return {
        exists: true,
        discount,
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
    // Step 1: Check if discount already exists
    const { exists, discount: existingDiscount, error: checkError } = await checkExistingSmartBundleDiscount(admin);

    if (checkError) {
      return { success: false, discountId: null, error: checkError };
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
    const variables = buildDiscountVariables(functionId, 'SmartBundle AI Discount', options);

    // Step 3: Execute mutation
    const response = await admin.graphql(CREATE_AUTOMATIC_APP_DISCOUNT, { variables });
    const data = await response.json();

    // Step 4: Handle GraphQL errors
    if (data.errors) {
      const errorMessage = data.errors[0]?.message || 'Unknown GraphQL error';

      // Check for permission errors
      if (errorMessage.includes('write_discounts')) {
        return {
          success: false,
          discountId: null,
          error: 'Missing write_discounts scope. Update your shopify.app.toml scopes.',
        };
      }

      return { success: false, discountId: null, error: errorMessage };
    }

    // Step 5: Handle mutation-level errors
    const { userErrors, automaticAppDiscount } = data?.data?.discountAutomaticAppCreate || {};

    if (userErrors && userErrors.length > 0) {
      const errorMessages = userErrors.map((err) => `${err.field}: ${err.message}`).join(', ');
      return { success: false, discountId: null, error: errorMessages };
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
      discountId: automaticAppDiscount.id,
      discount: automaticAppDiscount,
      message: `SmartBundle AI discount registered successfully (ID: ${automaticAppDiscount.discountId})`,
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
