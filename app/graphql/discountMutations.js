/**
 * GraphQL Mutations for Discount Management
 * Based on latest Shopify Admin API: https://shopify.dev/docs/api/admin-graphql/latest/mutations/discountAutomaticAppCreate
 */

import { SMART_BUNDLE_DISCOUNT_TITLE } from '../constants/discounts.server.js';

/**
 * Check if a 'SmartBundle AI' discount already exists
 * Prevents duplicate discount registration
 */
export const QUERY_EXISTING_DISCOUNTS = `#graphql
  query getExistingSmartBundleDiscounts {
    automaticDiscountNodes(first: 25, query: "title:'${SMART_BUNDLE_DISCOUNT_TITLE}'") {
      edges {
        node {
          id
          discount {
            ... on DiscountAutomaticApp {
              title
              status
              appDiscountType {
                functionId
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Create an automatic discount managed by the app
 * Required scope: write_discounts
 * Reference: https://shopify.dev/docs/api/admin-graphql/latest/mutations/discountAutomaticAppCreate
 */
export const CREATE_AUTOMATIC_APP_DISCOUNT = `#graphql
  mutation discountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
      userErrors {
        field
        message
      }
      automaticAppDiscount {
        id
        discountId
        title
        status
        startsAt
        endsAt
        appDiscountType {
          appKey
          functionId
        }
        combinesWith {
          orderDiscounts
          productDiscounts
          shippingDiscounts
        }
      }
    }
  }
`;

/**
 * Build the discount creation variables
 * @param {string} functionId - The Shopify Function ID
 * @param {string} title - Discount title (default: "SmartBundle AI Discount")
 * @param {object} options - Additional options (combinesWith, metafields, endsAt)
 * @returns {object} GraphQL mutation variables
 */
export function buildDiscountVariables(functionId, title = SMART_BUNDLE_DISCOUNT_TITLE, options = {}) {
  const now = new Date();
  const startsAt = now.toISOString();

  const defaultCombinesWith = {
    orderDiscounts: false,
    productDiscounts: false,
    shippingDiscounts: false,
  };

  return {
    automaticAppDiscount: {
      title,
      functionId,
      startsAt,
      combinesWith: options.combinesWith || defaultCombinesWith,
      ...(options.endsAt && { endsAt: options.endsAt }),
      ...(options.metafields && { metafields: options.metafields }),
    },
  };
}
