(function () {
  'use strict';

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  // SB_APP_URL must be set by the Liquid block before this script loads.
  var APP_URL = window.SB_APP_URL || '';
  var ENDPOINT = APP_URL + '/api/public/events';
  var SHOP = (window.Shopify && window.Shopify.shop) || '';

  // Capture the original fetch before any patching for our own internal calls.
  var _fetch = window.fetch ? window.fetch.bind(window) : null;

  if (!SHOP || !APP_URL || !_fetch) return;

  // ── Session ID ─────────────────────────────────────────────────────────────
  var sessionId = (function () {
    var KEY = 'sb_session_id';
    try {
      var stored = sessionStorage.getItem(KEY);
      if (stored) return stored;
      var id = 'sb_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
      sessionStorage.setItem(KEY, id);
      return id;
    } catch (_) {
      return 'sb_' + Date.now().toString(36);
    }
  })();

  // ── Event queue & flush ────────────────────────────────────────────────────
  var queue = [];
  var flushTimer = null;

  function flush() {
    if (!queue.length) return;
    clearTimeout(flushTimer);
    flushTimer = null;
    var batch = queue.splice(0);
    var body = JSON.stringify({ shop: SHOP, events: batch });
    // sendBeacon fires reliably on pagehide; fall back to keepalive fetch.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    } else {
      _fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(function () {});
    }
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, 5000);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);

  // ── Public tracking API ────────────────────────────────────────────────────
  // Other SmartBundle scripts call window.SB_track(event, payload) directly.
  window.SB_track = function (event, payload) {
    if (!event) return;
    queue.push(
      Object.assign({}, payload, {
        event: event,
        sessionId: sessionId,
        timestamp: new Date().toISOString(),
      })
    );
    scheduleFlush();
  };

  // ── Deduplication sets ─────────────────────────────────────────────────────
  var viewedBundles = new Set();
  var viewedFbt = new Set();

  // ── bundle_viewed ──────────────────────────────────────────────────────────
  // Triggered when a [data-sb-bundle-id] element enters the DOM.
  function trackBundleViewed(el) {
    var bundleId = el.getAttribute('data-sb-bundle-id');
    if (!bundleId || viewedBundles.has(bundleId)) return;
    viewedBundles.add(bundleId);
    window.SB_track('bundle_viewed', {
      bundleId: bundleId,
      productId: el.getAttribute('data-sb-product-id') || null,
    });
  }

  // ── bundle_clicked ─────────────────────────────────────────────────────────
  // Any click inside a bundle widget.
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-sb-bundle-id]');
    if (!el) return;
    window.SB_track('bundle_clicked', {
      bundleId: el.getAttribute('data-sb-bundle-id'),
      productId: el.getAttribute('data-sb-product-id') || null,
    });
  });

  // ── bundle_added_cart ──────────────────────────────────────────────────────
  // Patches window.fetch to intercept /cart/add.js calls made by bundle widgets.
  // Also persists bundleId to sessionStorage so bundle_purchased can fire later.
  function patchFetchForBundleCartAdd() {
    var orig = window.fetch.bind(window);
    window.fetch = function () {
      var args = Array.prototype.slice.call(arguments);
      var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      return orig.apply(window, args).then(function (response) {
        if (/\/cart\/add\.js(?:\?|$)/.test(url) && response.ok) {
          var ctx = document.querySelector('[data-sb-bundle-id]');
          if (ctx) {
            var items = [];
            try { items = JSON.parse(ctx.getAttribute('data-sb-items') || '[]'); } catch (_) {}
            var bundleId = ctx.getAttribute('data-sb-bundle-id');
            window.SB_track('bundle_added_cart', {
              bundleId: bundleId,
              items: items,
              totalValue: parseFloat(ctx.getAttribute('data-sb-total-value') || '0') || 0,
              discountApplied: ctx.getAttribute('data-sb-discount') === 'true',
            });
            // Carry bundleId forward to the thank-you page via sessionStorage.
            try { sessionStorage.setItem('sb_pending_bundle', bundleId); } catch (_) {}
          }
        }
        return response;
      });
    };
  }

  // ── bundle_purchased ───────────────────────────────────────────────────────
  // Fires on the Shopify order-status (thank-you) page where Shopify.checkout
  // is populated. Reads the bundleId stored during bundle_added_cart.
  function trackPurchaseOnThankYouPage() {
    var checkout = window.Shopify && window.Shopify.checkout;
    if (!checkout) return;

    var bundleId;
    try { bundleId = sessionStorage.getItem('sb_pending_bundle'); } catch (_) {}
    if (!bundleId) return;

    try { sessionStorage.removeItem('sb_pending_bundle'); } catch (_) {}

    window.SB_track('bundle_purchased', {
      bundleId: bundleId,
      orderId: checkout.order_id ? String(checkout.order_id) : null,
      revenue: checkout.total_price ? parseFloat(checkout.total_price) / 100 : 0,
      discountAmount: checkout.total_discounts ? parseFloat(checkout.total_discounts) / 100 : 0,
    });
  }

  // ── fbt_viewed ─────────────────────────────────────────────────────────────
  // Triggered when a [data-sb-fbt] element enters the DOM.
  // data-sb-suggested-ids must be a JSON-encoded array of product ID strings.
  function trackFbtViewed(el) {
    var productId = el.getAttribute('data-sb-product-id');
    if (!productId || viewedFbt.has(productId)) return;
    viewedFbt.add(productId);
    var suggestedProductIds = [];
    try { suggestedProductIds = JSON.parse(el.getAttribute('data-sb-suggested-ids') || '[]'); } catch (_) {}
    window.SB_track('fbt_viewed', {
      productId: productId,
      suggestedProductIds: suggestedProductIds,
    });
  }

  // ── fbt_added ──────────────────────────────────────────────────────────────
  // Fires when the user clicks an [data-sb-fbt-add] button.
  // data-sb-fbt-add holds the added product ID.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-sb-fbt-add]');
    if (!btn) return;
    var productId = btn.getAttribute('data-sb-product-id') || null;
    var addedProductId = btn.getAttribute('data-sb-fbt-add') || null;
    // Read the live cart value after the add settles (best-effort, fire-and-forget).
    _fetch('/cart.js', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        window.SB_track('fbt_added', {
          productId: productId,
          addedProductId: addedProductId,
          cartValue: cart.total_price ? cart.total_price / 100 : 0,
        });
      })
      .catch(function () {
        window.SB_track('fbt_added', {
          productId: productId,
          addedProductId: addedProductId,
          cartValue: 0,
        });
      });
  });

  // ── upsell_shown ───────────────────────────────────────────────────────────
  // The post-purchase upsell widget dispatches this custom DOM event.
  document.addEventListener('sb:upsell:shown', function (e) {
    var d = (e && e.detail) || {};
    window.SB_track('upsell_shown', {
      orderId: d.orderId || null,
      offeredProductId: d.offeredProductId || null,
      price: d.price || 0,
    });
  });

  // ── upsell_accepted ────────────────────────────────────────────────────────
  document.addEventListener('sb:upsell:accepted', function (e) {
    var d = (e && e.detail) || {};
    window.SB_track('upsell_accepted', {
      orderId: d.orderId || null,
      productId: d.productId || null,
      revenue: d.revenue || 0,
    });
  });

  // ── MutationObserver: scan newly added widgets ─────────────────────────────
  function scanNode(node) {
    if (node.nodeType !== 1) return;
    if (node.hasAttribute('data-sb-bundle-id')) trackBundleViewed(node);
    if (node.hasAttribute('data-sb-fbt')) trackFbtViewed(node);
    node.querySelectorAll('[data-sb-bundle-id]').forEach(trackBundleViewed);
    node.querySelectorAll('[data-sb-fbt]').forEach(trackFbtViewed);
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    patchFetchForBundleCartAdd();
    trackPurchaseOnThankYouPage();

    // Scan widgets already in DOM.
    document.querySelectorAll('[data-sb-bundle-id]').forEach(trackBundleViewed);
    document.querySelectorAll('[data-sb-fbt]').forEach(trackFbtViewed);

    // Watch for widgets injected after page load (e.g. lazy sections).
    new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(scanNode);
      });
    }).observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
