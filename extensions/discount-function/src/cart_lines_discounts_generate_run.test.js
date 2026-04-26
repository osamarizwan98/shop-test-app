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

// The GraphQL query aliases shop.metafield as activeBundlesConfig:
//   shop { activeBundlesConfig: metafield(namespace: "smart_bundle", key: "active_bundles") { jsonValue } }
// All shop bundle configs must use the activeBundlesConfig key to match the runtime path
// the Validator reads: this.input?.shop?.activeBundlesConfig?.jsonValue
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
      activeBundlesConfig: {
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
  // ─── Guard rails ──────────────────────────────────────────────────────────

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

  // ─── Percentage bundles ───────────────────────────────────────────────────

  it("applies percentage discount to all bundle lines", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        cart: {
          cost: { subtotalAmount: { amount: "50" } },
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
              subtotalAmount: 20,
            }),
          ],
        },
        shop: {
          activeBundlesConfig: {
            jsonValue: [
              {
                id: "bundle-pct",
                title: "SB_Percentage Bundle",
                products: [
                  { id: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/1011" },
                  { id: "gid://shopify/Product/202", variantId: "gid://shopify/ProductVariant/2022" },
                ],
                SB_tiers: [{ SB_minimumQuantity: 1, SB_type: "percentage", SB_value: 15 }],
              },
            ],
          },
        },
      }),
    );

    expect(result.operations).toHaveLength(1);
    const candidate = result.operations[0].productDiscountsAdd.candidates[0];
    expect(candidate.message).toBe("SB_Percentage Bundle - 15% Off Applied");
    expect(candidate.value).toEqual({ percentage: { value: 15 } });
    expect(candidate.targets).toHaveLength(2);
  });

  it("applies the highest matching tier when multiple tiers qualify", () => {
    // Base input: 2x each product → appliedSets = 2
    // Tiers: [{min:1, 10%}, {min:2, 15%}] — both qualify, must pick 15%
    const result = cartLinesDiscountsGenerateRun(buildBaseInput());

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toEqual({
      productDiscountsAdd: {
        candidates: [
          {
            message: "SB_A + B Bundle - 15% Off Applied",
            targets: [
              { cartLine: { id: "gid://shopify/CartLine/1", quantity: 2 } },
              { cartLine: { id: "gid://shopify/CartLine/2", quantity: 2 } },
            ],
            value: { percentage: { value: 15 } },
          },
        ],
        selectionStrategy: PRODUCT_DISCOUNT_SELECTION_STRATEGY_FIRST,
      },
    });
  });

  // ─── Fixed amount bundles ─────────────────────────────────────────────────

  it("applies fixed_amount discount with dollar message and correct amount", () => {
    // 1 set, $10 fixed → amount = 10 * 1 = 10
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        cart: {
          cost: { subtotalAmount: { amount: "50" } },
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
              subtotalAmount: 20,
            }),
          ],
        },
        shop: {
          activeBundlesConfig: {
            jsonValue: [
              {
                id: "bundle-fixed",
                title: "SB_Fixed Bundle",
                products: [
                  { id: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/1011" },
                  { id: "gid://shopify/Product/202", variantId: "gid://shopify/ProductVariant/2022" },
                ],
                SB_tiers: [{ SB_minimumQuantity: 1, SB_type: "fixed_amount", SB_value: 10 }],
              },
            ],
          },
        },
      }),
    );

    expect(result.operations).toHaveLength(1);
    const candidate = result.operations[0].productDiscountsAdd.candidates[0];
    expect(candidate.message).toBe("SB_Fixed Bundle - $10 Off Applied");
    expect(candidate.value).toEqual({ fixedAmount: { amount: 10 } });
    expect(candidate.targets).toHaveLength(2);
  });

  it("falls back to legacy single-tier bundle config", () => {
    // Legacy format: top-level type + value, no SB_tiers array
    // value: 5, appliedSets: 2 → fixedAmount.amount = 5 * 2 = 10
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        shop: {
          activeBundlesConfig: {
            jsonValue: [
              {
                id: "bundle-legacy",
                title: "SB_Legacy Bundle",
                type: "fixed",
                value: 5,
                products: [
                  { id: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/1011" },
                  { id: "gid://shopify/Product/202", variantId: "gid://shopify/ProductVariant/2022" },
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
            message: "SB_Legacy Bundle - $5 Off Applied",
            targets: [
              { cartLine: { id: "gid://shopify/CartLine/1", quantity: 2 } },
              { cartLine: { id: "gid://shopify/CartLine/2", quantity: 2 } },
            ],
            value: { fixedAmount: { amount: 10 } },
          },
        ],
        selectionStrategy: PRODUCT_DISCOUNT_SELECTION_STRATEGY_FIRST,
      },
    });
  });

  // ─── BOGO ─────────────────────────────────────────────────────────────────

  it("applies BOGO 100% discount to the cheapest eligible line only", () => {
    // Product A: $30/unit (more expensive), Product B: $20/unit (cheaper)
    // BOGO must free exactly 1 unit of the cheaper item (CartLine/2)
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        cart: {
          cost: { subtotalAmount: { amount: "50" } },
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
              subtotalAmount: 20,
            }),
          ],
        },
        shop: {
          activeBundlesConfig: {
            jsonValue: [
              {
                id: "bundle-bogo",
                title: "SB_BOGO Bundle",
                type: "bogo",
                products: [
                  { id: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/1011" },
                  { id: "gid://shopify/Product/202", variantId: "gid://shopify/ProductVariant/2022" },
                ],
              },
            ],
          },
        },
      }),
    );

    expect(result.operations).toHaveLength(1);
    const candidate = result.operations[0].productDiscountsAdd.candidates[0];
    expect(candidate.message).toBe("SB_BOGO Bundle - Free Item Applied");
    expect(candidate.value).toEqual({ percentage: { value: 100 } });
    // Only the cheapest line is targeted, at quantity 1
    expect(candidate.targets).toHaveLength(1);
    expect(candidate.targets[0]).toEqual({
      cartLine: { id: "gid://shopify/CartLine/2", quantity: 1 },
    });
  });

  it("BOGO targets the more expensive line when it is cheaper per-unit", () => {
    // 2 units of A ($40 total → $20/unit), 1 unit of B ($25 total → $25/unit)
    // cheapest unit price is A ($20), so A's line gets the free item
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        cart: {
          cost: { subtotalAmount: { amount: "65" } },
          lines: [
            createLine({
              id: "gid://shopify/CartLine/1",
              quantity: 2,
              variantId: "gid://shopify/ProductVariant/1011",
              productId: "gid://shopify/Product/101",
              subtotalAmount: 40,
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
          activeBundlesConfig: {
            jsonValue: [
              {
                id: "bundle-bogo-unit",
                title: "SB_BOGO Unit",
                type: "bogo",
                products: [
                  { id: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/1011" },
                  { id: "gid://shopify/Product/202", variantId: "gid://shopify/ProductVariant/2022" },
                ],
              },
            ],
          },
        },
      }),
    );

    expect(result.operations).toHaveLength(1);
    const candidate = result.operations[0].productDiscountsAdd.candidates[0];
    expect(candidate.targets[0]).toEqual({
      cartLine: { id: "gid://shopify/CartLine/1", quantity: 1 },
    });
  });

  // ─── Tiered discount resolution (Feature 4) ───────────────────────────────

  it("selects the highest applicable tier for a volume bundle based on set count", () => {
    // Single-product bundle, 1 unit per set
    // tiers: [{min:2, 10%}, {min:3, 15%}, {min:5, 25%}]
    // cart has 3 units → appliedSets = 3 → qualifies for min:2 and min:3 → picks 15%
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        cart: {
          cost: { subtotalAmount: { amount: "90" } },
          lines: [
            createLine({
              id: "gid://shopify/CartLine/1",
              quantity: 3,
              variantId: "gid://shopify/ProductVariant/1011",
              productId: "gid://shopify/Product/101",
              subtotalAmount: 90,
            }),
          ],
        },
        shop: {
          activeBundlesConfig: {
            jsonValue: [
              {
                id: "bundle-volume",
                title: "SB_Volume Bundle",
                products: [
                  { id: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/1011", quantity: 1 },
                ],
                SB_tiers: [
                  { SB_minimumQuantity: 2, SB_type: "percentage", SB_value: 10 },
                  { SB_minimumQuantity: 3, SB_type: "percentage", SB_value: 15 },
                  { SB_minimumQuantity: 5, SB_type: "percentage", SB_value: 25 },
                ],
              },
            ],
          },
        },
      }),
    );

    expect(result.operations).toHaveLength(1);
    const candidate = result.operations[0].productDiscountsAdd.candidates[0];
    expect(candidate.message).toBe("SB_Volume Bundle - 15% Off Applied");
    expect(candidate.value).toEqual({ percentage: { value: 15 } });
    // All 3 targeted units are discounted
    expect(candidate.targets[0]).toEqual({
      cartLine: { id: "gid://shopify/CartLine/1", quantity: 3 },
    });
  });

  it("does not apply when tier requires sets that cart does not fully satisfy", () => {
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
          activeBundlesConfig: {
            jsonValue: [
              {
                id: "bundle-requires-two-sets",
                title: "SB_Requires 2 Sets",
                products: [
                  { id: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/1011" },
                  { id: "gid://shopify/Product/202", variantId: "gid://shopify/ProductVariant/2022" },
                ],
                SB_tiers: [
                  { SB_minimumQuantity: 2, SB_type: "percentage", SB_value: 10 },
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
    // Base cart: 2x each product → appliedSets = 2
    // Tier map {2: 10, 3: 15, 5: 25} → only tier min:2 qualifies → 10%
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        shop: {
          activeBundlesConfig: {
            jsonValue: [
              {
                id: "bundle-tier-map",
                title: "SB_Tier Map Bundle",
                products: [
                  { id: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/1011" },
                  { id: "gid://shopify/Product/202", variantId: "gid://shopify/ProductVariant/2022" },
                ],
                tiers: { 2: 10, 3: 15, 5: 25 },
              },
            ],
          },
        },
      }),
    );

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].productDiscountsAdd.candidates[0]).toMatchObject({
      message: "SB_Tier Map Bundle - 10% Off Applied",
      value: { percentage: { value: 10 } },
    });
  });

  // ─── Stacking policy ──────────────────────────────────────────────────────

  it("blocks bundle discount when no-stacking rule is enabled and external manual code exists", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        discount: {
          discountClasses: ["PRODUCT"],
          metafield: {
            jsonValue: { stackingPolicy: "no_manual_codes", maxDiscountCapPercent: 80 },
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
            jsonValue: { stackingPolicy: "no_manual_codes", maxDiscountCapPercent: 80 },
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
            jsonValue: { stackingPolicy: "no_manual_codes", maxDiscountCapPercent: 80 },
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

  // ─── Cap guard ────────────────────────────────────────────────────────────

  it("ignores fixed discounts that exceed the 80 percent order-value cap", () => {
    // Order subtotal = $100, cap = $80 — fixed discount of $81 must be rejected
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        cart: {
          cost: { subtotalAmount: { amount: "100" } },
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
          activeBundlesConfig: {
            jsonValue: [
              {
                id: "bundle-fixed-unsafe",
                title: "SB_Unsafe Fixed Bundle",
                products: [
                  { id: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/1011" },
                  { id: "gid://shopify/Product/202", variantId: "gid://shopify/ProductVariant/2022" },
                ],
                tiers: [{ minimumQuantity: 1, type: "fixed_amount", value: 81 }],
              },
            ],
          },
        },
      }),
    );

    expect(result).toEqual({ operations: [] });
  });

  it("respects merchant-defined maxDiscountCapPercent from discount metafield", () => {
    // Cap set to 50% of $100 = $50 — fixed discount of $55 must be rejected
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        discount: {
          discountClasses: ["PRODUCT"],
          metafield: {
            jsonValue: { stackingPolicy: "allow_all", maxDiscountCapPercent: 50 },
          },
        },
        shop: {
          activeBundlesConfig: {
            jsonValue: [
              {
                id: "bundle-tight-cap",
                title: "SB_Tight Cap Bundle",
                products: [
                  { id: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/1011" },
                  { id: "gid://shopify/Product/202", variantId: "gid://shopify/ProductVariant/2022" },
                ],
                tiers: [{ minimumQuantity: 1, type: "fixed_amount", value: 55 }],
              },
            ],
          },
        },
      }),
    );

    expect(result).toEqual({ operations: [] });
  });

  // ─── Variant fallback ─────────────────────────────────────────────────────

  it("matches by product when variants differ but product ids match", () => {
    // Bundle configured with variant 9999 and 8888, but cart has 1011 and 2022
    // Should still match because product ids 101 and 202 are shared
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        shop: {
          activeBundlesConfig: {
            jsonValue: [
              {
                id: "bundle-variant-mismatch",
                title: "SB_Variant-Specific Bundle",
                products: [
                  { id: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/9999" },
                  { id: "gid://shopify/Product/202", variantId: "gid://shopify/ProductVariant/8888" },
                ],
                SB_tiers: [{ SB_minimumQuantity: 1, SB_type: "percentage", SB_value: 10 }],
              },
            ],
          },
        },
      }),
    );

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].productDiscountsAdd.candidates[0]).toMatchObject({
      message: "SB_Variant-Specific Bundle - 10% Off Applied",
    });
  });

  it("counts same-product variant replacements when bundle item includes product id", () => {
    // Cart has variant 1012 (not 1011 configured in bundle) but same product 101
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        cart: {
          cost: { subtotalAmount: { amount: "80" } },
          lines: [
            createLine({
              id: "gid://shopify/CartLine/1",
              quantity: 1,
              variantId: "gid://shopify/ProductVariant/1012",
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
      }),
    );

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].productDiscountsAdd.candidates[0]).toMatchObject({
      message: "SB_A + B Bundle - 10% Off Applied",
    });
  });

  // ─── Partial sets / quantity overlap ─────────────────────────────────────

  it("applies discount only to full bundles when cart has partial extra quantity", () => {
    // 2x A + 1x B → only 1 full set possible (limited by B)
    // Targets must reflect qty:1 for both lines, not qty:2 for A
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        cart: {
          cost: { subtotalAmount: { amount: "120" } },
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
              quantity: 1,
              variantId: "gid://shopify/ProductVariant/2022",
              productId: "gid://shopify/Product/202",
              subtotalAmount: 30,
            }),
          ],
        },
        shop: {
          activeBundlesConfig: {
            jsonValue: [
              {
                id: "bundle-partial",
                title: "SB_Partial Bundle",
                products: [
                  { id: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/1011" },
                  { id: "gid://shopify/Product/202", variantId: "gid://shopify/ProductVariant/2022" },
                ],
                SB_tiers: [{ SB_minimumQuantity: 1, SB_type: "percentage", SB_value: 10 }],
              },
            ],
          },
        },
      }),
    );

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].productDiscountsAdd.candidates[0]).toMatchObject({
      targets: [
        { cartLine: { id: "gid://shopify/CartLine/1", quantity: 1 } },
        { cartLine: { id: "gid://shopify/CartLine/2", quantity: 1 } },
      ],
    });
  });

  it("prevents quantity overlap when multiple bundles target shared lines", () => {
    // 1x A + 1x B in cart, two bundles both require A+B
    // First bundle consumes the only set; second bundle must not produce a second candidate
    const result = cartLinesDiscountsGenerateRun(
      buildBaseInput({
        cart: {
          cost: { subtotalAmount: { amount: "100" } },
          lines: [
            createLine({
              id: "gid://shopify/CartLine/1",
              quantity: 1,
              variantId: "gid://shopify/ProductVariant/1011",
              productId: "gid://shopify/Product/101",
              subtotalAmount: 50,
            }),
            createLine({
              id: "gid://shopify/CartLine/2",
              quantity: 1,
              variantId: "gid://shopify/ProductVariant/2022",
              productId: "gid://shopify/Product/202",
              subtotalAmount: 50,
            }),
          ],
        },
        shop: {
          activeBundlesConfig: {
            jsonValue: [
              {
                id: "bundle-a",
                title: "SB_First",
                products: [
                  { id: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/1011" },
                  { id: "gid://shopify/Product/202", variantId: "gid://shopify/ProductVariant/2022" },
                ],
                SB_tiers: [{ SB_minimumQuantity: 1, SB_type: "percentage", SB_value: 10 }],
              },
              {
                id: "bundle-b",
                title: "SB_Second",
                products: [
                  { id: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/1011" },
                  { id: "gid://shopify/Product/202", variantId: "gid://shopify/ProductVariant/2022" },
                ],
                SB_tiers: [{ SB_minimumQuantity: 1, SB_type: "percentage", SB_value: 10 }],
              },
            ],
          },
        },
      }),
    );

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].productDiscountsAdd.candidates).toHaveLength(1);
  });
});
