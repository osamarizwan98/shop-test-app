(function () {
  var CSS_ID = 'sb-fbt-styles';

  var STYLES = [
    '.BS_fbt-widget{font-family:inherit;background:var(--sb-fbt-bg,#fff);border:1px solid var(--sb-fbt-border,#E5E7EB);border-radius:var(--sb-fbt-radius,8px);padding:20px;margin:24px 0;color:var(--sb-fbt-text,#111827)}',
    '.BS_fbt-title{font-size:18px;font-weight:600;margin:0 0 16px}',
    '.BS_fbt-images{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px}',
    '.BS_fbt-img-wrap{flex-shrink:0}',
    '.BS_fbt-img{width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid var(--sb-fbt-border,#E5E7EB);display:block}',
    '.BS_fbt-img--placeholder{width:72px;height:72px;background:#F3F4F6;border-radius:6px;border:1px solid var(--sb-fbt-border,#E5E7EB)}',
    '.BS_fbt-sep{font-size:20px;font-weight:600;color:#9CA3AF;flex-shrink:0}',
    '.BS_fbt-checks{display:flex;flex-direction:column;gap:10px;margin-bottom:16px}',
    '.BS_fbt-check-row{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px}',
    '.BS_fbt-checkbox{width:16px;height:16px;accent-color:var(--sb-fbt-primary,#10B981);flex-shrink:0;cursor:pointer}',
    '.BS_fbt-check-title{flex:1;color:var(--sb-fbt-text,#111827)}',
    '.BS_fbt-check-price{font-weight:500;color:var(--sb-fbt-text,#111827);white-space:nowrap}',
    '.BS_fbt-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px;font-size:15px}',
    '.BS_fbt-label{font-weight:500}',
    '.BS_fbt-original-price{text-decoration:line-through;color:#9CA3AF}',
    '.BS_fbt-total-price{font-weight:700;font-size:17px;color:var(--sb-fbt-text,#111827)}',
    '.BS_fbt-savings{background:#D1FAE5;color:#065F46;font-size:13px;font-weight:500;padding:2px 8px;border-radius:12px}',
    '.BS_fbt-add-btn{display:block;width:100%;padding:12px 20px;background:var(--sb-fbt-primary,#10B981);color:#fff;border:none;border-radius:var(--sb-fbt-radius,8px);font-size:15px;font-weight:600;cursor:pointer;transition:background 0.15s ease}',
    '.BS_fbt-add-btn:hover:not(:disabled){background:var(--sb-fbt-primary-hover,#059669)}',
    '.BS_fbt-add-btn:disabled{opacity:0.6;cursor:not-allowed}',
    '#sb-fbt-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--sb-fbt-primary,#10B981);color:#fff;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:none;transition:opacity 0.2s ease}',
    '@media(max-width:640px){.BS_fbt-images{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}.BS_fbt-img,.BS_fbt-img--placeholder{width:60px;height:60px}}'
  ].join('');

  function SB_injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    var el = document.createElement('style');
    el.id = CSS_ID;
    el.textContent = STYLES;
    document.head.appendChild(el);
  }

  function SB_escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function SB_formatMoney(cents) {
    var symbol = (window.Shopify && window.Shopify.currency && window.Shopify.currency.symbol) || '$';
    return symbol + (cents / 100).toFixed(2);
  }

  function SB_showToast(msg) {
    var prev = document.getElementById('sb-fbt-toast');
    if (prev) prev.remove();

    var el = document.createElement('div');
    el.id = 'sb-fbt-toast';
    el.textContent = msg;
    el.style.opacity = '0';
    document.body.appendChild(el);

    requestAnimationFrame(function () {
      el.style.opacity = '1';
    });

    setTimeout(function () {
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 250);
    }, 3000);
  }

  function SB_calcTotals(items, discountType, discountValue) {
    var subtotal = 0;
    items.forEach(function (item) {
      if (item.checked) subtotal += item.price;
    });

    var savings = 0;
    if (subtotal > 0 && discountType === 'percentage' && discountValue > 0) {
      savings = Math.round(subtotal * discountValue / 100);
    } else if (subtotal > 0 && discountType === 'fixed' && discountValue > 0) {
      savings = Math.min(discountValue * 100, subtotal);
    }

    return { subtotal: subtotal, savings: savings, total: subtotal - savings };
  }

  function SB_updateSummary(container, items, discountType, discountValue) {
    var r = SB_calcTotals(items, discountType, discountValue);
    var totalEl = container.querySelector('.BS_fbt-total-price');
    var origEl = container.querySelector('.BS_fbt-original-price');
    var saveEl = container.querySelector('.BS_fbt-savings');

    if (totalEl) totalEl.textContent = SB_formatMoney(r.total);
    if (origEl) {
      origEl.style.display = r.savings > 0 ? '' : 'none';
      origEl.textContent = SB_formatMoney(r.subtotal);
    }
    if (saveEl) {
      saveEl.style.display = r.savings > 0 ? '' : 'none';
      saveEl.textContent = 'Save ' + SB_formatMoney(r.savings);
    }
  }

  function SB_buildWidget(root, config, styleConfig) {
    var relatedProducts = config.products || [];
    var discountType = config.discountType || 'none';
    var discountValue = Number(config.discountValue) || 0;

    var sc = styleConfig || {};
    var primaryColor = sc.primaryColor || '#10B981';
    var primaryHover = sc.primaryHover || '#059669';
    var textColor = sc.textColor || '#111827';
    var bgColor = sc.backgroundColor || '#FFFFFF';
    var borderColor = sc.borderColor || '#E5E7EB';
    var radius = (sc.borderRadius || 8) + 'px';

    var mainTitle = root.getAttribute('data-product-title') || '';
    var mainPrice = parseInt(root.getAttribute('data-product-price') || '0', 10);
    var mainVariantId = root.getAttribute('data-variant-id') || '';
    var mainImage = root.getAttribute('data-product-image') || '';

    var allItems = [];
    allItems.push({
      variantId: mainVariantId,
      title: mainTitle,
      price: mainPrice,
      imageUrl: mainImage,
      checked: true
    });

    relatedProducts.forEach(function (p) {
      allItems.push({
        variantId: String(p.variantId || ''),
        title: String(p.title || ''),
        price: Number(p.price) || 0,
        imageUrl: String(p.imageUrl || ''),
        checked: true
      });
    });

    if (allItems.length < 2) return;

    var imagesHtml = allItems.map(function (item, i) {
      var img = item.imageUrl
        ? '<img src="' + SB_escapeHtml(item.imageUrl) + '" alt="' + SB_escapeHtml(item.title) + '" loading="lazy" class="BS_fbt-img">'
        : '<div class="BS_fbt-img BS_fbt-img--placeholder"></div>';
      var plus = i < allItems.length - 1 ? '<span class="BS_fbt-sep" aria-hidden="true">+</span>' : '';
      return '<div class="BS_fbt-img-wrap">' + img + '</div>' + plus;
    }).join('');

    var checksHtml = allItems.map(function (item, i) {
      var cid = 'sb-fbt-c' + i;
      return '<label class="BS_fbt-check-row" for="' + cid + '">'
        + '<input type="checkbox" id="' + cid + '" class="BS_fbt-checkbox" data-index="' + i + '" checked>'
        + '<span class="BS_fbt-check-title">' + SB_escapeHtml(item.title) + '</span>'
        + '<span class="BS_fbt-check-price">' + SB_formatMoney(item.price) + '</span>'
        + '</label>';
    }).join('');

    var init = SB_calcTotals(allItems, discountType, discountValue);

    var html = '<div class="BS_fbt-widget" style="'
      + '--sb-fbt-primary:' + primaryColor + ';'
      + '--sb-fbt-primary-hover:' + primaryHover + ';'
      + '--sb-fbt-text:' + textColor + ';'
      + '--sb-fbt-bg:' + bgColor + ';'
      + '--sb-fbt-border:' + borderColor + ';'
      + '--sb-fbt-radius:' + radius + '">'
      + '<h3 class="BS_fbt-title">Frequently Bought Together</h3>'
      + '<div class="BS_fbt-images">' + imagesHtml + '</div>'
      + '<div class="BS_fbt-checks">' + checksHtml + '</div>'
      + '<div class="BS_fbt-summary">'
      + '<span class="BS_fbt-label">Total:</span>'
      + '<span class="BS_fbt-original-price" style="' + (init.savings > 0 ? '' : 'display:none') + '">' + SB_formatMoney(init.subtotal) + '</span>'
      + '<span class="BS_fbt-total-price">' + SB_formatMoney(init.total) + '</span>'
      + '<span class="BS_fbt-savings" style="' + (init.savings > 0 ? '' : 'display:none') + '">Save ' + SB_formatMoney(init.savings) + '</span>'
      + '</div>'
      + '<button type="button" class="BS_fbt-add-btn">Add All to Cart</button>'
      + '</div>';

    root.innerHTML = html;

    root.querySelectorAll('.BS_fbt-checkbox').forEach(function (cb) {
      cb.addEventListener('change', function () {
        allItems[parseInt(cb.getAttribute('data-index'), 10)].checked = cb.checked;
        SB_updateSummary(root, allItems, discountType, discountValue);
      });
    });

    var btn = root.querySelector('.BS_fbt-add-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        var payload = allItems.filter(function (item) {
          return item.checked && item.variantId;
        }).map(function (item) {
          return { id: item.variantId, quantity: 1 };
        });

        if (!payload.length) return;

        btn.disabled = true;
        btn.textContent = 'Adding…';

        fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: payload })
        })
          .then(function (res) {
            return res.json().then(function (data) {
              if (!res.ok) throw data;
              return data;
            });
          })
          .then(function (data) {
            SB_showToast('Added to cart');
            btn.disabled = false;
            btn.textContent = 'Add All to Cart';
            window.dispatchEvent(new CustomEvent('sb:fbt:added', { detail: data }));
          })
          .catch(function (err) {
            var msg = (err && (err.description || err.message)) || 'Could not add to cart. Please try again.';
            SB_showToast(msg);
            btn.disabled = false;
            btn.textContent = 'Add All to Cart';
          });
      });
    }
  }

  function SB_init() {
    var root = document.getElementById('sb-fbt-root');
    if (!root) return;

    var productId = root.getAttribute('data-product-id');
    var appUrl = window.SB_APP_URL;
    if (!productId || !appUrl) return;

    var shop = (window.Shopify && window.Shopify.shop) ? window.Shopify.shop : '';
    var shopParam = shop ? '?shop=' + encodeURIComponent(shop) : '';

    fetch(appUrl + '/api/public/fbt/product/' + productId + (shop ? '?shop=' + encodeURIComponent(shop) : ''))
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (config) {
        if (!config || !config.active) return;

        fetch(appUrl + '/api/public/style-config' + shopParam)
          .then(function (res) { return res.ok ? res.json() : null; })
          .catch(function () { return null; })
          .then(function (styleConfig) {
            SB_injectStyles();
            SB_buildWidget(root, config, styleConfig);
          });
      })
      .catch(function (err) {
        console.error('SmartBundle FBT: failed to load', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', SB_init);
  } else {
    SB_init();
  }

  document.addEventListener('shopify:section:load', SB_init);
})();
