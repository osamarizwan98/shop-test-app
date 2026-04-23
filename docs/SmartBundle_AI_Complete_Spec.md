# SmartBundle AI — Complete Feature Specification for Code Agents

> **App Type:** Shopify Public App (Embedded, Built for Shopify standards)  
> **Stack:** React Router v7 + Shopify Polaris + Prisma + Shopify GraphQL Admin API + Shopify Functions  
> **Template:** `shopify app init --template=https://github.com/Shopify/shopify-app-template-react-router`  
> **Purpose:** Increase AOV via Bundles, Upsells, Cross-sells  
> **Revenue Target:** $500–$700/month via 20–30 paying merchants  

> ⚠️ **No Express. No separate backend.** React Router v7 loaders/actions handle all server-side logic. Remix has merged into React Router v7 — use `react-router` imports everywhere.

---

## TABLE OF CONTENTS

1. [Design System & Color Tokens](#1-design-system--color-tokens)
2. [Reusable UI Components](#2-reusable-ui-components)
3. [Feature 1 — AI Predictive Bundle Suggestions](#3-feature-1--ai-predictive-bundle-suggestions-phase-3)
4. [Feature 2 — Smart Analytics & Revenue Dashboard](#4-feature-2--smart-analytics--revenue-dashboard-phase-1-mvp)
5. [Feature 3 — Shopify Functions Discount Engine](#5-feature-3--shopify-functions-discount-engine-phase-1-mvp)
6. [Feature 4 — Tiered Volume Discounts](#6-feature-4--tiered-volume-discounts-phase-1-mvp)
7. [Feature 5 — Frequently Bought Together Block](#7-feature-5--frequently-bought-together-fbt-block-phase-1-mvp)
8. [Feature 6 — Post-Purchase One-Click Upsell](#8-feature-6--post-purchase-one-click-upsell-phase-2)
9. [Feature 7 — Gamified Cart Progress Bar](#9-feature-7--gamified-cart-progress-bar-phase-1-mvp)
10. [Feature 8 — Cart-Page Bundle Reminder](#10-feature-8--cart-page-bundle-reminder-smart-upsell-nudge-phase-1-mvp)
11. [Feature 9 — Inventory-Aware Auto-Hide](#11-feature-9--inventory-aware-auto-hide-phase-1-mvp)
12. [Feature 10 — No-Code Bundle Styling Engine](#12-feature-10--no-code-bundle-styling-engine-phase-2)
13. [Feature 11 — A/B Testing Module](#13-feature-11--ab-testing-module-phase-3)
14. [Feature 12 — Bundle Share Link Generator](#14-feature-12--bundle-share-link-generator-phase-2)
15. [Feature 13 — Multi-Currency & Shopify Markets Support](#15-feature-13--multi-currency--shopify-markets-support-phase-2)
16. [Database Schema](#16-database-schema)
17. [API Endpoints Reference](#17-api-endpoints-reference)
18. [Development Roadmap](#18-development-roadmap)
19. [Pricing Plans & Feature Gates](#19-pricing-plans--feature-gates)
20. [Critical Implementation Rules](#20-critical-implementation-rules)

---

## 1. Design System & Color Tokens

### CSS Variables (apply globally in `:root`)

```css
:root {
  /* Primary — Green (main action color) */
  --primary:        #10B981;
  --primary-hover:  #059669;
  --primary-light:  #D1FAE5;
  --primary-dark:   #047857;

  /* Secondary — Blue (links, info actions) */
  --secondary:       #3B82F6;
  --secondary-hover: #2563EB;
  --secondary-light: #DBEAFE;

  /* Backgrounds */
  --background:         #F9FAFB;   /* page bg */
  --background-section: #F3F4F6;   /* sidebar, section bg */
  --card:               #FFFFFF;   /* content cards */
  --hover-bg:           #F1F5F9;   /* row/card hover state */

  /* Text */
  --text-primary:   #111827;  /* headings, main content */
  --text-secondary: #6B7280;  /* descriptions, subtitles */
  --text-muted:     #9CA3AF;  /* disabled, placeholder */
  --text-inverted:  #FFFFFF;  /* text on dark bg */

  /* Borders */
  --border:       #E5E7EB;
  --border-strong:#D1D5DB;
  --divider:      #F3F4F6;

  /* Accent — Amber (highlights, badges, warnings) */
  --accent:       #F59E0B;
  --accent-light: #FEF3C7;
  --accent-dark:  #D97706;

  /* Status colors */
  --success:     #10B981;
  --error:       #EF4444;
  --error-light: #FEE2E2;
  --warning:     #F59E0B;
  --info:        #3B82F6;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.08);
}
```

### Layout Rules
- **Page background** → `var(--background)`
- **Sidebar / section panels** → `var(--background-section)`
- **Content cards** → `var(--card)` with `var(--border)` and `var(--shadow-sm)`
- **Headings** → `var(--text-primary)` | **Descriptions** → `var(--text-secondary)` | **Disabled** → `var(--text-muted)`
- Style: Shopify Polaris-aligned — minimal, clean, no overuse of primary color
- Accent (`--accent`) only for highlights, badges, urgency elements

---

## 2. Reusable UI Components

All components must be built as standalone React files in `components/ui/`. Each component uses CSS variables only — no hardcoded color values.

---

### 2A. Button Component (`Button.jsx`)

**Props:** `variant` (`primary` | `secondary` | `ghost` | `danger`), `size` (`sm` | `md` | `lg`), `loading` (bool), `disabled` (bool), `onClick`, `children`

```
Primary Button:
  background: var(--primary)
  color: var(--text-inverted)
  hover: background → var(--primary-hover)
  disabled: opacity 0.5, cursor not-allowed

Secondary Button:
  background: transparent
  border: 1px solid var(--border)
  color: var(--text-primary)
  hover: background → var(--hover-bg)

Ghost Button:
  background: transparent
  border: none
  color: var(--secondary)
  hover: color → var(--secondary-hover)

Danger Button:
  background: var(--error)
  color: var(--text-inverted)
  hover: opacity 0.9

Loading state: show spinner inside button, disable clicks
```

---

### 2B. Card Component (`Card.jsx`)

**Props:** `title`, `subtitle`, `actions` (JSX), `padding` (`sm`|`md`|`lg`), `hoverable` (bool), `children`

```
background: var(--card)
border: 1px solid var(--border)
border-radius: 8px
box-shadow: var(--shadow-sm)
hoverable → on hover: background: var(--hover-bg), box-shadow: var(--shadow-md)
```

---

### 2C. Input Component (`Input.jsx`)

**Props:** `label`, `placeholder`, `value`, `onChange`, `error` (string), `helper` (string), `type`, `prefix`, `suffix`, `disabled`

```
border: 1px solid var(--border)
border-radius: 6px
focus: border-color → var(--secondary), box-shadow: 0 0 0 2px var(--secondary-light)
error state: border-color → var(--error), show error message below in var(--error)
disabled: background → var(--background-section), cursor: not-allowed
```

---

### 2D. Badge Component (`Badge.jsx`)

**Props:** `variant` (`success` | `discount` | `inactive` | `info` | `warning`), `children`

```
success:  background: var(--primary-light),  color: var(--primary-dark)
discount: background: var(--accent-light),   color: var(--accent-dark)
inactive: background: var(--background-section), color: var(--text-muted)
info:     background: var(--secondary-light), color: var(--secondary-hover)
warning:  background: var(--accent-light),   color: var(--accent-dark)
```

---

### 2E. Table Component (`DataTable.jsx`)

**Props:** `columns` (array of `{key, label, render}`), `data` (array), `loading` (bool), `emptyMessage` (string)

```
header row:
  background: var(--background-section)
  color: var(--text-secondary)
  font-weight: 600
  border-bottom: 1px solid var(--border)

data row:
  hover: background → var(--hover-bg)
  border-bottom: 1px solid var(--divider)

loading: show skeleton rows (3 animated placeholder rows)
empty: center-aligned message in var(--text-muted)
```

---

### 2F. Notification / Toast Component (`Toast.jsx`)

**Props:** `type` (`success` | `error` | `warning` | `info`), `message`, `duration` (default 4000ms), `onClose`

```
success: left border 4px solid var(--success), icon ✓
error:   left border 4px solid var(--error),   icon ✕
warning: left border 4px solid var(--warning), icon ⚠
info:    left border 4px solid var(--info),    icon ℹ
Position: top-right, fixed
Auto-dismiss after `duration` ms
```

---

### 2G. Chart Colors

When using recharts or chart.js, always use:
```js
const CHART_COLORS = {
  revenue:  'var(--primary)',   // #10B981
  clicks:   'var(--secondary)', // #3B82F6
  warnings: 'var(--accent)',    // #F59E0B
  error:    'var(--error)',     // #EF4444
}
```

---

## 3. Feature 1 — AI Predictive Bundle Suggestions (Phase 3)

**Category:** AI Feature | **Priority:** High | **Plan Gate:** Pro

### What It Does
Analyzes store's Shopify order history to find co-purchase patterns and auto-suggests high-converting bundle combinations. Merchant reviews and one-click approves/rejects.

### Backend Implementation

#### Data Pipeline
```
1. Trigger: Merchant clicks "Analyze Store" OR cron job (weekly)
2. Fetch last 90 days of orders via Shopify Admin GraphQL:
   - orders { lineItems { productId, variantId, quantity } }
3. Build co-occurrence matrix:
   - For each order, generate all product pairs
   - Count how often each pair appears together
4. Score bundles:
   - confidence = pair_orders / total_orders_with_product_A
   - lift = confidence / (frequency_B / total_orders)
5. Filter: confidence > 0.15, lift > 1.2, minimum 5 co-occurrences
6. Save top 20 suggestions to DB with scores
7. Seasonal weight: multiply score × 1.3 if product sold more in current month last year
```

#### GraphQL Query (Shopify Admin API)
```graphql
query GetOrders($cursor: String) {
  orders(first: 250, after: $cursor, query: "created_at:>2024-01-01") {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        lineItems(first: 20) {
          edges {
            node {
              product { id title }
              variant { id }
              quantity
            }
          }
        }
      }
    }
  }
}
```

#### API Endpoints
```
POST /api/ai/analyze          → trigger analysis job (async, returns jobId)
GET  /api/ai/status/:jobId    → poll job status (pending|running|done|failed)
GET  /api/ai/suggestions      → fetch top suggestions from DB
POST /api/ai/suggestions/:id/approve   → merchant approves → creates live bundle
POST /api/ai/suggestions/:id/reject    → mark rejected, never show again
DELETE /api/ai/suggestions/:id         → remove suggestion
```

#### DB Model: `AiSuggestion`
```js
{
  shopDomain: String,       // required
  productA: { id, title, imageUrl },
  productB: { id, title, imageUrl },
  confidence: Number,       // 0–1
  lift: Number,
  coOccurrenceCount: Number,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  bundleId: ObjectId,       // populated after approval
  generatedAt: Date,
  updatedAt: Date
}
```

### Frontend (Admin UI)

**Page:** `/app/ai-suggestions`

**Layout:**
```
Header: "AI Bundle Suggestions"
Subtitle: "Based on your last 90 days of orders"
[Analyze Store] button (primary) → triggers POST /api/ai/analyze
  → show progress spinner with status polling every 3s

Suggestion Cards (grid, 2 columns):
  Each card shows:
  - Product A image + name
  - "+" icon
  - Product B image + name
  - Confidence badge: "87% confidence" (var(--primary-light))
  - Lift badge: "2.3x lift" (var(--accent-light))
  - Co-occurrence: "Bought together 34 times"
  - [Create Bundle ✓] button (primary)
  - [Dismiss ✕] button (ghost)

Empty state: "Click 'Analyze Store' to discover your best bundle opportunities"
```

---

## 4. Feature 2 — Smart Analytics & Revenue Dashboard (Phase 1 MVP)

**Category:** Analytics | **Priority:** Critical | **Plan Gate:** All plans

### What It Does
Shows merchants exactly how much revenue SmartBundle generated. This is the #1 retention feature — merchant sees value, stays subscribed.

### Backend Implementation

#### Data Collection (Event Tracking)
Every storefront interaction must fire events to backend:

```js
// Events to track (fired from storefront JS snippet):
'bundle_viewed'      → { bundleId, productId, sessionId, timestamp }
'bundle_clicked'     → { bundleId, productId, sessionId }
'bundle_added_cart'  → { bundleId, items: [], totalValue, discountApplied }
'bundle_purchased'   → { bundleId, orderId, revenue, discountAmount }
'fbt_viewed'         → { productId, suggestedProductIds[] }
'fbt_added'          → { productId, addedProductId, cartValue }
'upsell_shown'       → { orderId, offeredProductId, price }
'upsell_accepted'    → { orderId, productId, revenue }
```

#### Metrics to Calculate
```
total_bundle_revenue    = SUM(bundle_purchased.revenue)
bundle_conversion_rate  = bundle_purchased / bundle_viewed × 100
revenue_uplift          = total_bundle_revenue / total_store_revenue × 100
avg_order_value_bundle  = AVG(order value where bundle was in cart)
avg_order_value_normal  = AVG(order value where no bundle)
top_bundles             = GROUP BY bundleId, ORDER BY revenue DESC, LIMIT 5
daily_revenue           = GROUP BY date(timestamp)
```

#### Route: `app/routes/app.analytics.tsx`
```ts
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "30d";

  const since = getPeriodStart(period); // utility: returns Date
  const [summary, topBundles, chartData] = await Promise.all([
    getAnalyticsSummary(session.shop, since),
    getTopBundles(session.shop, since, 5),
    getChartData(session.shop, since),
  ]);
  return json({ summary, topBundles, chartData, period });
}

export async function action({ request }: ActionFunctionArgs) {
  // Receive storefront events (batched)
  const { session } = await authenticate.admin(request);
  const { events } = await request.json();
  await prisma.analyticsEvent.createMany({
    data: events.map((e: any) => ({ ...e, shopDomain: session.shop }))
  });
  return json({ ok: true });
}
```

#### DB Model: `AnalyticsEvent`
```js
{
  shopDomain: String,
  event: String,           // enum of event types above
  bundleId: ObjectId,
  sessionId: String,
  orderId: String,
  revenue: Number,
  discountAmount: Number,
  metadata: Object,        // flexible extra data
  timestamp: { type: Date, index: true }
}
// Index: { shopDomain: 1, event: 1, timestamp: -1 }
```

### Frontend (Admin UI)

**Page:** `/app/analytics`

**Layout:**

```
Period Selector: [7 Days] [30 Days] [90 Days] — tab style

── Row 1: KPI Cards (4 columns) ────────────────────────
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Bundle Revenue  │ │ Conversion Rate │ │ Revenue Uplift  │ │ Avg Order Value │
│ $1,240          │ │ 4.2%            │ │ +18%            │ │ $68 vs $41      │
│ ↑ +12% vs prev │ │ ↑ +0.5%         │ │                 │ │ bundle vs normal│
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘

── Row 2: Revenue Chart ─────────────────────────────────
Line chart: Daily bundle revenue over selected period
Colors: revenue line → var(--primary), area fill → var(--primary-light) at 20% opacity

── Row 3: Two columns ───────────────────────────────────
Left (60%): Top 5 Bundles Leaderboard
  Table columns: Rank, Bundle Name, Revenue, Conversions, Conv. Rate
  #1 row highlighted with var(--primary-light) background

Right (40%): Bundle vs Non-Bundle AOV
  Bar chart comparing avg order value
  Bundle bar: var(--primary) | Normal bar: var(--secondary)
```

**Empty state (new installs):** "Your analytics will appear after your first bundle sale. Set up your first bundle to get started." + [Create Bundle] button

---

## 5. Feature 3 — Shopify Functions Discount Engine (Phase 1 MVP)

**Category:** Technical | **Priority:** Critical | **Plan Gate:** All plans

### What It Does
Applies all bundle discounts natively inside Shopify checkout using Shopify Functions. Zero front-end hacks. Reliable discount application always.

### Implementation

#### Shopify Function Setup
```
Function type: product_discounts
File: extensions/smart-bundle-discount/src/run.js
```

#### Function Logic (`run.js`)
```js
import { DiscountApplicationStrategy } from "../generated/api";

export function run(input) {
  const { cart, discountNode } = input;
  const config = JSON.parse(discountNode.metafield?.value ?? "{}");
  // config shape: { bundles: [{ id, products: [], discountType, discountValue, minQty }] }

  const discounts = [];

  for (const bundle of config.bundles) {
    if (!bundle.active) continue;

    const cartProductIds = cart.lines.map(l => l.merchandise.product.id);
    const bundleProductIds = bundle.products.map(p => p.id);

    // Check: all bundle products present in cart
    const allPresent = bundleProductIds.every(pid => cartProductIds.includes(pid));
    if (!allPresent) continue;

    // Calculate discount per line
    for (const line of cart.lines) {
      const isInBundle = bundleProductIds.includes(line.merchandise.product.id);
      if (!isInBundle) continue;

      let discountAmount;
      if (bundle.discountType === 'percentage') {
        discountAmount = {
          percentage: { value: bundle.discountValue }
        };
      } else if (bundle.discountType === 'fixed') {
        discountAmount = {
          fixedAmount: { amount: String(bundle.discountValue / bundleProductIds.length) }
        };
      } else if (bundle.discountType === 'bogo') {
        // Buy X Get Y: apply 100% to cheapest item
        // Handled separately — see BOGO logic below
        continue;
      }

      discounts.push({
        message: bundle.title,
        targets: [{ cartLine: { id: line.id } }],
        value: discountAmount
      });
    }
  }

  return {
    discounts,
    discountApplicationStrategy: DiscountApplicationStrategy.First
  };
}
```

#### BOGO Logic (separate handler inside run.js)
```js
// For BOGO bundles: find all eligible lines, sort by price ASC, apply 100% to cheapest
function applyBogo(lines, bundle) {
  const eligibleLines = lines
    .filter(l => bundle.products.map(p=>p.id).includes(l.merchandise.product.id))
    .sort((a,b) => parseFloat(a.cost.amountPerQuantity.amount) - parseFloat(b.cost.amountPerQuantity.amount));

  if (eligibleLines.length < 2) return null;
  const freeItem = eligibleLines[0];
  return {
    message: bundle.title + " (Free Item)",
    targets: [{ cartLine: { id: freeItem.id } }],
    value: { percentage: { value: "100" } }
  };
}
```

#### Discount Config Storage
Bundle discount config stored in Shopify Metafield on the Discount object:
```
namespace: "smartbundle"
key: "config"
type: "json"
```

#### Route: `app/routes/app.bundles.$id.tsx` (handles discount registration)
```ts
export async function action({ request, params }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "register-discount") {
    const bundle = await prisma.bundle.findFirst({
      where: { id: params.id, shopDomain: session.shop },
      include: { products: true }
    });
    if (!bundle) throw json({ error: "Not found" }, { status: 404 });

    const discountId = await registerShopifyDiscount(admin, bundle);
    await prisma.bundle.update({
      where: { id: params.id },
      data: { shopifyDiscountId: discountId, active: true }
    });
    return json({ success: true });
  }

  if (intent === "deactivate") {
    const bundle = await prisma.bundle.findFirst({ where: { id: params.id } });
    if (bundle?.shopifyDiscountId) {
      await deleteShopifyDiscount(admin, bundle.shopifyDiscountId);
    }
    await prisma.bundle.update({ where: { id: params.id }, data: { active: false } });
    return json({ success: true });
  }
}
```

#### GraphQL: Create Automatic Discount
```graphql
mutation CreateAutomaticDiscount($input: DiscountAutomaticAppInput!) {
  discountAutomaticAppCreate(automaticAppDiscount: $input) {
    automaticAppDiscount {
      discountId
      title
      status
    }
    userErrors { field message }
  }
}
```

#### Environment Variables Required
```
SHOPIFY_DISCOUNT_FUNCTION_ID=             # from: shopify app deploy
SHOPIFY_DISCOUNT_FUNCTION_ID_STAGING=     # staging env
SHOPIFY_DISCOUNT_FUNCTION_ID_PRODUCTION=  # production env
```

#### Reading Function ID in Loader/Action
```ts
// app/utils/discounts.server.ts
export function getDiscountFunctionId() {
  const env = process.env.NODE_ENV;
  if (env === "production") return process.env.SHOPIFY_DISCOUNT_FUNCTION_ID_PRODUCTION!;
  if (env === "staging")    return process.env.SHOPIFY_DISCOUNT_FUNCTION_ID_STAGING!;
  return process.env.SHOPIFY_DISCOUNT_FUNCTION_ID!;
}
```

---

## 6. Feature 4 — Tiered Volume Discounts (Phase 1 MVP)

**Category:** Revenue | **Priority:** High | **Plan Gate:** Starter+

### What It Does
Merchants set quantity-based discount tiers (e.g., buy 2 = 10% off, buy 3 = 15%, buy 5 = 25%). Customers see a progress bar on product page showing how close they are to next tier.

### Data Model: `TieredDiscount`
```js
{
  shopDomain: String,
  name: String,
  applyTo: { type: String, enum: ['bundle', 'collection', 'product'] },
  targetId: String,       // bundleId / collectionId / productId
  tiers: [{
    minQuantity: Number,  // e.g., 2
    discountType: { type: String, enum: ['percentage', 'fixed'] },
    discountValue: Number // e.g., 10 (for 10% or $10)
  }],                     // max 5 tiers
  active: Boolean,
  shopifyDiscountId: String,
  createdAt: Date
}
```

### Route: `app/routes/app.tiered-discounts.tsx`
```ts
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const discounts = await prisma.tieredDiscount.findMany({
    where: { shopDomain: session.shop },
    include: { tiers: true }
  });
  return json({ discounts });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") { /* create + activate */ }
  if (intent === "update") { /* update config + update Shopify discount */ }
  if (intent === "delete") { /* delete Shopify discount + delete from DB */ }
  if (intent === "activate") { /* push to Shopify Functions */ }
}
```

### Shopify Function: Tiered Discount Handler
Extend the same discount function (Feature 3) to handle tiered logic:
```js
// Inside run.js, add tiered discount handler:
for (const tiered of config.tieredDiscounts) {
  if (!tiered.active) continue;

  for (const line of cart.lines) {
    const matches = tieredMatchesLine(line, tiered); // check productId/collectionId
    if (!matches) continue;

    const applicableTier = tiered.tiers
      .filter(t => line.quantity >= t.minQuantity)
      .sort((a,b) => b.minQuantity - a.minQuantity)[0]; // highest applicable tier

    if (!applicableTier) continue;

    discounts.push({
      message: `Buy ${applicableTier.minQuantity}+ — ${applicableTier.discountValue}% Off`,
      targets: [{ cartLine: { id: line.id } }],
      value: { percentage: { value: String(applicableTier.discountValue) } }
    });
  }
}
```

### Storefront Widget: Tier Progress Bar

**Inject via Theme App Extension or ScriptTag into product pages:**

```
Visual: Horizontal progress bar

Example for tiers: 2=10%, 3=15%, 5=25%

[●──────────────────────────] 
 1    2     3         5
      10%   15%       25%

Current qty marker (green dot) moves as user changes quantity
Below bar: "Add 1 more to unlock 15% off" (dynamic message)

Logic:
- Current tier: highlight in var(--primary)
- Next tier: show in var(--accent) with "Add X more" text
- All tiers achieved: show "Maximum discount unlocked! 🎉"
```

### Frontend (Admin UI)

**Page:** `/app/tiered-discounts`
- List of all tiered discount rules
- [Create Tiered Discount] → modal/drawer
  - Name field
  - Apply to: Bundle | Collection | Product (dropdown)
  - Target selector (search field)
  - Tier builder: up to 5 rows, each row: Min Qty | Discount Type | Value | [Remove]
  - [Add Tier] button
  - Active toggle
  - [Save & Publish] button → calls activate endpoint

---

## 7. Feature 5 — Frequently Bought Together (FBT) Block (Phase 1 MVP)

**Category:** UX/Conversion | **Priority:** High | **Plan Gate:** All plans

### What It Does
Shows "Frequently Bought Together" widget on product pages with related products and combined savings. One-click adds all items to cart.

### Data Model: `FbtConfig`
```js
{
  shopDomain: String,
  productId: String,          // source product
  relatedProducts: [{
    productId: String,
    variantId: String,         // default variant
    title: String,
    price: Number,
    imageUrl: String,
    source: { type: String, enum: ['manual', 'ai'] }
  }],
  discountType: { type: String, enum: ['percentage', 'fixed', 'none'] },
  discountValue: Number,
  displayLocation: [{ type: String, enum: ['product_page', 'cart_drawer'] }],
  active: Boolean,
  createdAt: Date
}
```

### Backend API Endpoints
```
GET    /api/fbt                    → list all FBT configs
POST   /api/fbt                    → create new FBT config
PUT    /api/fbt/:id                → update
DELETE /api/fbt/:id                → delete
GET    /api/fbt/product/:productId → get FBT config for a specific product (used by storefront)
GET    /api/fbt/auto/:productId    → auto-suggest related products (from AI data if available, else Shopify recommendations API)
```

### Storefront Widget (Theme App Extension)

**File:** `extensions/fbt-block/blocks/fbt.liquid`

```
Layout:
┌────────────────────────────────────────────────────┐
│  Frequently Bought Together                        │
│                                                    │
│  [Product A Img]  +  [Product B Img]  +  [Product C Img] │
│  Main Product        Related 1           Related 2  │
│                                                    │
│  ☑ Product A — $29                                │
│  ☑ Product B — $19  (checked by default)          │
│  ☑ Product C — $24  (checked by default)          │
│                                                    │
│  Total: $72  →  $61.20  (Save $10.80 — 15% off)  │
│                                                    │
│  [Add All to Cart]  ← primary green button        │
└────────────────────────────────────────────────────┘
```

**Behavior:**
- Checkboxes: customer can uncheck items; total and savings recalculate dynamically
- "Add All to Cart" adds only checked items
- On mobile: stack vertically, products as horizontal scroll
- Fetch config from: `GET /api/fbt/product/:productId`
- After add-to-cart: show mini success toast, do NOT redirect

---

## 8. Feature 6 — Post-Purchase One-Click Upsell (Phase 2)

**Category:** Revenue | **Priority:** High | **Plan Gate:** Growth+

### What It Does
After customer completes checkout, show a special time-limited offer on the Thank You page. One click accepts and charges the same payment method — no re-entry needed.

### Implementation: Shopify Post-Purchase Extension

**Extension type:** `post_purchase_ui` (Checkout Extension)

**File:** `extensions/post-purchase/src/index.jsx`

#### Extension Logic
```jsx
import { extend, BlockStack, Button, CalloutBanner, Image, Text, Timer } from "@shopify/post-purchase-ui-extensions-react";

extend("Checkout::PostPurchase::Render", (root, api) => {
  const { storage, inputData, done, makePayment } = api;
  const offerData = storage.initialData; // pre-loaded offer
  // Render upsell UI (see below)
});

// Pre-load hook (runs server-side before Thank You page):
export async function shouldRender({ inputData, storage }) {
  const offer = await fetchOfferForOrder(inputData.initialPurchase);
  if (!offer) return { render: false };
  await storage.update(offer);
  return { render: true };
}
```

#### Offer Selection Logic (Backend)
```
POST /api/post-purchase/offer
  Body: { orderId, purchasedProductIds[], shopDomain }
  Logic:
    1. Find product most commonly bought after purchasing these products
    2. OR use manually configured post-purchase offers
    3. Apply exclusive discount (e.g., 20% off, not available elsewhere)
    4. Return: { productId, title, imageUrl, originalPrice, discountedPrice, discountLabel, expiresAt }
```

#### Upsell UI Layout
```
┌─────────────────────────────────────────────┐
│  🎉 Thank you for your order!               │
│                                             │
│  Special one-time offer — expires in:       │
│  [  0  ] : [  9  ] : [  4  5  ]           │
│   hrs       min       sec                   │
│                                             │
│  [Product Image]                            │
│  Product Name                               │
│  ~~$49.00~~  →  $39.00  (Save 20%)         │
│                                             │
│  [Yes, Add to My Order!]  ← primary button │
│  [No thanks]              ← ghost button   │
└─────────────────────────────────────────────┘
```

**Data Model: `PostPurchaseOffer`**
```js
{
  shopDomain: String,
  triggerProductIds: [String],  // purchased products that trigger this offer
  offerProductId: String,
  offerVariantId: String,
  discountType: String,          // 'percentage' | 'fixed'
  discountValue: Number,
  timerMinutes: { type: Number, default: 10 },
  active: Boolean,
  revenue: { type: Number, default: 0 },  // tracked separately
  acceptedCount: Number,
  shownCount: Number
}
```

---

## 9. Feature 7 — Gamified Cart Progress Bar (Phase 1 MVP)

**Category:** UX/Conversion | **Priority:** Medium-High | **Plan Gate:** All plans

### What It Does
A progress bar in the cart (and cart drawer) that fills as customer adds items. Shows milestones: free shipping, discount unlock, bonus item.

### Data Model: `ProgressBarConfig`
```js
{
  shopDomain: String,
  milestones: [{
    type: { type: String, enum: ['free_shipping', 'percentage_discount', 'fixed_discount', 'bonus_item'] },
    threshold: Number,     // cart value in store currency
    rewardValue: Number,   // e.g., 15 (for 15% off) or 0 (for free shipping)
    rewardLabel: String,   // e.g., "15% off your order"
    message: String        // e.g., "Add $15 more to unlock free shipping!"
  }],
  activeOnCart: Boolean,
  activeOnDrawer: Boolean,
  animationStyle: { type: String, enum: ['smooth', 'pulse', 'none'], default: 'smooth' }
}
```

### Backend API Endpoints
```
GET /api/progress-bar              → get config
PUT /api/progress-bar              → update config
GET /api/progress-bar/public       → lightweight public endpoint for storefront (no auth)
```

### Storefront Widget

```
Progress bar location: Top of cart page and cart drawer

Visual:
 [$15 more for Free Shipping]
 [==========●-----------]   Cart: $35 / Goal: $50
  ↑ filled (green)  ↑ unfilled (light gray)
                    ↑ milestone dot

Multiple milestones:
  ●────────────────●──────────────────●
 $30 Free Ship    $50 10% Off       $100 Bonus Gift
 ✓ Unlocked      → $15 more          → $65 more

Text below bar (dynamic):
  "🚀 Add $15 more to unlock 10% off your order!"

On milestone unlock:
  - Bar pulses green (CSS animation)
  - Toast: "🎉 You unlocked free shipping!"
  - Sound: optional subtle chime (disabled by default)
```

**JavaScript Logic:**
```js
// Listen to cart update events (Shopify cart:change or custom event)
document.addEventListener('cart:updated', function(e) {
  const cartTotal = e.detail.total_price / 100; // cents to dollars
  updateProgressBar(cartTotal, milestones);
});

function updateProgressBar(currentValue, milestones) {
  const nextMilestone = milestones.find(m => m.threshold > currentValue);
  const prevMilestone = milestones.filter(m => m.threshold <= currentValue).pop();
  const progress = prevMilestone
    ? ((currentValue - prevMilestone.threshold) / (nextMilestone.threshold - prevMilestone.threshold)) * 100
    : (currentValue / milestones[0].threshold) * 100;
  // Update DOM: bar width, message text, milestone dots
}
```

---

## 10. Feature 8 — Cart-Page Bundle Reminder (Smart Upsell Nudge) (Phase 1 MVP)

**Category:** UX/Conversion | **Priority:** High | **Plan Gate:** All plans

### What It Does
When a customer has a product in cart that belongs to a bundle but hasn't added the other bundle items, show an inline nudge: "Complete the bundle — add [Product X] and save 15%."

### Backend Logic

#### Cart Scanning Endpoint
```
POST /api/cart-nudge/check
  Body: { cartItems: [{ productId, variantId, quantity }], shopDomain }
  Logic:
    1. Get all active bundles for this shop
    2. For each bundle, check if any cart items match bundle products
    3. If partial match (1 of 2, or 2 of 3 bundle products in cart):
       → return nudge data
    4. If full match: no nudge (already completed)
    5. Return first/best matching incomplete bundle

  Response: {
    hasNudge: Boolean,
    bundle: { id, title, missingProducts: [], savingsAmount, savingsPercent },
    message: "Add [X] to complete the bundle and save 15%"
  }
```

### Storefront Widget

**Placement:** Below cart line items, above subtotal. NOT a popup.

```
┌─────────────────────────────────────────────────────┐
│ 💡 Complete your bundle — save more!                │
│                                                     │
│ You have: [Product A image] Product A               │
│ Add:      [Product B image] Product B  — $19.00     │
│                                                     │
│ Bundle saves you: $7.50 (15% off both items)        │
│                                                     │
│  [Add to Cart & Save]   [No thanks ✕]              │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- No popup, no overlay — inline only (non-intrusive)
- "No thanks" dismisses for the session (localStorage key)
- "Add to Cart & Save" → adds missing product via AJAX, updates cart, recalculates progress bar
- Re-check after every cart update for new opportunities

---

## 11. Feature 9 — Inventory-Aware Auto-Hide (Phase 1 MVP)

**Category:** Merchant Tool | **Priority:** Medium-High | **Plan Gate:** All plans

### What It Does
Monitors inventory of all products in each bundle. When any component product goes out of stock, automatically hides or disables the bundle. Re-enables when stock returns.

### Backend Implementation

#### Inventory Sync (Webhook-based)
```
Register Shopify Webhook: inventory_levels/update
Endpoint: POST /api/webhooks/inventory-update

Handler Logic:
  1. Get inventoryItemId and available quantity from webhook payload
  2. Find all bundles containing this product/variant
  3. For each affected bundle:
     a. If available <= 0:
        - Set bundle.inventoryStatus = 'out_of_stock'
        - Set bundle.active = false (or bundle.hidden = true per merchant setting)
        - Send alert to merchant (email or in-app notification)
     b. If available > 0 AND bundle.inventoryStatus was 'out_of_stock':
        - Set bundle.inventoryStatus = 'in_stock'
        - Auto re-activate bundle
        - Send re-activation notification
```

#### GraphQL: Check Inventory
```graphql
query CheckInventory($productId: ID!) {
  product(id: $productId) {
    variants(first: 50) {
      edges {
        node {
          id
          inventoryQuantity
          inventoryItem { id }
        }
      }
    }
  }
}
```

#### API Endpoints
```
GET  /api/inventory/status          → get inventory status for all bundles
POST /api/inventory/sync            → manual sync trigger
PUT  /api/bundles/:id/hide-behavior → set 'hide' or 'disable' preference
```

#### DB Field on Bundle Model
```js
{
  // ... existing bundle fields
  inventoryStatus: { type: String, enum: ['in_stock', 'out_of_stock', 'partial'], default: 'in_stock' },
  hideBehavior: { type: String, enum: ['hide', 'disable'], default: 'hide' },
  outOfStockMessage: { type: String, default: 'Check back soon!' },
  lastInventoryCheck: Date
}
```

### Frontend (Admin UI)

**Section on Bundle detail page:**
```
Inventory Status: [🟢 All items in stock] OR [🔴 Out of stock — Bundle hidden]
When out of stock: show which specific product is OOS
Out-of-stock behavior: ○ Hide bundle completely  ○ Show as disabled with message
Message to show: [text input — "Check back soon!"]
[Manual Sync] button → triggers POST /api/inventory/sync
```

---

## 12. Feature 10 — No-Code Bundle Styling Engine (Phase 2)

**Category:** Merchant Tool | **Priority:** High | **Plan Gate:** Growth+

### What It Does
Visual editor where merchants customize bundle widget appearance (colors, fonts, layout) with live preview. No coding required.

### Data Model: `StyleConfig`
```js
{
  shopDomain: String,
  // Button styles
  buttonBg: { type: String, default: '#10B981' },
  buttonText: { type: String, default: '#FFFFFF' },
  buttonRadius: { type: Number, default: 6 },      // px
  // Card styles
  cardBg: { type: String, default: '#FFFFFF' },
  cardBorder: { type: String, default: '#E5E7EB' },
  cardRadius: { type: Number, default: 8 },
  // Badge
  badgeBg: { type: String, default: '#D1FAE5' },
  badgeText: { type: String, default: '#047857' },
  badgeContent: { type: String, default: 'Bundle Deal' },
  // Typography
  headingSize: { type: Number, default: 16 },      // px
  bodySize: { type: Number, default: 14 },
  fontFamily: { type: String, default: 'inherit' },
  // Layout
  layoutPreset: { type: String, enum: ['compact', 'standard', 'large'], default: 'standard' },
  // Spacing
  paddingInner: { type: Number, default: 16 },
  updatedAt: Date
}
```

### Backend API Endpoints
```
GET /api/style-config              → get current styles
PUT /api/style-config              → save styles
GET /api/style-config/public       → for storefront (no auth, cached 5 min)
POST /api/style-config/reset       → reset to defaults
```

### Frontend (Admin UI)

**Page:** `/app/styling`

```
Layout: Two-panel
Left panel (40%): Controls
  Section: Button
    - Background color: [color picker]
    - Text color: [color picker]
    - Border radius: [slider 0–20px]

  Section: Card
    - Background: [color picker]
    - Border color: [color picker]
    - Border radius: [slider]

  Section: Badge
    - Background: [color picker]
    - Text color: [color picker]
    - Badge text: [text input]

  Section: Typography
    - Heading size: [slider 12–24px]
    - Body size: [slider 11–18px]
    - Font family: [dropdown: inherit, sans-serif, serif, monospace]

  Section: Layout Preset
    - [Compact] [Standard] [Large] — tab selector

  [Save Changes] (primary) | [Reset to Defaults] (ghost)

Right panel (60%): Live Preview
  → renders actual bundle widget HTML using inline styles from current settings
  → updates in real-time as user changes any control (no save required to preview)
```

---

## 13. Feature 11 — A/B Testing Module (Phase 3)

**Category:** Analytics | **Priority:** Medium | **Plan Gate:** Pro

### What It Does
Test two bundle variants (different discount, layout, products) simultaneously on 50/50 traffic split. Statistical significance calculator determines winner.

### Data Model: `AbTest`
```js
{
  shopDomain: String,
  name: String,
  status: { type: String, enum: ['draft', 'running', 'completed', 'stopped'], default: 'draft' },
  bundleId: ObjectId,       // original bundle
  variantA: {
    label: String,          // e.g., "15% off"
    discountValue: Number,
    discountType: String,
    layout: String
  },
  variantB: {
    label: String,          // e.g., "20% off"
    discountValue: Number,
    discountType: String,
    layout: String
  },
  results: {
    variantA: { views: Number, conversions: Number, revenue: Number },
    variantB: { views: Number, conversions: Number, revenue: Number }
  },
  winner: { type: String, enum: ['A', 'B', null], default: null },
  confidenceLevel: Number,  // 0–100, target: 95
  startedAt: Date,
  endedAt: Date
}
```

### Backend: Variant Assignment
```js
// Deterministic split by session ID (consistent per visitor)
function assignVariant(sessionId, testId) {
  const hash = crypto.createHash('md5').update(sessionId + testId).digest('hex');
  const hashInt = parseInt(hash.substring(0, 8), 16);
  return hashInt % 2 === 0 ? 'A' : 'B';
}
```

### Statistical Significance Calculation
```js
function calculateSignificance(variantA, variantB) {
  const rateA = variantA.conversions / variantA.views;
  const rateB = variantB.conversions / variantB.views;
  const pooledRate = (variantA.conversions + variantB.conversions) / (variantA.views + variantB.views);
  const se = Math.sqrt(pooledRate * (1 - pooledRate) * (1/variantA.views + 1/variantB.views));
  const zScore = Math.abs(rateA - rateB) / se;
  // z > 1.96 → 95% significance
  const confidence = Math.min(99.9, (1 - 2 * (1 - normalCDF(Math.abs(zScore)))) * 100);
  return { confidence, winner: rateA > rateB ? 'A' : 'B', significantAt95: zScore > 1.96 };
}
```

### API Endpoints
```
GET    /api/ab-tests              → list all tests
POST   /api/ab-tests              → create test
PUT    /api/ab-tests/:id/start    → activate test (status → running)
PUT    /api/ab-tests/:id/stop     → pause test
PUT    /api/ab-tests/:id/declare  → declare winner, deploy winning variant
DELETE /api/ab-tests/:id          → delete draft test
GET    /api/ab-tests/:id/results  → get live results + significance
```

---

## 14. Feature 12 — Bundle Share Link Generator (Phase 2)

**Category:** Revenue | **Priority:** Medium | **Plan Gate:** Growth+

### What It Does
Generate unique shareable URLs per bundle. When clicked, bundle products are auto-added to cart. Supports UTM tracking and QR codes.

### Data Model: `ShareLink`
```js
{
  shopDomain: String,
  bundleId: ObjectId,
  slug: String,              // unique 8-char slug, e.g. "bnd_x7k2"
  utmSource: String,
  utmMedium: String,
  utmCampaign: String,
  expiresAt: Date,           // optional
  clickCount: { type: Number, default: 0 },
  cartCount: { type: Number, default: 0 },  // how many times resulted in cart add
  active: Boolean,
  createdAt: Date
}
```

### Backend API Endpoints
```
POST   /api/share-links           → create share link
  Body: { bundleId, utmSource, utmMedium, utmCampaign, expiresAt }
  Response: { url: "https://storename.myshopify.com/pages/bundle?ref=bnd_x7k2", qrCodeBase64 }

GET    /api/share-links           → list all links with stats
DELETE /api/share-links/:id       → deactivate link

GET    /r/:slug                   → PUBLIC redirect endpoint (no auth)
  Logic:
    1. Find ShareLink by slug
    2. Check expiry
    3. Increment clickCount
    4. Redirect to: /cart?bundle_ref=:slug&add=variantId1:1,variantId2:1
    5. Storefront JS intercepts `bundle_ref` param → fires 'bundle_added_cart' event
```

### QR Code Generation
```js
const QRCode = require('qrcode');
async function generateQR(url) {
  return await QRCode.toDataURL(url, { width: 300, margin: 2 });
}
```

---

## 15. Feature 13 — Multi-Currency & Shopify Markets Support (Phase 2)

**Category:** Technical | **Priority:** Medium-High | **Plan Gate:** Growth+

### What It Does
Ensures bundle prices and discount calculations display correctly in customer's local currency across Shopify Markets.

### Implementation

#### Price Conversion
```js
// Always use Shopify's presentment prices — NEVER convert manually
// Fetch presentment prices via Storefront API:
query GetProductPrices($productId: ID!) {
  product(id: $productId) {
    variants(first: 10) {
      edges {
        node {
          id
          contextualPricing(context: { country: $country }) {
            price { amount currencyCode }
            compareAtPrice { amount currencyCode }
          }
        }
      }
    }
  }
}
// Pass buyer's country from Shopify's locale detection
```

#### Bundle Price Display Logic
```js
// In storefront bundle widget:
const country = Shopify.country || window.__st?.country || 'US';
// Fetch prices via Storefront API with country context
// Display: presentment price × quantity - discount
// NEVER calculate: base_price × exchange_rate (inaccurate)
```

#### Discount Percentage vs Fixed
```
Rule: Always use PERCENTAGE discounts for multi-currency stores.
Reason: $10 off is different value in different currencies.
       10% off is always 10% regardless of currency.

If merchant sets fixed discount in multi-currency store:
→ Show warning in admin: "Fixed amount discounts may not apply correctly
   in all currencies. Consider using percentage discounts for international stores."
```

#### RTL Support
```css
/* Detect RTL locales (Arabic, Hebrew) */
[dir="rtl"] .bundle-widget {
  direction: rtl;
  text-align: right;
}
[dir="rtl"] .bundle-progress-bar {
  transform: scaleX(-1); /* flip progress bar direction */
}
```

#### API: Markets Integration
```
GET /api/markets/settings
  Calls Shopify Admin API: markets { ... }
  Returns: { markets: [{ id, name, currencies[], enabled }] }
  Used by admin UI to warn about fixed discount + multi-currency conflicts
```

---

## 16. Database Schema (Prisma — NOT Mongoose)

> The official React Router v7 template uses **Prisma** with SQLite (dev) / PostgreSQL or MongoDB (production).  
> All models below go in `prisma/schema.prisma`. Run `npx prisma db push` to sync.  
> For MongoDB with Prisma, use `@db.ObjectId` and `@map("_id")` — see Prisma MongoDB docs.

The complete Prisma schema is in **Section 20** (Critical Implementation Rules) where all models are fully defined. Reference that section for the full `schema.prisma` file.
```js
{
  shopDomain: String,              // required, index
  title: String,                   // required
  description: String,
  products: [{
    productId: String,
    variantId: String,
    title: String,
    price: Number,
    imageUrl: String,
    quantity: { type: Number, default: 1 }
  }],
  discountType: { type: String, enum: ['percentage', 'fixed', 'bogo'], required: true },
  discountValue: Number,
  bundleType: { type: String, enum: ['fixed', 'fbt', 'mix_match', 'volume'], default: 'fixed' },
  active: { type: Boolean, default: false },
  shopifyDiscountId: String,
  inventoryStatus: { type: String, enum: ['in_stock', 'out_of_stock', 'partial'], default: 'in_stock' },
  hideBehavior: { type: String, enum: ['hide', 'disable'], default: 'hide' },
  outOfStockMessage: { type: String, default: 'Check back soon!' },
  displayLocations: [{ type: String, enum: ['product_page', 'cart', 'cart_drawer', 'thank_you'] }],
  styleOverride: Object,           // optional per-bundle style overrides
  shareLinks: [{ type: ObjectId, ref: 'ShareLink' }],
  stats: {
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 }
  },
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { shopDomain: 1 }, { shopDomain: 1, active: 1 }
```

#### `Shop`
```js
{
  shopDomain: String,              // unique
  accessToken: String,             // encrypted
  plan: { type: String, enum: ['free', 'starter', 'growth', 'pro'], default: 'free' },
  planBillingId: String,           // Shopify billing subscription ID
  installedAt: Date,
  uninstalledAt: Date,
  isActive: { type: Boolean, default: true },
  settings: {
    currency: String,
    moneyFormat: String,
    timezone: String,
    primaryDomain: String
  },
  onboarding: {
    bundleCreated: Boolean,
    firstSale: Boolean,
    analyticsViewed: Boolean
  }
}
```

---

## 17. Route → File Mapping (React Router v7)

In React Router v7, there are NO separate API endpoints. Everything is a **route file** with `loader` (GET) and `action` (POST/PUT/DELETE).

### Admin Routes (Authenticated via `authenticate.admin`)

```
Route URL                    → File
/app                         → app/routes/app.tsx           (layout)
/app/                        → app/routes/app._index.tsx    (dashboard)
/app/bundles                 → app/routes/app.bundles.tsx
/app/bundles/:id             → app/routes/app.bundles.$id.tsx
/app/analytics               → app/routes/app.analytics.tsx
/app/tiered-discounts        → app/routes/app.tiered-discounts.tsx
/app/fbt                     → app/routes/app.fbt.tsx
/app/progress-bar            → app/routes/app.progress-bar.tsx
/app/styling                 → app/routes/app.styling.tsx
/app/ab-tests                → app/routes/app.ab-tests.tsx
/app/share-links             → app/routes/app.share-links.tsx
/app/ai-suggestions          → app/routes/app.ai-suggestions.tsx
/app/billing                 → app/routes/app.billing.tsx
```

### Webhook Routes (Authenticated via `authenticate.webhook`)

```
Route URL                            → File
/webhooks/app/uninstalled            → app/routes/webhooks.app.uninstalled.tsx
/webhooks/inventory/update           → app/routes/webhooks.inventory.update.tsx
/webhooks/orders/create              → app/routes/webhooks.orders.create.tsx
```

Registered in `shopify.app.toml` — never in code.

### Public Routes (No auth — rate limited)

```
Route URL                    → File
/api/public/*                → app/routes/api.public.$.tsx  (catch-all)
  /api/public/fbt/:productId
  /api/public/style-config
  /api/public/progress-bar
  /api/public/cart-nudge
/r/:slug                     → app/routes/r.$slug.tsx       (share link redirect)
```

### How Actions Work (No Separate REST API)

```ts
// ONE route file handles all operations for that resource
// Distinguish by "intent" field in FormData

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "create": return await createBundle(session.shop, formData);
    case "update": return await updateBundle(session.shop, formData);
    case "delete": return await deleteBundle(admin, session.shop, formData);
    case "activate": return await activateBundle(admin, session.shop, formData);
    default: throw json({ error: "Unknown intent" }, { status: 400 });
  }
}
```

---

## 18. Development Roadmap

### Phase 1 — MVP (Target: 8 weeks)
Build these 7 features first. Goal: get first 5 installs, first 5-star review.

| Week | Task |
|------|------|
| 1–2  | Shopify app setup, OAuth, DB setup, Shop model |
| 2–3  | Feature 3: Discount Engine (Shopify Functions) |
| 3–4  | Feature 5: FBT Block + Feature 4: Tiered Discounts |
| 4–5  | Feature 9: Inventory Auto-Hide + Feature 8: Cart Nudge |
| 5–6  | Feature 7: Cart Progress Bar |
| 6–7  | Feature 2: Analytics Dashboard |
| 7–8  | Testing, App Store listing, Built for Shopify prep |

### Phase 2 — Growth (Target: weeks 9–16)
| Feature | Priority |
|---------|----------|
| Feature 6: Post-Purchase Upsell | High |
| Feature 10: No-Code Styling Engine | High |
| Feature 12: Bundle Share Link | Medium |
| Feature 13: Multi-Currency | Medium-High |

### Phase 3 — AI & Scale (Target: weeks 17–24)
| Feature | Priority |
|---------|----------|
| Feature 1: AI Predictive Bundles | High |
| Feature 11: A/B Testing Module | Medium |

---

## 19. Pricing Plans & Feature Gates

| Feature | Free | Starter ($19) | Growth ($29) | Pro ($49) |
|---------|------|---------------|--------------|-----------|
| Analytics Dashboard | ✓ (basic) | ✓ | ✓ | ✓ |
| Discount Engine | ✓ (1 bundle) | ✓ | ✓ | ✓ |
| FBT Block | ✓ (1 config) | ✓ | ✓ | ✓ |
| Cart Progress Bar | ✓ | ✓ | ✓ | ✓ |
| Cart Nudge | ✓ | ✓ | ✓ | ✓ |
| Inventory Auto-Hide | ✓ | ✓ | ✓ | ✓ |
| Tiered Volume Discounts | ✗ | ✓ | ✓ | ✓ |
| Post-Purchase Upsell | ✗ | ✗ | ✓ | ✓ |
| Styling Engine | ✗ | ✗ | ✓ | ✓ |
| Share Links | ✗ | ✗ | ✓ | ✓ |
| Multi-Currency | ✗ | ✗ | ✓ | ✓ |
| AI Suggestions | ✗ | ✗ | ✗ | ✓ |
| A/B Testing | ✗ | ✗ | ✗ | ✓ |
| Max Active Bundles | 2 | 10 | 50 | Unlimited |

### Plan Gate Middleware (Express)
```js
function requirePlan(minPlan) {
  const planOrder = { free: 0, starter: 1, growth: 2, pro: 3 };
  return (req, res, next) => {
    const shopPlan = req.shop.plan;
    if (planOrder[shopPlan] >= planOrder[minPlan]) return next();
    return res.status(403).json({
      error: 'PLAN_REQUIRED',
      message: `This feature requires the ${minPlan} plan or higher.`,
      upgradeUrl: '/app/billing'
    });
  };
}

// Usage:
router.post('/api/ab-tests', requirePlan('pro'), createAbTest);
router.post('/api/post-purchase', requirePlan('growth'), createOffer);
```

---

## 20. Critical Implementation Rules

---

### ✅ Framework: React Router v7 (NOT Express, NOT Remix)

Shopify's official template has migrated from Remix to **React Router v7**. They are the same framework — Remix merged into React Router. Use the new template:

```bash
shopify app init --template=https://github.com/Shopify/shopify-app-template-react-router
```

---

### Project Structure (React Router v7)

```
smartbundle/
├── app/
│   ├── shopify.server.ts        # shopifyApp() config — authentication hub
│   ├── root.tsx                 # root layout
│   ├── routes/
│   │   ├── app.tsx              # parent layout route (AppProvider, NavMenu)
│   │   ├── app._index.tsx       # dashboard home
│   │   ├── app.bundles.tsx      # bundles list page
│   │   ├── app.bundles.$id.tsx  # bundle detail/edit
│   │   ├── app.analytics.tsx    # analytics dashboard
│   │   ├── app.tiered-discounts.tsx
│   │   ├── app.fbt.tsx
│   │   ├── app.progress-bar.tsx
│   │   ├── app.styling.tsx
│   │   ├── app.ab-tests.tsx
│   │   ├── app.share-links.tsx
│   │   ├── app.billing.tsx
│   │   ├── app.ai-suggestions.tsx
│   │   ├── webhooks.app.uninstalled.tsx
│   │   ├── webhooks.inventory.update.tsx
│   │   ├── webhooks.orders.create.tsx
│   │   └── api.public.$.tsx     # public storefront API (no auth)
├── extensions/
│   ├── smart-bundle-discount/   # Shopify Function
│   └── fbt-block/               # Theme App Extension
├── prisma/
│   └── schema.prisma            # DB schema (replaces Mongoose models)
├── public/
├── shopify.app.toml             # webhooks declared here (NOT in code)
├── vite.config.ts
└── package.json
```

---

### Authentication Pattern (React Router v7)

**Every admin route loader/action MUST authenticate first:**

```ts
// app/routes/app.bundles.tsx
import { json } from "react-router";
import { authenticate } from "../shopify.server";

// LOADER — fetch data
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  // session.shop = "storename.myshopify.com"
  // admin.graphql() = authenticated GraphQL client

  const bundles = await prisma.bundle.findMany({
    where: { shopDomain: session.shop }
  });
  return json({ bundles });
}

// ACTION — handle form submissions / mutations
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const bundle = await prisma.bundle.create({
      data: { shopDomain: session.shop, ...parseBundle(formData) }
    });
    // Register Shopify discount
    await registerDiscount(admin, bundle);
    return json({ success: true, bundle });
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await deleteDiscount(admin, id);
    await prisma.bundle.delete({ where: { id } });
    return json({ success: true });
  }
}

// COMPONENT
export default function BundlesPage() {
  const { bundles } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  // Use fetcher.submit() for mutations — NOT fetch()
  return ( /* Polaris UI */ );
}
```

---

### Webhooks (Declare in shopify.app.toml — NOT in code)

```toml
# shopify.app.toml
[[webhooks.subscriptions]]
topics = ["app/uninstalled"]
uri = "/webhooks/app/uninstalled"

[[webhooks.subscriptions]]
topics = ["inventory_levels/update"]
uri = "/webhooks/inventory/update"

[[webhooks.subscriptions]]
topics = ["orders/create"]
uri = "/webhooks/orders/create"
```

```ts
// app/routes/webhooks.inventory.update.tsx
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, payload } = await authenticate.webhook(request);
  // HMAC verification is automatic inside authenticate.webhook()

  const { inventory_item_id, available } = payload;
  await handleInventoryUpdate(shop, inventory_item_id, available);

  return new Response(); // Always return 200
}
```

---

### Public Storefront API Routes (No Auth)

For storefront-facing endpoints (FBT config, style config, cart nudge), use a catch-all public route:

```ts
// app/routes/api.public.$.tsx
export async function loader({ request, params }: LoaderFunctionArgs) {
  const path = params["*"]; // e.g. "fbt/product/123" or "style-config"

  // Rate limit: check IP
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (await isRateLimited(ip)) {
    return json({ error: "Too many requests" }, { status: 429 });
  }

  if (path?.startsWith("fbt/product/")) {
    const productId = path.split("/")[2];
    const shop = new URL(request.url).searchParams.get("shop");
    const config = await prisma.fbtConfig.findFirst({
      where: { shopDomain: shop!, productId, active: true }
    });
    return json(config, {
      headers: { "Cache-Control": "public, max-age=60" }
    });
  }

  if (path === "style-config") {
    const shop = new URL(request.url).searchParams.get("shop");
    const style = await prisma.styleConfig.findFirst({ where: { shopDomain: shop! } });
    return json(style, {
      headers: { "Cache-Control": "public, max-age=300" }
    });
  }

  return json({ error: "Not found" }, { status: 404 });
}
```

---

### Prisma Schema (Replaces MongoDB/Mongoose)

The official template uses **Prisma**. Use PostgreSQL or MongoDB — not raw Mongoose.

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"    // or "mongodb"
  url      = env("DATABASE_URL")
}

// Session storage (required by @shopify/shopify-app-react-router)
model Session {
  id          String    @id
  shop        String
  state       String
  isOnline    Boolean   @default(false)
  scope       String?
  expires     DateTime?
  accessToken String
  userId      BigInt?
  firstName   String?
  lastName    String?
  email       String?
  accountOwner Boolean  @default(false)
  locale      String?
  collaborator Boolean? @default(false)
  emailVerified Boolean? @default(false)
}

model Shop {
  id          String   @id @default(cuid())
  domain      String   @unique
  plan        String   @default("free")  // free|starter|growth|pro
  billingId   String?
  installedAt DateTime @default(now())
  isActive    Boolean  @default(true)
  currency    String?
  moneyFormat String?
  timezone    String?
  bundles     Bundle[]
  createdAt   DateTime @default(now())
}

model Bundle {
  id              String   @id @default(cuid())
  shopDomain      String
  title           String
  description     String?
  discountType    String   // percentage|fixed|bogo
  discountValue   Float
  bundleType      String   @default("fixed") // fixed|fbt|mix_match|volume
  active          Boolean  @default(false)
  shopifyDiscountId String?
  inventoryStatus String   @default("in_stock")
  hideBehavior    String   @default("hide")
  outOfStockMsg   String   @default("Check back soon!")
  displayLocations String[] // product_page|cart|cart_drawer|thank_you
  views           Int      @default(0)
  clicks          Int      @default(0)
  conversions     Int      @default(0)
  revenue         Float    @default(0)
  products        BundleProduct[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model BundleProduct {
  id        String @id @default(cuid())
  bundleId  String
  bundle    Bundle @relation(fields: [bundleId], references: [id], onDelete: Cascade)
  productId String
  variantId String
  title     String
  price     Float
  imageUrl  String?
  quantity  Int    @default(1)
}

model FbtConfig {
  id               String   @id @default(cuid())
  shopDomain       String
  productId        String
  discountType     String   @default("none")
  discountValue    Float    @default(0)
  displayLocations String[]
  active           Boolean  @default(true)
  products         FbtProduct[]
  createdAt        DateTime @default(now())
}

model FbtProduct {
  id          String    @id @default(cuid())
  fbtConfigId String
  fbtConfig   FbtConfig @relation(fields: [fbtConfigId], references: [id], onDelete: Cascade)
  productId   String
  variantId   String
  title       String
  price       Float
  imageUrl    String?
  source      String    @default("manual") // manual|ai
}

model TieredDiscount {
  id               String  @id @default(cuid())
  shopDomain       String
  name             String
  applyTo          String  // bundle|collection|product
  targetId         String
  active           Boolean @default(false)
  shopifyDiscountId String?
  tiers            TieredDiscountTier[]
  createdAt        DateTime @default(now())
}

model TieredDiscountTier {
  id               String         @id @default(cuid())
  tieredDiscountId String
  tieredDiscount   TieredDiscount @relation(fields: [tieredDiscountId], references: [id], onDelete: Cascade)
  minQuantity      Int
  discountType     String         // percentage|fixed
  discountValue    Float
}

model ProgressBarConfig {
  id             String              @id @default(cuid())
  shopDomain     String              @unique
  activeOnCart   Boolean             @default(true)
  activeOnDrawer Boolean             @default(true)
  animationStyle String              @default("smooth")
  milestones     ProgressMilestone[]
  updatedAt      DateTime            @updatedAt
}

model ProgressMilestone {
  id                  String            @id @default(cuid())
  progressBarConfigId String
  progressBarConfig   ProgressBarConfig @relation(fields: [progressBarConfigId], references: [id], onDelete: Cascade)
  type                String            // free_shipping|percentage_discount|fixed_discount|bonus_item
  threshold           Float
  rewardValue         Float             @default(0)
  rewardLabel         String
  message             String
}

model StyleConfig {
  id           String   @id @default(cuid())
  shopDomain   String   @unique
  buttonBg     String   @default("#10B981")
  buttonText   String   @default("#FFFFFF")
  buttonRadius Int      @default(6)
  cardBg       String   @default("#FFFFFF")
  cardBorder   String   @default("#E5E7EB")
  cardRadius   Int      @default(8)
  badgeBg      String   @default("#D1FAE5")
  badgeText    String   @default("#047857")
  badgeContent String   @default("Bundle Deal")
  headingSize  Int      @default(16)
  bodySize     Int      @default(14)
  fontFamily   String   @default("inherit")
  layoutPreset String   @default("standard")
  paddingInner Int      @default(16)
  updatedAt    DateTime @updatedAt
}

model AnalyticsEvent {
  id             String   @id @default(cuid())
  shopDomain     String
  event          String   // bundle_viewed|bundle_clicked|bundle_purchased etc.
  bundleId       String?
  sessionId      String?
  orderId        String?
  revenue        Float?
  discountAmount Float?
  metadata       Json?
  timestamp      DateTime @default(now())

  @@index([shopDomain, event, timestamp])
}

model AiSuggestion {
  id                String   @id @default(cuid())
  shopDomain        String
  productAId        String
  productATitle     String
  productAImageUrl  String?
  productBId        String
  productBTitle     String
  productBImageUrl  String?
  confidence        Float
  lift              Float
  coOccurrenceCount Int
  status            String   @default("pending") // pending|approved|rejected
  bundleId          String?
  generatedAt       DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model ShareLink {
  id          String    @id @default(cuid())
  shopDomain  String
  bundleId    String
  slug        String    @unique
  utmSource   String?
  utmMedium   String?
  utmCampaign String?
  expiresAt   DateTime?
  clickCount  Int       @default(0)
  cartCount   Int       @default(0)
  active      Boolean   @default(true)
  createdAt   DateTime  @default(now())
}

model AbTest {
  id          String    @id @default(cuid())
  shopDomain  String
  name        String
  status      String    @default("draft") // draft|running|completed|stopped
  bundleId    String
  variantALabel  String
  variantADiscount Float
  variantAType   String
  variantBLabel  String
  variantBDiscount Float
  variantBType   String
  variantAViews       Int @default(0)
  variantAConversions Int @default(0)
  variantARevenue     Float @default(0)
  variantBViews       Int @default(0)
  variantBConversions Int @default(0)
  variantBRevenue     Float @default(0)
  winner      String?   // A|B|null
  confidence  Float?
  startedAt   DateTime?
  endedAt     DateTime?
  createdAt   DateTime  @default(now())
}

model PostPurchaseOffer {
  id                String   @id @default(cuid())
  shopDomain        String
  triggerProductIds String[]
  offerProductId    String
  offerVariantId    String
  discountType      String
  discountValue     Float
  timerMinutes      Int      @default(10)
  active            Boolean  @default(true)
  revenue           Float    @default(0)
  acceptedCount     Int      @default(0)
  shownCount        Int      @default(0)
  createdAt         DateTime @default(now())
}
```

---

### Navigation Rules (React Router v7 in Shopify Embedded Apps)

```ts
// ✅ CORRECT — use Link from react-router
import { Link } from "react-router";
<Link to="/app/bundles">Bundles</Link>

// ✅ CORRECT — use redirect from authenticate
const { redirect } = await authenticate.admin(request);
return redirect("/app/bundles");

// ✅ CORRECT — use useSubmit for mutations
import { useSubmit } from "react-router";
const submit = useSubmit();
submit({ intent: "delete", id: bundle.id }, { method: "post" });

// ❌ WRONG — never use plain <a> tags
<a href="/app/bundles">Bundles</a>

// ❌ WRONG — never use redirect from react-router directly
import { redirect } from "react-router"; // breaks embedded auth
```

---

### Shopify Admin GraphQL (Inside Loader/Action)

```ts
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  // GraphQL call — no fetch(), no axios, use admin.graphql()
  const response = await admin.graphql(`
    query GetProducts($cursor: String) {
      products(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { id title featuredImage { url } variants(first: 1) { nodes { id price } } }
      }
    }
  `, { variables: { cursor: null } });

  const { data } = await response.json();
  return json({ products: data.products.nodes });
}
```

---

### Shopify Functions (No Change from Before)

```
extensions/smart-bundle-discount/src/run.ts
```

- Deploy: `shopify app deploy`
- Get function ID after deploy from Partner Dashboard or CLI output
- Set in `.env`:
  ```
  SHOPIFY_DISCOUNT_FUNCTION_ID=01JABCDEF...
  ```
- Read in loader/action:
  ```ts
  const functionId = process.env.SHOPIFY_DISCOUNT_FUNCTION_ID!;
  ```

---

### Plan Gate (React Router v7 Pattern)

```ts
// app/utils/planGate.server.ts
const PLAN_ORDER = { free: 0, starter: 1, growth: 2, pro: 3 } as const;

export async function requirePlan(
  shopDomain: string,
  minPlan: keyof typeof PLAN_ORDER
) {
  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  const currentPlan = (shop?.plan ?? "free") as keyof typeof PLAN_ORDER;

  if (PLAN_ORDER[currentPlan] < PLAN_ORDER[minPlan]) {
    throw json(
      { error: "PLAN_REQUIRED", requiredPlan: minPlan, upgradeUrl: "/app/billing" },
      { status: 403 }
    );
  }
}

// Usage in any loader:
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  await requirePlan(session.shop, "growth");   // throws 403 if not growth+
  // ... rest of loader
}
```

---

### Error Handling (React Router v7)

```ts
// In action/loader — throw json for expected errors
throw json({ error: "Bundle not found" }, { status: 404 });

// ErrorBoundary per route
export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <Page>
      <Banner tone="critical" title="Something went wrong">
        <p>{isRouteErrorResponse(error) ? error.data.error : "Unknown error"}</p>
      </Banner>
    </Page>
  );
}
```

---

### Shopify Functions
- Deploy function BEFORE registering any discounts: `shopify app deploy`
- Always read function ID from env variable, never hardcode
- Function must return in under 5ms (Shopify limit)
- Test with `shopify app function run` before deploying

### Storefront Injection
- Use Theme App Extensions (NOT Script Tags) — required for Built for Shopify badge
- Extension blocks must be opt-in (merchant adds to theme via customize)
- All storefront JS must be < 50KB minified
- No blocking requests — all API calls async/non-blocking

### Performance
- Analytics queries: always filter by shopDomain + date range (Prisma index)
- Bundle fetch for storefront: `Cache-Control: public, max-age=60`
- Style config: `Cache-Control: public, max-age=300`
- AI analysis: run in background (use Shopify's job queue or a simple setTimeout with DB status polling)

### Built for Shopify Requirements
- Use Shopify App Bridge for all admin navigation (already in template)
- Use Polaris Web Components or Polaris React for all admin UI
- All pages must load in < 2 seconds
- Webhooks declared in `shopify.app.toml` — NOT registered in code
- No data retained after uninstall (GDPR — handle in `webhooks.app.uninstalled.tsx`)
- Must support Shopify checkout extensibility — no `checkout.liquid`

---

*Document Version: 2.0 | Updated for React Router v7 (Remix merged)*  
*Features: 13 | Phases: 3 | Estimated Build Time: 24 weeks*  
*Template: https://github.com/Shopify/shopify-app-template-react-router*