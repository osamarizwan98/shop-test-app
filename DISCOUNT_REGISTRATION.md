# SmartBundle AI - Discount Function Registration Guide

## Overview

This guide explains how to register the SmartBundle AI automatic discount function with your Shopify store using the Shopify Admin API's `discountAutomaticAppCreate` mutation.

**Documentation Reference:** https://shopify.dev/docs/api/admin-graphql/latest/mutations/discountAutomaticAppCreate

## Architecture

### Files Created

1. **`app/graphql/discountMutations.js`**
   - GraphQL mutations for discount operations
   - Latest Shopify Admin API queries and mutations
   - Utility functions for building mutation variables

2. **`app/services/discountService.server.js`**
   - `checkExistingSmartBundleDiscount()` - Prevents duplicate discount registration
   - `registerSmartBundleDiscount()` - Registers the automatic discount
   - Comprehensive error handling with permission checks

3. **`app/routes/app.bundles.new.jsx`**
   - Integrated discount registration into bundle creation flow
   - Handles discount registration after bundle metafield sync
   - Non-blocking error handling (bundle creation succeeds even if discount registration fails)

## Required Scope

✅ **Already configured in `shopify.app.toml`:**

```toml
scopes = "write_products,write_metaobjects,write_metaobject_definitions,write_discounts"
```

The `write_discounts` scope is **required** for discount creation.

## Setup Instructions

### Step 1: Deploy Your Discount Function

```bash
npm run deploy
```

This deploys your Shopify Function extension. Note the **Function ID** from the output (format: `a3cdef66-d84a-4254-9216-b6dd723005ad`)

### Step 2: Set Environment Variable

Add the function ID to your `.env.local` file:

```env
SHOPIFY_DISCOUNT_FUNCTION_ID=a3cdef66-d84a-4254-9216-b6dd723005ad
```

Replace with your actual function ID from Step 1.

### Step 3: Create a Bundle

When you create a bundle via the admin UI:

1. Go to **SmartBundle AI** → **Create Bundle**
2. Configure your bundle (title, discount, products)
3. Submit the form

The action handler will:
- ✅ Save bundle to database
- ✅ Sync active bundles to Shopify metafields
- ✅ **Automatically register the discount function** (if not already registered)

## How It Works

### Flow Diagram

```
Bundle Creation Form Submitted
         ↓
   Validate Inputs
         ↓
Check Product Collisions
         ↓
    Save to Database
         ↓
Sync Metafields to Shopify
         ↓
Check for Existing SmartBundle Discount
         ├─ YES (Active) → Skip registration ✓
         └─ NO → Register new discount
         ↓
Return Success Response
```

### Key Features

**1. Duplicate Prevention**
```javascript
// Checks if 'SmartBundle AI' discount already exists
const { exists, discount } = await checkExistingSmartBundleDiscount(admin);
if (exists && discount.status === 'ACTIVE') {
  return { duplicate: true, discountId: discount.id };
}
```

**2. Error Handling**
- ✅ Missing `write_discounts` scope
- ✅ GraphQL errors (network, syntax)
- ✅ Mutation-level errors (validation)
- ✅ Function ID not found

**3. Non-Blocking Failures**
- Bundle creation succeeds even if discount registration fails
- Users can manually register discount from Shopify Admin
- Warnings logged to server console

## Function Configuration

### Generated Discount Settings

```javascript
{
  "title": "SmartBundle AI Discount",
  "functionId": "a3cdef66-d84a-4254-9216-b6dd723005ad",
  "startsAt": "2026-04-20T14:30:00Z",  // Current timestamp
  "combinesWith": {
    "orderDiscounts": false,
    "productDiscounts": false,
    "shippingDiscounts": false
  }
}
```

### Customize Configuration

To customize discount settings, modify the call in `app/routes/app.bundles.new.jsx`:

```javascript
const discountResult = await registerSmartBundleDiscount(admin, functionId, {
  combinesWith: {
    orderDiscounts: true,    // Allow combining with order discounts
    productDiscounts: false,
    shippingDiscounts: false,
  },
  endsAt: "2026-12-31T23:59:59Z",  // Set expiration date
  metafields: [
    {
      namespace: "default",
      key: "bundle_config",
      type: "json",
      value: JSON.stringify({ /* your config */ })
    }
  ]
});
```

## Troubleshooting

### ❌ "Missing write_discounts scope"

**Problem:** The app doesn't have permission to create discounts.

**Solution:**
1. Update `shopify.app.toml`:
   ```toml
   scopes = "...,write_discounts"
   ```
2. Reinstall the app in your development store
3. Verify in Shopify Admin → Apps → SmartBundle AI → Configuration

### ❌ "SHOPIFY_DISCOUNT_FUNCTION_ID not set"

**Problem:** Environment variable not configured.

**Solution:**
1. Deploy function: `npm run deploy`
2. Copy function ID from output
3. Add to `.env.local`:
   ```env
   SHOPIFY_DISCOUNT_FUNCTION_ID=your-function-id
   ```
4. Restart dev server: `npm run dev`

### ❌ "SmartBundle AI discount already exists"

**Expected behavior.** The function detects existing active discount and skips registration (prevents duplicates).

**To create a new discount:**
1. Go to Shopify Admin → Discounts → SmartBundle AI Discount
2. Deactivate or delete the existing discount
3. Create a new bundle to register a fresh discount

### ❌ Discount Not Appearing in Admin

**Solution:**
1. Check server logs for errors
2. Verify function ID is correct
3. Refresh Shopify Admin page
4. Check Discounts section → All Discounts (filter by "SmartBundle AI")

## API Reference

### `registerSmartBundleDiscount(admin, functionId, options)`

**Parameters:**
- `admin` (object) - Shopify Admin API client
- `functionId` (string) - Function ID from shopify.app.toml
- `options` (object, optional) - Custom configuration
  - `combinesWith` - Discount combination rules
  - `endsAt` - Discount expiration date
  - `metafields` - Custom metadata

**Returns:**
```javascript
{
  success: boolean,
  discountId: string | null,
  discount: object | null,  // Full discount object
  error: string | null,
  duplicate: boolean,       // True if already exists
  message: string
}
```

### `checkExistingSmartBundleDiscount(admin)`

**Returns:**
```javascript
{
  exists: boolean,
  discount: object | null,  // Existing discount details
  error: string | null
}
```

## Best Practices

1. **Always set `SHOPIFY_DISCOUNT_FUNCTION_ID`** before using discount features
2. **Test in development store first** before pushing to production
3. **Monitor server logs** for discount registration errors
4. **Combine with metafield sync** to ensure discount logic receives proper bundle data
5. **Use non-combinable discounts** by default to avoid double discounting

## Related Resources

- [Shopify Discount Function API](https://shopify.dev/docs/api/admin-graphql/latest/mutations/discountAutomaticAppCreate)
- [Shopify Functions Guide](https://shopify.dev/docs/apps/build/functions)
- [Discount Function Extension](https://shopify.dev/docs/apps/build/discounts/build-discount-function)

## Support

For issues or questions:
1. Check this documentation
2. Review server logs in terminal
3. Check Shopify Admin → Discounts section
4. Consult [Shopify Developer Docs](https://shopify.dev/docs)
