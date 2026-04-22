# SmartBundle AI — Project Context

## Tech Stack
- **Framework:** React Router v7 (Vite-based)
- **UI Architecture:** Standard JSX + Scoped Custom CSS (Strictly **NO** @shopify/polaris)
- **Database:** Prisma + SQLite (Development)
- **Auth:** Shopify OAuth via `shopify.server.js` (authenticate.admin)
- **Functions:** Shopify Functions (Discount API / `cart_lines`)
- **Styling Rule:** All CSS classes must use `SB_` prefix to avoid conflicts.

## Completed Features
- **Shopify OAuth / App Installation:** Full handshake and session storage. ✅
- **Prisma Schema:** Database models for `Bundle`, `Analytics`, and `BundleAnalytics` defined and migrated. ✅
- **Discount Function:** Core logic for `cart_lines` implemented in the Shopify Function extension. ✅
- **Webhooks:** Handlers for `orders/create` (attribution), `app/uninstalled`, and `products/delete`. ✅
- **Analytics Service:** `analytics.server.js` logic for tracking revenue and views. ✅
- **Theme Extension:** Storefront bridge with `bundle-offer.liquid` and `sb-logic.js`. ✅
- **Bundle Creation Route:** `app.bundles.new.jsx` for creating new bundle offers. ✅
- **Inventory Awareness:** Basic logic to check variant stock before displaying bundles. ✅
- **Progress Bar:** Front-end component for gamified discount tracking. ✅

## Pending Features
- **Bundle List Page (`app.bundles.jsx`):** Management dashboard to view/delete existing bundles.
- **Bundle Edit Route (`app.bundles.$id.jsx`):** Editing functionality for active bundles.
- **Analytics Dashboard (`app._index.jsx`):** Custom High-conversion dashboard with revenue charts (Custom CSS).
- **Volume Tiers:** Adding quantity-based logic (Buy 2, Save 10%) to the Discount Function.
- **Onboarding Flow:** Automated demo bundle generation script for new installs.
- **Theme Integration Audit:** Final CSS isolation and compatibility check across major themes.

## Code Rules (ALWAYS follow these)
- NO @shopify/polaris imports
- NO s- web component tags
- Use normal JSX + CSS only
- React Router hooks: useLoaderData, useActionData, Form
- Auth pattern: authenticate.admin(request) from shopify.server.js
- Check if file already exists before creating
- Only update files which are necessary
- Under 150 lines per file unless absolutely necessary
- If Shopify-specific issue: refer shopify.dev/docs

## File Structure Key Files
- `app/db.server.js` → Centralized Prisma client.
- `app/shopify.server.js` → Shopify Auth & Configuration.
- `app/services/analytics.server.js` → Revenue & Attribution logic.
- `app/services/bundle.server.js` → Bundle CRUD operations.
- `app/utils/bundleValidation.server.js` → Logic for bundle integrity.
- `prisma/schema.prisma` → Database Source of Truth.