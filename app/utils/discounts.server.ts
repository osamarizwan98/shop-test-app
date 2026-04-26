// Reads the Shopify Function ID from env based on deployment environment.
// Set SHOPIFY_DISCOUNT_FUNCTION_ID_PRODUCTION / _STAGING / base in .env.
export function getDiscountFunctionId(): string {
  const env = process.env.NODE_ENV;
  if (env === "production") {
    return process.env.SHOPIFY_DISCOUNT_FUNCTION_ID_PRODUCTION!;
  }
  if (env === "staging") {
    return process.env.SHOPIFY_DISCOUNT_FUNCTION_ID_STAGING!;
  }
  return process.env.SHOPIFY_DISCOUNT_FUNCTION_ID!;
}

// Shape expected by registerShopifyDiscount.
// Matches the fields the Prisma Bundle model currently exposes.
interface BundleInput {
  id: string;
  title: string;
  discountType: string;
  discountValue: number;
}

interface UserError {
  field: string[];
  message: string;
}

const CREATE_AUTOMATIC_DISCOUNT_MUTATION = `#graphql
  mutation CreateAutomaticDiscount($input: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $input) {
      automaticAppDiscount {
        discountId
        title
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_AUTOMATIC_DISCOUNT_MUTATION = `#graphql
  mutation DeleteAutomaticDiscount($id: ID!) {
    discountAutomaticDelete(id: $id) {
      deletedAutomaticDiscountId
      userErrors {
        field
        message
      }
    }
  }
`;

// Creates a Shopify automatic app discount for the given bundle.
// The discount's metafield stores function-level config (stacking policy,
// discount cap) that the Shopify Function reads via discount.metafield.
// Bundle product data is kept in the shop metafield via syncBundlesToShopify.
// Returns the Shopify discountId (gid://shopify/DiscountAutomaticApp/…).
export async function registerShopifyDiscount(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<{ json: () => Promise<{ data?: Record<string, unknown> }> }> },
  bundle: BundleInput,
): Promise<string> {
  const functionId = getDiscountFunctionId();

  // Per-discount metafield read by parseFunctionConfig in the Shopify Function.
  // Defaults: no stacking restriction, 80% cap.
  const functionConfig = {
    stackingPolicy: "allow_all",
    allowManualCodeStacking: true,
    maxDiscountCapPercent: 80,
  };

  const response = await admin.graphql(CREATE_AUTOMATIC_DISCOUNT_MUTATION, {
    variables: {
      input: {
        functionId,
        title: bundle.title,
        startsAt: new Date().toISOString(),
        combinesWith: {
          orderDiscounts: true,
          productDiscounts: false,
          shippingDiscounts: true,
        },
        metafields: [
          {
            namespace: "app",
            key: "bundle_definitions",
            type: "json",
            value: JSON.stringify(functionConfig),
          },
        ],
      },
    },
  });

  const { data } = await response.json();

  const userErrors: UserError[] =
    (data?.discountAutomaticAppCreate as { userErrors?: UserError[] })?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(
      `Failed to create Shopify discount for bundle "${bundle.title}": ` +
        userErrors.map((e) => e.message).join(", "),
    );
  }

  const discountId = (
    data?.discountAutomaticAppCreate as {
      automaticAppDiscount?: { discountId?: string };
    }
  )?.automaticAppDiscount?.discountId;

  if (!discountId) {
    throw new Error(
      `Failed to create Shopify discount for bundle "${bundle.title}": no discountId returned`,
    );
  }

  return discountId;
}

// Deletes a Shopify automatic app discount by its GID.
// Call this when a bundle is deactivated or deleted so the discount stops
// being evaluated at checkout.
export async function deleteShopifyDiscount(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<{ json: () => Promise<{ data?: Record<string, unknown> }> }> },
  discountId: string,
): Promise<void> {
  const response = await admin.graphql(DELETE_AUTOMATIC_DISCOUNT_MUTATION, {
    variables: { id: discountId },
  });

  const { data } = await response.json();

  const userErrors: UserError[] =
    (data?.discountAutomaticDelete as { userErrors?: UserError[] })?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(
      `Failed to delete Shopify discount "${discountId}": ` +
        userErrors.map((e) => e.message).join(", "),
    );
  }
}
