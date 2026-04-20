function SB_setBannerMessage(buttonElement, message) {
  const container = buttonElement?.closest('.SB_bundle_container');
  if (!container) {
    return;
  }

  let banner = container.querySelector('.SB_toast_banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'SB_toast_banner SB_toast_banner--error';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    container.appendChild(banner);
  }

  banner.textContent = message;
}

function SB_clearBanner(buttonElement) {
  const container = buttonElement?.closest('.SB_bundle_container');
  const banner = container?.querySelector('.SB_toast_banner');
  if (banner) {
    banner.remove();
  }
}

function SB_toFullGid(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (/^gid:\/\/shopify\/ProductVariant\//.test(raw)) {
    return raw;
  }

  const numeric = raw.match(/^\d+$/);
  if (numeric) {
    return `gid://shopify/ProductVariant/${numeric[0]}`;
  }

  return raw;
}

function SB_extractNumericVariantId(value) {
  const raw = String(value || '').trim();
  if (/^\d+$/.test(raw)) {
    return raw;
  }

  const match = raw.match(/(\d+)$/);
  return match ? match[1] : raw;
}

async function SB_getCartVariantIds() {
  const response = await fetch('/cart.js', { method: 'GET', headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error('Unable to retrieve cart contents');
  }

  const cart = await response.json();
  return Array.isArray(cart.items)
    ? cart.items
        .map((item) => String(item.variant_id || item.id || '').trim())
        .filter((id) => id.length > 0)
    : [];
}

function SB_variantIdsOverlap(existingIds, variantIds) {
  const normalizedExisting = existingIds.map((id) => SB_extractNumericVariantId(id));
  const normalizedCandidates = variantIds.map((id) => SB_extractNumericVariantId(id));
  return normalizedCandidates.filter((id) => normalizedExisting.includes(id));
}

function SB_parseVariantNames(buttonElement) {
  const rawNames = buttonElement?.getAttribute('data-sb-variant-names') || '';
  return rawNames
    .split('|~|')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

window.SB_addBundleToCart = async function SB_addBundleToCart(variantIds, variantNames, buttonElement) {
  if (!Array.isArray(variantIds) || !variantIds.length) {
    if (buttonElement) {
      SB_setBannerMessage(buttonElement, 'Bundle cannot be added because the variant list is empty.');
      buttonElement.disabled = false;
      buttonElement.textContent = buttonElement.getAttribute('data-default-text') || 'Add Bundle';
    }
    return;
  }

  const defaultButtonText =
    (buttonElement && buttonElement.getAttribute('data-default-text')) ||
    (buttonElement && buttonElement.textContent.trim()) ||
    'Add Bundle';

  if (buttonElement) {
    buttonElement.disabled = true;
    buttonElement.setAttribute('aria-busy', 'true');
    buttonElement.textContent = 'Adding Bundle...';
    SB_clearBanner(buttonElement);
  }

  let duplicateIds = [];
  try {
    const existingIds = await SB_getCartVariantIds();
    duplicateIds = SB_variantIdsOverlap(existingIds, variantIds);
  } catch (error) {
    SB_setBannerMessage(buttonElement, 'Unable to validate cart contents before adding the bundle. Please try again.');
    buttonElement.disabled = false;
    buttonElement.setAttribute('aria-busy', 'false');
    buttonElement.textContent = defaultButtonText;
    console.error('SmartBundle AI: failed to fetch cart contents', error);
    return;
  }

  if (duplicateIds.length) {
    const duplicateNames = variantNames.length ? variantNames.join(', ') : 'bundle items';
    SB_setBannerMessage(buttonElement, `This bundle contains products already in your cart: ${duplicateNames}. Remove duplicates before adding the bundle.`);
    buttonElement.disabled = false;
    buttonElement.setAttribute('aria-busy', 'false');
    buttonElement.textContent = defaultButtonText;
    return;
  }

  const items = variantIds.map((variantId) => {
    const numericId = SB_extractNumericVariantId(variantId);
    const fullGid = SB_toFullGid(variantId);

    return {
      id: numericId || variantId,
      quantity: 1,
      properties: {
        SB_variant_gid: fullGid,
      },
    };
  });

  try {
    const response = await fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ items }),
    });

    const responseBody = await response.json().catch(() => ({}));
    const errorMessage = responseBody.description || responseBody.message || '';
    const isOutOfStock = /out of stock|sold out|unavailable/i.test(errorMessage);
    const isCartLimit = /limit|maximum|allowed/i.test(errorMessage);

    if (!response.ok) {
      const itemLabel = variantNames.length ? variantNames.join(', ') : 'bundle items';
      const userMessage = isCartLimit
        ? 'Your cart has reached the shop limit. Remove items before adding the bundle.'
        : isOutOfStock
        ? `One or more bundle items are unavailable: ${itemLabel}. Please refresh the page and try again.`
        : `Unable to add the bundle to cart right now. ${errorMessage || 'Please try again.'}`;

      SB_setBannerMessage(buttonElement, userMessage);

      if (response.status >= 500) {
        console.error('SmartBundle AI: /cart/add.js server error', responseBody);
      }
      buttonElement.disabled = false;
      buttonElement.setAttribute('aria-busy', 'false');
      buttonElement.textContent = defaultButtonText;
      return;
    }

    window.location.href = '/checkout';
  } catch (error) {
    SB_setBannerMessage(buttonElement, 'There was a network issue adding the bundle. Please try again.');
    console.error('SmartBundle AI: SB_addBundleToCart failed', error);
    buttonElement.disabled = false;
    buttonElement.setAttribute('aria-busy', 'false');
    buttonElement.textContent = defaultButtonText;
  }
};

window.SB_addBundleToCartFromButton = function SB_addBundleToCartFromButton(buttonElement) {
  if (!buttonElement) {
    return;
  }

  const rawVariantIds = buttonElement.getAttribute('data-sb-variants') || '';
  const variantIds = rawVariantIds
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const variantNames = SB_parseVariantNames(buttonElement);
  return window.SB_addBundleToCart(variantIds, variantNames, buttonElement);
};
