(function () {
  'use strict';

  if (window.__SB_CN_INIT__) return;
  window.__SB_CN_INIT__ = true;

  var CSS_ID = 'sb-cn-styles';
  var _config = null;

  // ── Inline styles ──────────────────────────────────────────────────────────
  var STYLES = [
    '#sb-cart-nudge-root{font-family:inherit;box-sizing:border-box}',
    '.sb-cn-nudge{background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;margin:12px 0;box-shadow:0 2px 8px rgba(0,0,0,.06)}',
    '.sb-cn-nudge__header{display:flex;align-items:center;gap:8px;margin-bottom:10px}',
    '.sb-cn-nudge__icon{font-size:16px;flex-shrink:0}',
    '.sb-cn-nudge__heading{font-size:14px;font-weight:600;color:#111827;flex:1;margin:0}',
    '.sb-cn-nudge__dismiss{background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:14px;padding:0 2px;line-height:1;flex-shrink:0}',
    '.sb-cn-nudge__dismiss:hover{color:#374151}',
    '.sb-cn-nudge__row{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;color:#374151}',
    '.sb-cn-nudge__row-label{font-weight:500;color:#6B7280;min-width:52px;flex-shrink:0}',
    '.sb-cn-nudge__row--add{background:#F9FAFB;border-radius:6px;padding:6px 8px;margin:2px 0}',
    '.sb-cn-nudge__thumb{width:36px;height:36px;object-fit:cover;border-radius:5px;flex-shrink:0;border:1px solid #E5E7EB}',
    '.sb-cn-nudge__product-name{font-size:13px;color:#111827;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sb-cn-nudge__savings{font-size:12px;font-weight:500;color:#059669;background:#D1FAE5;border-radius:5px;padding:4px 8px;margin:8px 0 10px;display:inline-block}',
    '.sb-cn-nudge__actions{display:flex;gap:8px;margin-top:4px}',
    '.sb-cn-nudge__add-btn{flex:1;background:#10B981;color:#fff;border:none;border-radius:7px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s}',
    '.sb-cn-nudge__add-btn:hover:not(:disabled){background:#059669}',
    '.sb-cn-nudge__add-btn:disabled{opacity:.6;cursor:not-allowed}',
    '.sb-cn-nudge__error{font-size:12px;color:#DC2626;margin-top:6px;padding:4px 6px;background:#FEE2E2;border-radius:4px}',
  ].join('');

  function injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    var el = document.createElement('style');
    el.id = CSS_ID;
    el.textContent = STYLES;
    document.head.appendChild(el);
  }

  // ── Utils ──────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmt(dollars) {
    var sym = (window.Shopify && window.Shopify.currency && window.Shopify.currency.symbol) || '$';
    return sym + Number(dollars || 0).toFixed(2);
  }

  // ── Session state ──────────────────────────────────────────────────────────
  function getNudgeCount() {
    try { return parseInt(sessionStorage.getItem('sb_nudge_count') || '0', 10) || 0; }
    catch (e) { return 0; }
  }

  function incrementNudgeCount() {
    try { sessionStorage.setItem('sb_nudge_count', String(getNudgeCount() + 1)); }
    catch (e) { /* ignore */ }
  }

  function isDismissed(bundleId) {
    try {
      var raw = sessionStorage.getItem('sb_nudge_dismissed_' + bundleId);
      if (!raw) return false;
      var data = JSON.parse(raw);
      var elapsed = Date.now() - (data.ts || 0);
      var windowMs = (_config.dismissDuration || 24) * 3600 * 1000;
      return elapsed < windowMs;
    } catch (e) { return false; }
  }

  function setDismissed(bundleId) {
    try {
      sessionStorage.setItem('sb_nudge_dismissed_' + bundleId, JSON.stringify({ ts: Date.now() }));
    } catch (e) { /* ignore */ }
  }

  // ── DOM ────────────────────────────────────────────────────────────────────
  function hideNudge(root) {
    root.innerHTML = '';
    root.hidden = true;
  }

  function renderNudge(root, bundle, message) {
    var firstPresent = (bundle.presentProducts && bundle.presentProducts[0]) || null;
    var firstMissing = (bundle.missingProducts && bundle.missingProducts[0]) || {};

    var savingsStr = '';
    if (bundle.savingsPercent > 0) {
      savingsStr = 'Bundle saves you: ' + bundle.savingsPercent + '% off';
    } else if (bundle.savingsAmount > 0) {
      savingsStr = 'Bundle saves you: ' + fmt(bundle.savingsAmount);
    }

    var presentHtml = '';
    if (firstPresent) {
      var presentThumb = firstPresent.image
        ? '<img class="sb-cn-nudge__thumb" src="' + esc(firstPresent.image) + '" alt="" loading="lazy" />'
        : '';
      presentHtml = '<div class="sb-cn-nudge__row">'
        + '<span class="sb-cn-nudge__row-label">You have:</span>'
        + presentThumb
        + '<span class="sb-cn-nudge__product-name">' + esc(firstPresent.title) + '</span>'
        + '</div>';
    }

    var addThumb = firstMissing.image
      ? '<img class="sb-cn-nudge__thumb" src="' + esc(firstMissing.image) + '" alt="" loading="lazy" />'
      : '';
    var addPrice = firstMissing.price ? ' &mdash; ' + esc(fmt(firstMissing.price)) : '';

    var savingsHtml = savingsStr
      ? '<div class="sb-cn-nudge__savings">' + esc(savingsStr) + '</div>'
      : '';

    root.hidden = false;
    root.innerHTML = '<div class="sb-cn-nudge">'
      + '<div class="sb-cn-nudge__header">'
      + '<span class="sb-cn-nudge__icon">&#128161;</span>'
      + '<p class="sb-cn-nudge__heading">Complete your bundle &mdash; save more!</p>'
      + '<button class="sb-cn-nudge__dismiss" type="button" data-bid="' + esc(bundle.id) + '" aria-label="Dismiss nudge">&#10005;</button>'
      + '</div>'
      + presentHtml
      + '<div class="sb-cn-nudge__row sb-cn-nudge__row--add">'
      + '<span class="sb-cn-nudge__row-label">Add:</span>'
      + addThumb
      + '<span class="sb-cn-nudge__product-name">' + esc(firstMissing.title || '') + addPrice + '</span>'
      + '</div>'
      + savingsHtml
      + '<div class="sb-cn-nudge__actions">'
      + '<button class="sb-cn-nudge__add-btn" type="button" data-vid="' + esc(String(firstMissing.variantId || '')) + '">Add to Cart &amp; Save</button>'
      + '</div>'
      + '<div class="sb-cn-nudge__error" style="display:none"></div>'
      + '</div>';

    var dismissBtn = root.querySelector('.sb-cn-nudge__dismiss');
    var addBtn = root.querySelector('.sb-cn-nudge__add-btn');
    var errorEl = root.querySelector('.sb-cn-nudge__error');

    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        setDismissed(dismissBtn.getAttribute('data-bid'));
        hideNudge(root);
      });
    }

    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var vid = addBtn.getAttribute('data-vid');
        if (!vid) return;
        addBtn.disabled = true;
        addBtn.textContent = 'Adding…';
        errorEl.style.display = 'none';

        fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ items: [{ id: Number(vid), quantity: 1 }] }),
        })
          .then(function (r) {
            if (!r.ok) return r.json().then(function (b) { throw new Error(b.description || b.message || 'Add failed'); });
            return r.json();
          })
          .then(function () {
            document.dispatchEvent(new CustomEvent('cart:updated'));
            document.dispatchEvent(new CustomEvent('cart:change'));
            return fetchCartAndCheck();
          })
          .catch(function (err) {
            errorEl.style.display = 'block';
            errorEl.textContent = err.message || 'Could not add item. Please try again.';
            addBtn.disabled = false;
            addBtn.textContent = 'Add to Cart & Save';
          });
      });
    }
  }

  // ── Placement ──────────────────────────────────────────────────────────────
  function placeNudgeRoot() {
    var root = document.getElementById('sb-cart-nudge-root');
    if (!root) return root;

    var anchor =
      document.querySelector('.cart__footer') ||
      document.querySelector('form[action="/cart"] .totals') ||
      document.getElementById('cart-subtotal');

    if (anchor && anchor.parentNode && !anchor.parentNode.contains(root)) {
      anchor.parentNode.insertBefore(root, anchor);
    }

    return root;
  }

  // ── Check nudge via app API ────────────────────────────────────────────────
  function checkNudge(cartItems) {
    var appUrl = window.SB_APP_URL;
    var shop = window.SB_SHOP || (window.Shopify && window.Shopify.shop) || '';
    if (!appUrl || !shop) return;

    var root = document.getElementById('sb-cart-nudge-root');
    if (!root) return;

    fetch(appUrl + '/api/public/cart-nudge/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ cartItems: cartItems, shop: shop }),
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.hasNudge || !data.bundle) {
          hideNudge(root);
          return;
        }

        if (isDismissed(data.bundle.id)) {
          hideNudge(root);
          return;
        }

        if (getNudgeCount() >= (_config.maxNudgesPerSession || 1)) {
          hideNudge(root);
          return;
        }

        incrementNudgeCount();
        renderNudge(root, data.bundle, data.message);
      })
      .catch(function (err) {
        console.error('[SmartBundle] cart nudge check failed:', err);
      });
  }

  // ── Cart fetch + check ─────────────────────────────────────────────────────
  function fetchCartAndCheck() {
    return fetch('/cart.js', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (cart) { checkNudge(cart.items || []); })
      .catch(function (err) { console.error('[SmartBundle] cart fetch failed:', err); });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    var root = document.getElementById('sb-cart-nudge-root');
    if (!root) return;

    var appUrl = window.SB_APP_URL;
    var shop = window.SB_SHOP || (window.Shopify && window.Shopify.shop) || '';
    if (!appUrl || !shop) return;

    fetch(appUrl + '/api/public/cart-nudge?shop=' + encodeURIComponent(shop), {
      headers: { Accept: 'application/json' },
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (config) {
        if (!config || config.active === false) return;

        _config = config;
        injectStyles();
        placeNudgeRoot();
        fetchCartAndCheck();

        document.addEventListener('cart:change', function (e) {
          var cart = e.detail && (e.detail.cart || e.detail);
          if (cart && Array.isArray(cart.items)) {
            checkNudge(cart.items);
          } else {
            fetchCartAndCheck();
          }
        });

        document.addEventListener('cart:updated', fetchCartAndCheck);
        document.addEventListener('cart:refresh', fetchCartAndCheck);
        document.addEventListener('theme:cart:updated', fetchCartAndCheck);
      })
      .catch(function (err) {
        console.error('[SmartBundle] cart nudge init failed:', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', function (e) {
    if (e.target && e.target.querySelector('#sb-cart-nudge-root')) {
      window.__SB_CN_INIT__ = false;
      _config = null;
      init();
      window.__SB_CN_INIT__ = true;
    }
  });
})();
