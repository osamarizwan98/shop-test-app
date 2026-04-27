(function () {
  'use strict';

  // ── Guard against double-init ─────────────────────────────────────────────
  if (window.__SB_PB_INIT__) return;
  window.__SB_PB_INIT__ = true;

  var CSS_ID       = 'sb-pb-styles';
  var _config      = null;
  var _milestones  = [];     // sorted ascending by threshold
  var _pollTimer   = null;
  var _lastTotal   = null;   // null = first render, suppress milestone toasts
  var _unlocked    = {};     // threshold key → true once crossed

  var _isRTL = (document.documentElement.dir || document.body.dir || '').toLowerCase() === 'rtl';

  // ── Inline CSS ────────────────────────────────────────────────────────────
  var STYLES = [
    '#sb-progress-bar-root{font-family:inherit;padding:16px 0;box-sizing:border-box}',
    '.sb-pb-wrap{width:100%}',
    '.sb-pb-msg{font-size:13px;color:#374151;text-align:center;margin:0 0 10px;min-height:1.4em}',
    '.sb-pb-track{position:relative;height:8px;border-radius:999px;background:#E5E7EB;margin:0 8px 28px}',
    '.sb-pb-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#10B981,#3B82F6);width:0%;transition:width 0.45s ease}',
    '.sb-pb-fill--pulse{animation:sb-pb-pulse 1.6s ease-in-out infinite}',
    '@keyframes sb-pb-pulse{0%,100%{opacity:1}50%{opacity:.6}}',
    '.sb-pb-fill--unlock{animation:sb-pb-unlock .55s ease forwards}',
    '@keyframes sb-pb-unlock{0%{filter:brightness(1)}40%{filter:brightness(1.5)}100%{filter:brightness(1)}}',
    '.sb-pb-marker{position:absolute;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;pointer-events:none}',
    '.sb-pb-dot{width:16px;height:16px;border-radius:50%;border:2px solid #fff;background:#D1D5DB;box-shadow:0 0 0 1.5px #D1D5DB;transition:background .25s,box-shadow .25s;flex-shrink:0}',
    '.sb-pb-dot--unlocked{background:#10B981;box-shadow:0 0 0 1.5px #10B981}',
    '.sb-pb-dot--next{background:#F59E0B;box-shadow:0 0 0 1.5px #F59E0B}',
    '.sb-pb-dot-lbl{position:absolute;top:14px;font-size:10px;line-height:1.3;color:#6B7280;white-space:nowrap;text-align:center}',
    '#sb-pb-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#10B981;color:#fff;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:500;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,.18);pointer-events:none;transition:opacity .2s ease}'
  ].join('');

  function injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    var el = document.createElement('style');
    el.id = CSS_ID;
    el.textContent = STYLES;
    document.head.appendChild(el);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmt(dollars) {
    var sym = (window.Shopify && window.Shopify.currency && window.Shopify.currency.symbol) || '$';
    return sym + Number(dollars).toFixed(2);
  }

  function showToast(msg) {
    var prev = document.getElementById('sb-pb-toast');
    if (prev) prev.remove();
    var el = document.createElement('div');
    el.id = 'sb-pb-toast';
    el.textContent = msg;
    el.style.opacity = '0';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.style.opacity = '1'; });
    setTimeout(function () {
      el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) el.remove(); }, 250);
    }, 3000);
  }

  // ── Render DOM skeleton ───────────────────────────────────────────────────
  function renderBar(root, milestones, animStyle) {
    var max = milestones[milestones.length - 1].threshold;

    var markersHtml = milestones.map(function (m) {
      var pct = (m.threshold / max) * 100;
      var key = String(m.threshold);
      var label = fmt(m.threshold) + (m.rewardLabel ? '<br>' + esc(m.rewardLabel) : '');
      return '<span class="sb-pb-marker" style="left:' + pct + '%">'
        + '<span class="sb-pb-dot" id="sb-pb-dot-' + key + '"></span>'
        + '<span class="sb-pb-dot-lbl">' + label + '</span>'
        + '</span>';
    }).join('');

    var fillCls = 'sb-pb-fill' + (animStyle === 'pulse' ? ' sb-pb-fill--pulse' : '');

    // RTL: flip the track with scaleX(-1) so fill grows right-to-left visually
    var trackStyle = _isRTL ? ' style="transform:scaleX(-1)"' : '';

    root.innerHTML = '<div class="sb-pb-wrap">'
      + '<p class="sb-pb-msg" id="sb-pb-msg"></p>'
      + '<div class="sb-pb-track"' + trackStyle + '>'
      + '<div class="' + fillCls + '" id="sb-pb-fill"></div>'
      + markersHtml
      + '</div>'
      + '</div>';
  }

  // ── Core update ───────────────────────────────────────────────────────────
  function updateBar(cartTotal) {
    var fill = document.getElementById('sb-pb-fill');
    var msg  = document.getElementById('sb-pb-msg');
    if (!fill || !msg || !_milestones.length) return;

    var max = _milestones[_milestones.length - 1].threshold;

    // Fill width: straightforward linear mapping 0→max
    var pct = Math.min((cartTotal / max) * 100, 100);
    fill.style.width = pct + '%';

    // Find next / prev milestones relative to cart total
    var nextMs  = null;
    var prevMs  = null;
    for (var i = 0; i < _milestones.length; i++) {
      if (cartTotal < _milestones[i].threshold) {
        nextMs = _milestones[i];
        break;
      }
      prevMs = _milestones[i];
    }

    // Dot states: unlocked (green) | next (amber) | future (gray)
    for (var j = 0; j < _milestones.length; j++) {
      var m   = _milestones[j];
      var dot = document.getElementById('sb-pb-dot-' + String(m.threshold));
      if (!dot) continue;
      dot.className = 'sb-pb-dot';
      if (cartTotal >= m.threshold)  { dot.className += ' sb-pb-dot--unlocked'; }
      else if (m === nextMs)         { dot.className += ' sb-pb-dot--next'; }
    }

    // Check for newly unlocked milestones (suppress on first render)
    var isFirstRender = (_lastTotal === null);
    for (var k = 0; k < _milestones.length; k++) {
      var ms  = _milestones[k];
      var key = String(ms.threshold);
      if (cartTotal >= ms.threshold) {
        if (!_unlocked[key]) {
          _unlocked[key] = true;
          if (!isFirstRender) {
            // Pulse the fill bar
            fill.classList.add('sb-pb-fill--unlock');
            (function (f) {
              setTimeout(function () { f.classList.remove('sb-pb-fill--unlock'); }, 600);
            }(fill));
            // Dispatch + toast
            document.dispatchEvent(new CustomEvent('sb:milestone-unlocked', {
              bubbles: true,
              detail: { threshold: ms.threshold, rewardLabel: ms.rewardLabel, type: ms.type }
            }));
          }
        }
      }
    }

    // Message
    if (!nextMs) {
      // All milestones reached
      var last = _milestones[_milestones.length - 1];
      msg.textContent = last.message || '🎉 You\'ve unlocked all rewards!';
    } else {
      var needed = nextMs.threshold - cartTotal;
      if (nextMs.message) {
        // Replace {amount} placeholder if merchant used it
        msg.textContent = nextMs.message.replace('{amount}', fmt(needed));
      } else {
        msg.textContent = 'Add ' + fmt(needed) + ' more to unlock '
          + (nextMs.rewardLabel || 'a reward') + '!';
      }
    }

    _lastTotal = cartTotal;
  }

  // ── Toast on milestone unlock ─────────────────────────────────────────────
  document.addEventListener('sb:milestone-unlocked', function (e) {
    var label = (e.detail && e.detail.rewardLabel) || 'a reward';
    showToast('🎉 You unlocked ' + label + '!');
  });

  // ── Cart fetching ─────────────────────────────────────────────────────────
  function fetchCart() {
    fetch('/cart.js', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        // Shopify cart.total_price is in cents
        updateBar((cart.total_price || 0) / 100);
      })
      .catch(function () {/* silent */});
  }

  function startPolling() {
    if (_pollTimer) return;
    _pollTimer = setInterval(fetchCart, 2000);
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  function init() {
    var root = document.getElementById('sb-progress-bar-root');
    if (!root) return;

    var appUrl = window.SB_APP_URL;
    var shop   = window.SB_SHOP
      || (window.Shopify && window.Shopify.shop)
      || '';

    if (!appUrl || !shop) return;

    fetch(appUrl + '/api/public/progress-bar?shop=' + encodeURIComponent(shop), {
      headers: { 'Accept': 'application/json' }
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.active || !data.milestones || !data.milestones.length) return;

        _config     = data;
        _milestones = data.milestones.slice().sort(function (a, b) {
          return a.threshold - b.threshold;
        });

        injectStyles();
        renderBar(root, _milestones, _config.animationStyle || 'smooth');

        // Initial cart state
        fetchCart();

        // React to Shopify cart:change events (Dawn + most modern themes)
        document.addEventListener('cart:change', function (e) {
          var detail = e.detail || {};
          var cart   = detail.cart || detail;
          if (cart && typeof cart.total_price === 'number') {
            updateBar(cart.total_price / 100);
          } else {
            fetchCart();
          }
        });

        // Also listen to theme-specific add-to-cart events
        document.addEventListener('cart:refresh', fetchCart);
        document.addEventListener('theme:cart:updated', fetchCart);

        // Poll every 2 s as universal fallback
        startPolling();
      })
      .catch(function (err) {
        console.error('[SmartBundle] Progress bar failed to load:', err);
      });
  }

  // ── Entry point ───────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-init when the section is reloaded in the theme editor
  document.addEventListener('shopify:section:load', function (e) {
    if (e.target && e.target.querySelector('#sb-progress-bar-root')) {
      window.__SB_PB_INIT__ = false;
      _config     = null;
      _milestones = [];
      _lastTotal  = null;
      _unlocked   = {};
      if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
      init();
      window.__SB_PB_INIT__ = true;
    }
  });
})();
