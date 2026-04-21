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

describe("cartLinesDiscountsGenerateRun", () => {
  const baseInput = {
    cart: {
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
    },
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

  it("returns empty operations when cart lines are missing", () => {
    const result = cartLinesDiscountsGenerateRun({
      ...baseInput,
      cart: { lines: [] },
    });

    expect(result).toEqual({ operations: [] });
  });

  it("returns empty operations when the discount class is not PRODUCT", () => {
    const result = cartLinesDiscountsGenerateRun({
      ...baseInput,
      discount: { discountClasses: ["ORDER"] },
    });

    expect(result).toEqual({ operations: [] });
  });

  it("applies the highest matching tier to exact bundle variants", () => {
    const result = cartLinesDiscountsGenerateRun(baseInput);

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toEqual({
      productDiscountsAdd: {
        candidates: [
          {
            message: "SB_A + B Bundle",
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
    const result = cartLinesDiscountsGenerateRun({
      ...baseInput,
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
    });

    expect(result.operations[0]).toEqual({
      productDiscountsAdd: {
        candidates: [
          {
            message: "SB_Legacy Bundle",
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
                amount: 10,
              },
            },
          },
        ],
        selectionStrategy: PRODUCT_DISCOUNT_SELECTION_STRATEGY_FIRST,
      },
    });
  });

  it("ignores bundle rules that exceed the 90 percent safety guard", () => {
    const result = cartLinesDiscountsGenerateRun({
      ...baseInput,
      shop: {
        metafield: {
          jsonValue: [
            {
              id: "bundle-unsafe",
              title: "SB_Unsafe Bundle",
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
                  SB_value: 95,
                },
              ],
            },
          ],
        },
      },
    });

    expect(result).toEqual({ operations: [] });
  });

  it("ignores fixed discounts that would exceed 90 percent of the targeted subtotal", () => {
    const result = cartLinesDiscountsGenerateRun({
      ...baseInput,
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
                  value: 55,
                },
                {
                  minimumQuantity: 2,
                  type: "fixed_amount",
                  value: 50,
                },
              ],
            },
          ],
        },
      },
    });

    expect(result).toEqual({ operations: [] });
  });

  it("does not match a bundle when only the parent products are shared but the variants differ", () => {
    const result = cartLinesDiscountsGenerateRun({
      ...baseInput,
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
    });

    expect(result).toEqual({ operations: [] });
  });
});
