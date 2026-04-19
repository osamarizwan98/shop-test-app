import { describe, expect, it, vi } from "vitest";

import { ProductDiscountSelectionStrategy } from "../generated/api";
import { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run";

describe("cartLinesDiscountsGenerateRun", () => {
  const baseInput = {
    cart: {
      lines: [
        {
          id: "gid://shopify/CartLine/1",
          quantity: 4,
          merchandise: {
            __typename: "ProductVariant",
            product: {
              id: "gid://shopify/Product/101",
            },
          },
        },
        {
          id: "gid://shopify/CartLine/2",
          quantity: 4,
          merchandise: {
            __typename: "ProductVariant",
            product: {
              id: "gid://shopify/Product/202",
            },
          },
        },
      ],
    },
    shop: {
      metafield: {
        jsonValue: [
          {
            id: "bundle-1",
            title: "A + B Bundle",
            type: "percentage",
            value: 10,
            products: [
              "gid://shopify/Product/101",
              "gid://shopify/Product/202",
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

  it("returns empty operations when the metafield is missing", () => {
    const result = cartLinesDiscountsGenerateRun({
      ...baseInput,
      shop: { metafield: null },
    });

    expect(result).toEqual({ operations: [] });
  });

  it("returns empty operations when metafield JSON is not an array", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = cartLinesDiscountsGenerateRun({
      ...baseInput,
      shop: {
        metafield: {
          jsonValue: "not-an-array",
        },
      },
    });

    expect(result).toEqual({ operations: [] });
    expect(errorSpy).toHaveBeenCalledTimes(0);

    errorSpy.mockRestore();
  });

  it("applies a percentage bundle to only the qualifying cart-line quantities", () => {
    const result = cartLinesDiscountsGenerateRun(baseInput);

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toEqual({
      productDiscountsAdd: {
        candidates: [
          {
            message: "A + B Bundle",
            targets: [
              {
                cartLine: {
                  id: "gid://shopify/CartLine/1",
                  quantity: 4,
                },
              },
              {
                cartLine: {
                  id: "gid://shopify/CartLine/2",
                  quantity: 4,
                },
              },
            ],
            value: {
              percentage: {
                value: 10,
              },
            },
          },
        ],
        selectionStrategy: ProductDiscountSelectionStrategy.First,
      },
    });
  });

  it("supports fixed amount bundles and scales the discount by complete set count", () => {
    const result = cartLinesDiscountsGenerateRun({
      ...baseInput,
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 2,
            merchandise: {
              __typename: "ProductVariant",
              product: {
                id: "gid://shopify/Product/101",
              },
            },
          },
          {
            id: "gid://shopify/CartLine/2",
            quantity: 3,
            merchandise: {
              __typename: "ProductVariant",
              product: {
                id: "gid://shopify/Product/202",
              },
            },
          },
        ],
      },
      shop: {
        metafield: {
          jsonValue: [
            {
              id: "bundle-2",
              title: "Fixed Bundle",
              type: "fixed",
              value: 5,
              products: [
              "gid://shopify/Product/101",
              "gid://shopify/Product/202",
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
            message: "Fixed Bundle",
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
        selectionStrategy: ProductDiscountSelectionStrategy.First,
      },
    });
  });

  it("ignores inactive or incomplete bundles", () => {
    const result = cartLinesDiscountsGenerateRun({
      ...baseInput,
      shop: {
        metafield: {
          jsonValue: [
            {
              id: "bundle-3",
              title: "Inactive Bundle",
              type: "percentage",
              value: 150,
              products: [
              "gid://shopify/Product/101",
              "gid://shopify/Product/202",
              ],
            },
            {
              id: "bundle-4",
              title: "Missing Product Bundle",
              type: "percentage",
              value: 20,
              products: [
                "gid://shopify/Product/101",
                "gid://shopify/Product/999",
              ],
            },
          ],
        },
      },
    });

    expect(result).toEqual({ operations: [] });
  });
});
