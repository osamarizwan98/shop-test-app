import prisma from '../db.server';

// ── In-memory rate limiter (fixed window, resets on server restart) ─────────
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000; // 1 minute

const _rl = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = _rl.get(ip);
  if (!entry || now - entry.windowStart >= RATE_WINDOW_MS) {
    _rl.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count += 1;
  return false;
}

function clientIp(request) {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ALLOWED_EVENTS = new Set([
  'bundle_viewed',
  'bundle_clicked',
  'bundle_added_cart',
  'bundle_purchased',
  'fbt_viewed',
  'fbt_added',
  'upsell_shown',
  'upsell_accepted',
]);

const MAX_BATCH = 50;
const SHOP_RE = /^[a-z0-9-]+\.myshopify\.com$/i;

// ── JSON response helpers ─────────────────────────────────────────────────────
function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extra },
  });
}

// ── GET /api/public/progress-bar ─────────────────────────────────────────────
async function handleProgressBar(request) {
  const shop = new URL(request.url).searchParams.get('shop') ?? '';
  if (!shop || !SHOP_RE.test(shop)) {
    return json({ error: 'Missing or invalid shop' }, 400);
  }

  const config = await prisma.progressBarConfig.findFirst({
    where: { shopDomain: shop, activeOnCart: true },
    include: { milestones: { orderBy: { threshold: 'asc' } } },
  });

  if (!config) {
    return json({ active: false }, 200, { 'Cache-Control': 'public, max-age=60' });
  }

  return json(
    {
      active: true,
      activeOnCart: config.activeOnCart,
      activeOnDrawer: config.activeOnDrawer,
      animationStyle: config.animationStyle,
      milestones: config.milestones.map((m) => ({
        type: m.type,
        threshold: m.threshold,
        rewardValue: m.rewardValue,
        rewardLabel: m.rewardLabel,
        message: m.message,
      })),
    },
    200,
    { 'Cache-Control': 'public, max-age=60' },
  );
}

// ── GET /api/public/fbt/product/:productId ────────────────────────────────────
async function handleFbtProduct(request, productId) {
  const shop = new URL(request.url).searchParams.get('shop') ?? '';
  if (!shop || !SHOP_RE.test(shop)) {
    return json({ error: 'Missing or invalid shop' }, 400);
  }

  const config = await prisma.fbtConfig.findFirst({
    where: { shop, productId, isEnabled: true },
    select: {
      productId: true,
      discountType: true,
      discountValue: true,
      products: {
        orderBy: { position: 'asc' },
        select: {
          productId: true,
          variantId: true,
          title: true,
          price: true,
          imageUrl: true,
        },
      },
    },
  });

  if (!config) return json(null, 200, { 'Cache-Control': 'public, max-age=60' });

  return json(
    {
      active: true,
      productId: config.productId,
      discountType: config.discountType,
      discountValue: config.discountValue,
      products: config.products,
    },
    200,
    { 'Cache-Control': 'public, max-age=60' },
  );
}

// ── POST /api/public/events ───────────────────────────────────────────────────
async function handleEvents(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (isRateLimited(clientIp(request))) {
    return json({ error: 'Too many requests' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Body must be a JSON object' }, 400);
  }

  const payload = body;

  // shopDomain: query param takes precedence over body field
  const shopDomain =
    new URL(request.url).searchParams.get('shop') ??
    (typeof payload.shop === 'string' ? payload.shop : '');

  if (!shopDomain || !SHOP_RE.test(shopDomain)) {
    return json({ error: 'Missing or invalid shopDomain' }, 400);
  }

  const events = payload.events;
  if (!Array.isArray(events) || events.length === 0) {
    return json({ ok: true, inserted: 0 }, 200);
  }
  if (events.length > MAX_BATCH) {
    return json({ error: `Batch exceeds maximum of ${MAX_BATCH} events` }, 400);
  }

  const rows = events
    .filter(
      (e) =>
        e !== null &&
        typeof e === 'object' &&
        !Array.isArray(e) &&
        typeof e.event === 'string' &&
        ALLOWED_EVENTS.has(e.event)
    )
    .map((e) => {
      // Destructure known scalar fields; anything extra lands in metadata.
      const {
        event,
        bundleId,
        sessionId,
        orderId,
        revenue,
        discountAmount,
        timestamp,
        shop: _shop,  // strip body-level shop if accidentally included
        ...rest
      } = e;

      return {
        shopDomain,
        event: event,
        bundleId: typeof bundleId === 'string' ? bundleId : null,
        sessionId: typeof sessionId === 'string' ? sessionId : null,
        orderId: typeof orderId === 'string' ? orderId : null,
        revenue: typeof revenue === 'number' ? revenue : null,
        discountAmount: typeof discountAmount === 'number' ? discountAmount : null,
        metadata: Object.keys(rest).length > 0 ? rest : null,
        timestamp:
          typeof timestamp === 'string' && !isNaN(Date.parse(timestamp))
            ? new Date(timestamp)
            : undefined, // undefined → Prisma uses @default(now())
      };
    });

  if (rows.length === 0) {
    return json({ ok: true, inserted: 0 }, 200);
  }

  await prisma.analyticsEvent.createMany({ data: rows, skipDuplicates: true });

  return json({ ok: true, inserted: rows.length }, 200);
}

// ── GET /api/public/cart-nudge ────────────────────────────────────────────────
async function handleCartNudgeConfig(request) {
  const shop = new URL(request.url).searchParams.get('shop') ?? '';
  if (!shop || !SHOP_RE.test(shop)) {
    return json({ error: 'Missing or invalid shop' }, 400);
  }

  const config = await prisma.cartNudgeConfig.findFirst({ where: { shopDomain: shop } });

  if (!config) {
    return json({ active: false }, 200, { 'Cache-Control': 'public, max-age=60' });
  }

  return json(
    {
      active: config.active,
      dismissDuration: config.dismissDuration,
      maxNudgesPerSession: config.maxNudgesPerSession,
    },
    200,
    { 'Cache-Control': 'public, max-age=60' },
  );
}

// ── POST /api/public/cart-nudge/check ─────────────────────────────────────────
async function handleCartNudgeCheck(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (isRateLimited(clientIp(request))) {
    return json({ error: 'Too many requests' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const shop = typeof body.shop === 'string' ? body.shop.trim() : '';
  if (!shop || !SHOP_RE.test(shop)) {
    return json({ error: 'Missing or invalid shop' }, 400);
  }

  const cartItems = Array.isArray(body.cartItems) ? body.cartItems : [];

  const bundles = await prisma.bundle.findMany({
    where: { shop, status: 'active' },
    select: { id: true, title: true, discountType: true, discountValue: true, productIds: true },
  });

  if (!bundles.length || !cartItems.length) {
    return json({ hasNudge: false }, 200);
  }

  function stripGid(val) {
    return String(val ?? '').split('/').pop().trim();
  }

  // Build lookup sets for both variantId and productId
  const cartVariantIds = new Set(
    cartItems.map((item) => String(item.variant_id ?? item.variantId ?? '')).filter(Boolean),
  );
  const cartProductIds = new Set(
    cartItems.map((item) => String(item.product_id ?? item.productId ?? '')).filter(Boolean),
  );

  if (!cartVariantIds.size && !cartProductIds.size) return json({ hasNudge: false }, 200);

  let best = null;
  let bestScore = -1;

  for (const bundle of bundles) {
    let products;
    try {
      products = Array.isArray(bundle.productIds)
        ? bundle.productIds
        : JSON.parse(String(bundle.productIds ?? '[]'));
    } catch {
      continue;
    }
    if (!Array.isArray(products) || products.length < 2) continue;

    const normalized = products
      .map((p) => ({
        ...p,
        _vid: stripGid(p.variantId ?? p.variant_id),
        _pid: stripGid(p.gid ?? p.id ?? ''),
      }))
      .filter((p) => p._vid || p._pid);

    if (normalized.length < 2) continue;

    // A bundle product is "present" if its variantId OR productId matches a cart item
    const inCart = (p) =>
      (p._vid && cartVariantIds.has(p._vid)) || (p._pid && cartProductIds.has(p._pid));

    const present = normalized.filter(inCart);
    const missing = normalized.filter((p) => !inCart(p));

    if (!present.length || !missing.length) continue;

    const score = present.length / normalized.length;
    if (
      score > bestScore ||
      (score === bestScore && missing.length < (best?.missing?.length ?? Infinity))
    ) {
      bestScore = score;
      best = { bundle, present, missing };
    }
  }

  if (!best) return json({ hasNudge: false }, 200);

  const { bundle, present, missing } = best;

  let savingsAmount = 0;
  let savingsPercent = 0;
  if (bundle.discountType === 'percentage') {
    savingsPercent = bundle.discountValue;
  } else {
    savingsAmount = bundle.discountValue;
  }

  const missingCount = missing.length;
  const message =
    missingCount === 1
      ? `Add 1 more item to complete the "${bundle.title}" bundle and save!`
      : `Add ${missingCount} more items to complete the "${bundle.title}" bundle and save!`;

  return json(
    {
      hasNudge: true,
      bundle: {
        id: bundle.id,
        title: bundle.title,
        presentProducts: present.map((p) => ({
          variantId: p._vid,
          title: String(p.title ?? ''),
          image: String(p.imageUrl ?? p.image ?? ''),
          price: Number(p.price ?? 0),
        })),
        missingProducts: missing.map((p) => ({
          variantId: p._vid,
          title: String(p.title ?? ''),
          image: String(p.imageUrl ?? p.image ?? ''),
          price: Number(p.price ?? 0),
        })),
        savingsAmount,
        savingsPercent,
      },
      message,
    },
    200,
  );
}

// ── Route exports ─────────────────────────────────────────────────────────────
export async function loader({ request, params }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const path = params['*'] ?? '';

  if (path === 'progress-bar') {
    return handleProgressBar(request);
  }

  if (path === 'cart-nudge') {
    return handleCartNudgeConfig(request);
  }

  if (path.startsWith('fbt/product/')) {
    const productId = decodeURIComponent(path.slice('fbt/product/'.length));
    return handleFbtProduct(request, productId);
  }

  return json({ error: 'Not found' }, 404);
}

export async function action({ request, params }) {
  const path = params['*'] ?? '';

  if (path === 'events' || path === 'analytics/events') return handleEvents(request);
  if (path === 'cart-nudge/check') return handleCartNudgeCheck(request);

  return json({ error: 'Not found' }, 404);
}
