const DELIVERY_DISCOUNT_SELECTION_STRATEGY_ALL = "ALL";
const SHIPPING_DISCOUNT_CLASS = "SHIPPING";

const EMPTY_RESULT = {
  operations: [],
};

// [START discount-function.run.delivery]
export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  const deliveryGroups = input?.cart?.deliveryGroups ?? [];
  const discountClasses = input?.discount?.discountClasses ?? [];
  const firstDeliveryGroup = deliveryGroups[0];

  if (!firstDeliveryGroup) {
    return EMPTY_RESULT;
  }

  const hasShippingDiscountClass = discountClasses.includes(
    SHIPPING_DISCOUNT_CLASS,
  );

  if (!hasShippingDiscountClass) {
    return EMPTY_RESULT;
  }

  return {
    operations: [
      {
        deliveryDiscountsAdd: {
          candidates: [
            {
              message: "FREE DELIVERY",
              targets: [
                {
                  deliveryGroup: {
                    id: firstDeliveryGroup.id,
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
      },
    ],
  };
}
// [END discount-function.run.delivery]
