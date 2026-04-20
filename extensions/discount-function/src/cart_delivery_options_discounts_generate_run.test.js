import { describe, it, expect } from "vitest";

import { cartDeliveryOptionsDiscountsGenerateRun } from "./cart_delivery_options_discounts_generate_run";

const DELIVERY_DISCOUNT_SELECTION_STRATEGY_ALL = "ALL";
const SHIPPING_DISCOUNT_CLASS = "SHIPPING";

describe("cartDeliveryOptionsDiscountsGenerateRun", () => {
  const baseInput = {
    cart: {
      deliveryGroups: [
        {
          id: "gid://shopify/DeliveryGroup/0",
        },
      ],
    },
    discount: {
      discountClasses: [],
    },
  };

  it("returns empty operations when no discount classes are present", () => {
    const input = {
      ...baseInput,
      discount: {
        discountClasses: [],
      },
    };

    const result = cartDeliveryOptionsDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(0);
  });

  it("returns delivery discount when shipping discount class is present", () => {
    const input = {
      ...baseInput,
      discount: {
        discountClasses: [SHIPPING_DISCOUNT_CLASS],
      },
    };

    const result = cartDeliveryOptionsDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      deliveryDiscountsAdd: {
        candidates: [
          {
            message: "FREE DELIVERY",
            targets: [
              {
                deliveryGroup: {
                  id: "gid://shopify/DeliveryGroup/0",
                },
              },
            ],
            value: {
              percentage: {
                value: 100,
              },
            },
          },
        ],
        selectionStrategy: DELIVERY_DISCOUNT_SELECTION_STRATEGY_ALL,
      },
    });
  });

  it("returns empty operations when no delivery groups are present", () => {
    const input = {
      cart: {
        deliveryGroups: [],
      },
      discount: {
        discountClasses: [SHIPPING_DISCOUNT_CLASS],
      },
    };

    expect(cartDeliveryOptionsDiscountsGenerateRun(input)).toEqual({
      operations: [],
    });
  });
});
