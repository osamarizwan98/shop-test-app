import { describe, expect, it } from "vitest";

import { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run";

const PRODUCT_DISCOUNT_SELECTION_STRATEGY_FIRST = "FIRST";

function createLine({
  id,
  quantity,
  variantId,
  productId,
  subtotalAmount,
}) {
  return {
    id,
    quantity,
    cost: {
      subtotalAmount: {
        amount: String(subtotalAmount),
      },
    },
    merchandise: {
      __typename: "ProductVariant",
      id: variantId,
      product: {
        id: productId,
      },
    },
  };
}

function buildBaseInput(overrides = {}) {
  const base = {
    cart: {
      cost: {
        subtotalAmount: {
          amount: "100",
        },
      },
      lines: [
        createLine({
          id: "gid://shopify/CartLine/1",
          quantity: 2,
          variantId: "gid://shopify/ProductVariant/1011",
          productId: "gid://shopify/Product/101",
          subtotalAmount: 60,
        }),
        createLine({
          id: "gid://shopify/CartLine/2",
          quantity: 2,
          variantId: "gid://shopify/ProductVariant/2022",
          productId: "gid://shopify/Product/202",
          subtotalAmount: 40,
        }),
      ],
    },
    discount: {
      discountClasses: ["PRODUCT"],
      metafield: {
        jsonValue: {
          stackingPolicy: "allow_all",
          maxDiscountCapPercent: 80,
        },
      },
    },
    enteredDiscountCodes: [],
    triggeringDiscountCode: null,
    shop: {
      metafield: {
        jsonValue: [
          {
            id: "bundle-1",
            title: "SB_A + B Bundle",
            products: [
              {
                id: "gid://shopify/Product/101",
                variantId: "gid://shopify/ProductVariant/1011",
              },
              {
                id: "gid://shopify/Product/202",
                variantId: "gid://shopify/ProductVariant/2022",
              },
            ],
            SB_tiers: [
              {
                SB_minimumQuantity: 1,
                SB_type: "percentage",
                SB_value: 10,
              },
              {
                SB_minimumQuantity: 2,
                SB_type: "percentage",
                SB_value: 15,
              },
            ],
          },
        ],
      },
    },
  };

  return {
    ...base,
    ...overrides,
  };
}

describe("cartLinesDiscountsGenerateRun", () => {
  it("returns empty operations when cart lines are missing", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        cart: {
          cost: { subtotalAmount: { amount: "0" } },
          lines: [],
        },
      }),
    );

    expect(result).toEqual({ operations: [] });
  });

  it("returns empty operations when the discount class is not PRODUCT", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        discount: {
          discountClasses: ["ORDER"],
          metafield: { jsonValue: { stackingPolicy: "allow_all", maxDiscountCapPercent: 80 } },
        },
      }),
    );

    expect(result).toEqual({ operations: [] });
  });

  it("applies the highest matching tier to exact bundle variants", () => {
    const result = cartLinesDiscountsGenerateRun(buildBaseInput());

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toEqual({
      productDiscountsAdd: {
        candidates: [
          {
            message: "SB_A + B Bundle - 15% Off Applied",
            targets: [
              {
                cartLine: {
                  id: "gid://shopify/CartLine/1",
                  quantity: 2,
                },
              },
              {
                cartLine: {
                  id: "gid://shopify/CartLine/2",
                  quantity: 2,
                },
              },
            ],
            value: {
              percentage: {
                value: 15,
              },
            },
          },
        ],
        selectionStrategy: PRODUCT_DISCOUNT_SELECTION_STRATEGY_FIRST,
      },
    });
  });

  it("falls back to legacy single-tier bundle config", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        shop: {
          metafield: {
            jsonValue: [
              {
                id: "bundle-legacy",
                title: "SB_Legacy Bundle",
                type: "fixed",
                value: 5,
                products: [
                  {
                    id: "gid://shopify/Product/101",
                    variantId: "gid://shopify/ProductVariant/1011",
                  },
                  {
                    id: "gid://shopify/Product/202",
                    variantId: "gid://shopify/ProductVariant/2022",
                  },
                ],
              },
            ],
          },
        },
      }),
    );

    expect(result.operations[0]).toEqual({
      productDiscountsAdd: {
        candidates: [
          {
            message: "SB_Legacy Bundle - Bundle Savings Applied",
            targets: [
              {
                cartLine: {
                  id: "gid://shopify/CartLine/1",
                  quantity: 2,
                },
              },
              {
                cartLine: {
                  id: "gid://shopify/CartLine/2",
                  quantity: 2,
                },
              },
            ],
            value: {
              fixedAmount: {
                amount: 20,
              },
            },
          },
        ],
        selectionStrategy: PRODUCT_DISCOUNT_SELECTION_STRATEGY_FIRST,
      },
    });
  });

  it("applies mix-and-match tiers using total qualifying quantity", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        cart: {
          cost: { subtotalAmount: { amount: "55" } },
          lines: [
            createLine({
              id: "gid://shopify/CartLine/1",
              quantity: 1,
              variantId: "gid://shopify/ProductVariant/1011",
              productId: "gid://shopify/Product/101",
              subtotalAmount: 30,
            }),
            createLine({
              id: "gid://shopify/CartLine/2",
              quantity: 1,
              variantId: "gid://shopify/ProductVariant/2022",
              productId: "gid://shopify/Product/202",
              subtotalAmount: 25,
            }),
          ],
        },
        shop: {
          metafield: {
            jsonValue: [
              {
                id: "bundle-requires-two-sets",
                title: "SB_Requires 2 Sets",
                products: [
                  {
                    id: "gid://shopify/Product/101",
                    variantId: "gid://shopify/ProductVariant/1011",
                  },
                  {
                    id: "gid://shopify/Product/202",
                    variantId: "gid://shopify/ProductVariant/2022",
                  },
                ],
                SB_tiers: [
                  {
                    SB_minimumQuantity: 2,
                    SB_type: "percentage",
                    SB_value: 10,
                  },
                ],
              },
            ],
          },
        },
      }),
    );

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].productDiscountsAdd.candidates[0]).toMatchObject({
      message: "SB_Requires 2 Sets - 10% Off Applied",
      value: {
        percentage: {
          value: 10,
        },
      },
    });
  });

  it("blocks bundle discount when no-stacking rule is enabled and external manual code exists", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        discount: {
          discountClasses: ["PRODUCT"],
          metafield: {
            jsonValue: {
              stackingPolicy: "no_manual_codes",
              maxDiscountCapPercent: 80,
            },
          },
        },
        enteredDiscountCodes: [{ code: "WELCOME10", rejectable: true }],
      }),
    );

    expect(result).toEqual({ operations: [] });
  });

  it("allows bundle discount when the only entered code is the triggering function code", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        discount: {
          discountClasses: ["PRODUCT"],
          metafield: {
            jsonValue: {
              stackingPolicy: "no_manual_codes",
              maxDiscountCapPercent: 80,
            },
          },
        },
        triggeringDiscountCode: "SBBUNDLE",
        enteredDiscountCodes: [{ code: "sbbundle", rejectable: true }],
      }),
    );

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].productDiscountsAdd.candidates).toHaveLength(1);
  });

  it("blocks bundle discount when an external manual code is entered alongside triggering code", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        discount: {
          discountClasses: ["PRODUCT"],
          metafield: {
            jsonValue: {
              stackingPolicy: "no_manual_codes",
              maxDiscountCapPercent: 80,
            },
          },
        },
        triggeringDiscountCode: "SBBUNDLE",
        enteredDiscountCodes: [
          { code: "SBBUNDLE", rejectable: true },
          { code: "SPRING15", rejectable: true },
        ],
      }),
    );

    expect(result).toEqual({ operations: [] });
  });

  it("ignores fixed discounts that exceed the 80 percent order-value cap", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        cart: {
          cost: {
            subtotalAmount: {
              amount: "100",
            },
          },
          lines: [
            createLine({
              id: "gid://shopify/CartLine/1",
              quantity: 1,
              variantId: "gid://shopify/ProductVariant/1011",
              productId: "gid://shopify/Product/101",
              subtotalAmount: 40,
            }),
            createLine({
              id: "gid://shopify/CartLine/2",
              quantity: 1,
              variantId: "gid://shopify/ProductVariant/2022",
              productId: "gid://shopify/Product/202",
              subtotalAmount: 40,
            }),
          ],
        },
        shop: {
          metafield: {
            jsonValue: [
              {
                id: "bundle-fixed-unsafe",
                title: "SB_Unsafe Fixed Bundle",
                products: [
                  {
                    id: "gid://shopify/Product/101",
                    variantId: "gid://shopify/ProductVariant/1011",
                  },
                  {
                    id: "gid://shopify/Product/202",
                    variantId: "gid://shopify/ProductVariant/2022",
                  },
                ],
                tiers: [
                  {
                    minimumQuantity: 1,
                    type: "fixed_amount",
                    value: 81,
                  },
                ],
              },
            ],
          },
        },
      }),
    );

    expect(result).toEqual({ operations: [] });
  });

  it("respects merchant-defined maxDiscountCapPercent from discount metafield", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        discount: {
          discountClasses: ["PRODUCT"],
          metafield: {
            jsonValue: {
              stackingPolicy: "allow_all",
              maxDiscountCapPercent: 50,
            },
          },
        },
        shop: {
          metafield: {
            jsonValue: [
              {
                id: "bundle-tight-cap",
                title: "SB_Tight Cap Bundle",
                products: [
                  {
                    id: "gid://shopify/Product/101",
                    variantId: "gid://shopify/ProductVariant/1011",
                  },
                  {
                    id: "gid://shopify/Product/202",
                    variantId: "gid://shopify/ProductVariant/2022",
                  },
                ],
                tiers: [
                  {
                    minimumQuantity: 1,
                    type: "fixed_amount",
                    value: 55,
                  },
                ],
              },
            ],
          },
        },
      }),
    );

    expect(result).toEqual({ operations: [] });
  });

  it("does not match a bundle when variants differ", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        shop: {
          metafield: {
            jsonValue: [
              {
                id: "bundle-variant-mismatch",
                title: "SB_Variant-Specific Bundle",
                products: [
                  {
                    id: "gid://shopify/Product/101",
                    variantId: "gid://shopify/ProductVariant/9999",
                  },
                  {
                    id: "gid://shopify/Product/202",
                    variantId: "gid://shopify/ProductVariant/8888",
                  },
                ],
                SB_tiers: [
                  {
                    SB_minimumQuantity: 1,
                    SB_type: "percentage",
                    SB_value: 10,
                  },
                ],
              },
            ],
          },
        },
      }),
    );

    expect(result).toEqual({ operations: [] });
  });

  it("supports tier maps from metafield JSON objects", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        shop: {
          metafield: {
            jsonValue: [
              {
                id: "bundle-tier-map",
                title: "SB_Tier Map Bundle",
                products: [
                  {
                    id: "gid://shopify/Product/101",
                    variantId: "gid://shopify/ProductVariant/1011",
                  },
                  {
                    id: "gid://shopify/Product/202",
                    variantId: "gid://shopify/ProductVariant/2022",
                  },
                ],
                tiers: {
                  2: 10,
                  3: 15,
                  5: 25,
                },
              },
            ],
          },
        },
      }),
    );

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].productDiscountsAdd.candidates[0]).toMatchObject({
      message: "SB_Tier Map Bundle - 15% Off Applied",
      value: {
        percentage: {
          value: 15,
        },
      },
    });
  });
});
