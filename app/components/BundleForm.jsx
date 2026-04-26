import { useState, useEffect, useRef } from 'react';
import { useFetcher, useNavigate } from 'react-router';

const DISPLAY_LOCATIONS = [
  { key: 'product_page', label: 'Product Page' },
  { key: 'cart', label: 'Cart' },
  { key: 'cart_drawer', label: 'Cart Drawer' },
];

const DISCOUNT_TABS = [
  { value: 'percentage', label: 'Percentage' },
  { value: 'fixed_amount', label: 'Fixed Amount' },
  { value: 'bogo', label: 'BOGO' },
];

function gidToId(gid) {
  return gid?.split('/').pop() ?? gid;
}

function computeDiscount(type, value, products) {
  const total = products.reduce((s, p) => s + Number(p.price || 0) * (p.quantity || 1), 0);
  if (type === 'bogo' && products.length > 0) {
    const cheapest = Math.min(...products.map((p) => Number(p.price || 0)));
    const discounted = Math.max(0, total - cheapest);
    const pct = total > 0 ? (cheapest / total) * 100 : 0;
    return { total, discounted, pct, savings: cheapest };
  }
  const v = parseFloat(value);
  if (!value || isNaN(v) || v <= 0) return { total, discounted: total, pct: 0, savings: 0 };
  if (type === 'percentage') {
    const savings = total * (v / 100);
    return { total, discounted: total - savings, pct: v, savings };
  }
  if (type === 'fixed_amount') {
    const discounted = Math.max(0, total - v);
    return { total, discounted, pct: total > 0 ? (v / total) * 100 : 0, savings: v };
  }
  return { total, discounted: total, pct: 0, savings: 0 };
}

// ── Product row ──────────────────────────────────────────────────────────────

function ProductRow({ product, quantity, onQtyChange, onRemove }) {
  const price = product.price ?? '0.00';
  const imgUrl = product.imageUrl ?? product.featuredImage?.url;
  return (
    <div
      className="BS_product-row flex items-center gap-3 p-3 rounded-lg"
      style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
    >
      {/* Drag handle — visual only */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="currentColor"
        className="shrink-0 cursor-grab"
        style={{ color: 'var(--border)' }}
      >
        <circle cx="4" cy="3" r="1.2" />
        <circle cx="10" cy="3" r="1.2" />
        <circle cx="4" cy="7" r="1.2" />
        <circle cx="10" cy="7" r="1.2" />
        <circle cx="4" cy="11" r="1.2" />
        <circle cx="10" cy="11" r="1.2" />
      </svg>

      {imgUrl ? (
        <img src={imgUrl} alt={product.title} className="w-12 h-12 rounded-lg object-cover shrink-0" />
      ) : (
        <div
          className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-lg"
          style={{ background: 'var(--background-section, #F3F4F6)' }}
        >
          📦
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {product.title}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          ${Number(price).toFixed(2)}
        </p>
      </div>

      {/* Qty stepper */}
      <div className="flex items-center shrink-0" style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => onQtyChange(Math.max(1, quantity - 1))}
          className="w-7 h-7 flex items-center justify-center text-base font-bold transition-colors"
          style={{ background: 'var(--card)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer' }}
        >
          −
        </button>
        <span
          className="w-8 h-7 flex items-center justify-center text-sm"
          style={{ borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          {quantity}
        </span>
        <button
          type="button"
          onClick={() => onQtyChange(quantity + 1)}
          className="w-7 h-7 flex items-center justify-center text-base font-bold transition-colors"
          style={{ background: 'var(--card)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer' }}
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="w-7 h-7 rounded flex items-center justify-center text-xs shrink-0"
        style={{ background: 'var(--error-light, #FEE2E2)', color: 'var(--error, #EF4444)', border: 'none', cursor: 'pointer' }}
      >
        ✕
      </button>
    </div>
  );
}

// ── BOGO preview visual ──────────────────────────────────────────────────────

function BogoPreview({ products }) {
  if (products.length < 2) {
    return (
      <div
        className="rounded-lg flex items-center justify-center py-5"
        style={{ background: 'var(--background-section, #F3F4F6)', border: '2px dashed var(--border)' }}
      >
        <p className="text-xs" style={{ color: 'var(--text-muted, #9CA3AF)' }}>
          Add at least 2 products above to preview BOGO
        </p>
      </div>
    );
  }

  const sorted = [...products].sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  const cheapest = sorted[0];
  const paid = sorted[sorted.length - 1];
  const extraCount = products.length - 2;

  function ProductThumb({ product, isFree }) {
    const img = product.imageUrl ?? product.featuredImage?.url;
    return (
      <div className="BS_bogo-thumb flex flex-col items-center gap-1.5">
        <div className="relative">
          {img ? (
            <img
              src={img}
              alt={product.title}
              className="w-16 h-16 rounded-lg object-cover"
              style={{ border: `2px solid ${isFree ? 'var(--primary)' : 'var(--border)'}` }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-lg flex items-center justify-center text-xl"
              style={{ background: 'var(--background-section, #F3F4F6)', border: `2px solid ${isFree ? 'var(--primary)' : 'var(--border)'}` }}
            >
              📦
            </div>
          )}
          {isFree && (
            <span
              className="absolute -top-2 -right-2 text-xs font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--primary)', color: '#fff', lineHeight: '1.2' }}
            >
              FREE
            </span>
          )}
        </div>
        <div className="text-center max-w-18">
          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {product.title}
          </p>
          {isFree ? (
            <p className="text-xs line-through" style={{ color: 'var(--text-muted, #9CA3AF)' }}>
              ${Number(product.price || 0).toFixed(2)}
            </p>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              ${Number(product.price || 0).toFixed(2)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <ProductThumb product={paid} isFree={false} />
      {extraCount > 0 && (
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted, #9CA3AF)' }}>
          +{extraCount} more
        </span>
      )}
      <span className="text-lg font-bold" style={{ color: 'var(--text-muted, #9CA3AF)' }}>+</span>
      <ProductThumb product={cheapest} isFree={true} />
    </div>
  );
}

// ── Live preview card ────────────────────────────────────────────────────────

function PreviewCard({ title, selectedProducts, discountType, discountValue, active }) {
  const { total, discounted, pct, savings } = computeDiscount(discountType, discountValue, selectedProducts);
  const hasDiscount = savings > 0;
  const previewImages = selectedProducts.slice(0, 3);

  return (
    <div
      className="BS_preview-card rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border)', background: 'var(--card)', position: 'sticky', top: '24px' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--background-section, #F3F4F6)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
          Live Preview
        </p>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            background: active ? 'var(--primary-light, #D1FAE5)' : 'var(--background-section, #F3F4F6)',
            color: active ? 'var(--primary-dark, #047857)' : 'var(--text-muted, #9CA3AF)',
            border: '1px solid',
            borderColor: active ? 'transparent' : 'var(--border)',
          }}
        >
          {active ? 'Active' : 'Draft'}
        </span>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Product images */}
        {selectedProducts.length === 0 ? (
          <div
            className="rounded-lg flex flex-col items-center justify-center py-8 gap-2"
            style={{ background: 'var(--background-section, #F3F4F6)', border: '2px dashed var(--border)' }}
          >
            <span className="text-2xl">📦</span>
            <p className="text-xs" style={{ color: 'var(--text-muted, #9CA3AF)' }}>No products selected</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {previewImages.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2">
                {(p.imageUrl ?? p.featuredImage?.url) ? (
                  <img
                    src={p.imageUrl ?? p.featuredImage?.url}
                    alt={p.title}
                    className="w-14 h-14 rounded-lg object-cover"
                    style={{ border: '1px solid var(--border)' }}
                  />
                ) : (
                  <div
                    className="w-14 h-14 rounded-lg flex items-center justify-center text-xl"
                    style={{ background: 'var(--background-section, #F3F4F6)', border: '1px solid var(--border)' }}
                  >
                    📦
                  </div>
                )}
                {i < previewImages.length - 1 && (
                  <span className="font-bold" style={{ color: 'var(--text-muted, #9CA3AF)' }}>+</span>
                )}
              </div>
            ))}
            {selectedProducts.length > 3 && (
              <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--background-section, #F3F4F6)', color: 'var(--text-secondary)' }}>
                +{selectedProducts.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Bundle name */}
        <p className="font-semibold text-base leading-tight" style={{ color: title ? 'var(--text-primary)' : 'var(--text-muted, #9CA3AF)' }}>
          {title || 'Your Bundle Name'}
        </p>

        {/* Pricing */}
        {selectedProducts.length > 0 && (
          discountType === 'bogo' ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  ${discounted.toFixed(2)}
                </span>
                <span className="text-sm line-through" style={{ color: 'var(--text-muted, #9CA3AF)' }}>
                  ${total.toFixed(2)}
                </span>
              </div>
              <span
                className="self-start text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--primary-light, #D1FAE5)', color: 'var(--primary-dark, #047857)' }}
              >
                BOGO — 1 Item FREE
              </span>
              {(() => {
                const cheapest = [...selectedProducts].sort(
                  (a, b) => Number(a.price || 0) - Number(b.price || 0),
                )[0];
                return (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {cheapest.title} (${Number(cheapest.price || 0).toFixed(2)}) is FREE
                  </p>
                );
              })()}
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              {hasDiscount && (
                <span className="text-sm line-through" style={{ color: 'var(--text-muted, #9CA3AF)' }}>
                  ${total.toFixed(2)}
                </span>
              )}
              <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                ${discounted.toFixed(2)}
              </span>
              {pct > 0 && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'var(--primary-light, #D1FAE5)', color: 'var(--primary-dark, #047857)' }}
                >
                  Save {Math.round(pct)}%
                </span>
              )}
            </div>
          )
        )}

        {/* Fake CTA */}
        <button
          type="button"
          disabled
          className="w-full py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--primary)', color: '#fff', cursor: 'default', opacity: 0.9 }}
        >
          Add Bundle to Cart
        </button>

        <p className="text-xs text-center" style={{ color: 'var(--text-muted, #9CA3AF)' }}>
          Preview only — updates as you edit
        </p>
      </div>
    </div>
  );
}

// ── Main form ────────────────────────────────────────────────────────────────

export default function BundleForm({ bundle = null, intent }) {
  const fetcher = useFetcher();
  const navigate = useNavigate();

  const [title, setTitle] = useState(bundle?.title ?? '');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState(bundle?.discountType ?? 'percentage');
  const [discountValue, setDiscountValue] = useState(
    bundle?.discountValue != null ? String(bundle.discountValue) : '',
  );
  const [active, setActive] = useState(bundle ? bundle.status === 'active' : true);
  const [displayLocations, setDisplayLocations] = useState({
    product_page: true,
    cart: false,
    cart_drawer: false,
  });
  const [selectedProducts, setSelectedProducts] = useState(() => {
    if (!bundle?.productIds) return [];
    const ids = Array.isArray(bundle.productIds) ? bundle.productIds : [];
    return ids.map((item) =>
      typeof item === 'object' && item !== null
        ? { quantity: 1, ...item }
        : { id: item, gid: null, title: item, price: '0.00', imageUrl: null, quantity: 1 },
    );
  });
  const [errors, setErrors] = useState({});

  // Snapshot of values at mount — used to compute isDirty
  const initialRef = useRef({
    title: bundle?.title ?? '',
    discountType: bundle?.discountType ?? 'percentage',
    discountValue: bundle?.discountValue != null ? String(bundle.discountValue) : '',
    active: bundle ? bundle.status === 'active' : true,
    selectedProducts: (() => {
      if (!bundle?.productIds) return [];
      const ids = Array.isArray(bundle.productIds) ? bundle.productIds : [];
      return ids.map((item) =>
        typeof item === 'object' && item !== null
          ? { quantity: 1, ...item }
          : { id: item, gid: null, title: item, price: '0.00', imageUrl: null, quantity: 1 },
      );
    })(),
  });

  function productsKey(products) {
    return JSON.stringify(
      [...products]
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map((p) => ({ id: p.id, quantity: p.quantity })),
    );
  }

  const isDirty =
    title !== initialRef.current.title ||
    discountType !== initialRef.current.discountType ||
    discountValue !== initialRef.current.discountValue ||
    active !== initialRef.current.active ||
    productsKey(selectedProducts) !== productsKey(initialRef.current.selectedProducts);

  const isSubmitting = fetcher.state !== 'idle';

  // Show/hide save bar based on dirty state
  useEffect(() => {
    if (isDirty) {
      shopify.saveBar.show('bundle-save-bar');
    } else {
      shopify.saveBar.hide('bundle-save-bar');
    }
  }, [isDirty]);

  // Hide save bar and navigate on successful save
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.saveBar.hide('bundle-save-bar');
      navigate('/app/bundles');
    }
  }, [fetcher.data, navigate]);

  // Hide save bar on unmount (e.g. browser back)
  useEffect(() => {
    return () => shopify.saveBar.hide('bundle-save-bar');
  }, []);

  // ── Resource Picker ──────────────────────────────────────────────────────

  async function handleSelectProducts() {
    const selected = await shopify.resourcePicker({
      type: 'product',
      multiple: true,
      action: 'add',
      filter: { archived: false, draft: false, variants: true },
      selectionIds: selectedProducts.map((p) => ({
        id: p.gid ?? `gid://shopify/Product/${p.id}`,
        variants: (p.variants ?? []).map((v) => ({ id: v.id })),
      })),
    });

    if (selected) {
      const mapped = selected.map((p) => ({
        id: gidToId(p.id),
        gid: p.id,
        title: p.title,
        imageUrl: p.images[0]?.originalSrc ?? null,
        variantId: p.variants[0]?.id,
        price: p.variants[0]?.price ?? '0',
        quantity: 1,
      }));
      setSelectedProducts(mapped);
      setErrors((prev) => ({ ...prev, products: '' }));
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function removeProduct(id) {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== id));
  }

  function updateQty(id, qty) {
    setSelectedProducts((prev) => prev.map((p) => (p.id === id ? { ...p, quantity: qty } : p)));
  }

  function toggleLocation(key) {
    setDisplayLocations((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleDiscard() {
    const init = initialRef.current;
    setTitle(init.title);
    setDiscountType(init.discountType);
    setDiscountValue(init.discountValue);
    setActive(init.active);
    setSelectedProducts(init.selectedProducts);
    setErrors({});
  }

  function validate() {
    const errs = {};
    if (!title.trim()) errs.title = 'Bundle name is required';
    if (selectedProducts.length < 2) errs.products = 'Select at least 2 products';
    if (discountType !== 'bogo') {
      const v = parseFloat(discountValue);
      if (!discountValue || isNaN(v) || v <= 0) {
        errs.discountValue = 'Discount value is required';
      } else if (discountType === 'percentage' && (v < 1 || v > 99)) {
        errs.discountValue = 'Percentage must be between 1 and 99';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function submit(status) {
    if (!validate()) return;
    const data = new FormData();
    data.set('intent', intent);
    data.set('title', title.trim());
    data.set('discountType', discountType === 'bogo' ? 'percentage' : discountType);
    data.set('discountValue', discountType === 'bogo' ? '100' : discountValue);
    data.set('status', status);
    data.set(
      'productIds',
      JSON.stringify(
        selectedProducts.map(({ id, gid, title: t, price, imageUrl, variantId, quantity }) => ({
          id, gid, title: t, price, imageUrl, variantId, quantity,
        })),
      ),
    );
    if (intent === 'update' && bundle?.id) data.set('id', bundle.id);
    fetcher.submit(data, { method: 'post' });
  }

  const serverError = fetcher.data?.error;
  const { savings } = computeDiscount(discountType, discountValue, selectedProducts);

  return (
    <div className="flex flex-col gap-6">

      <ui-save-bar id="bundle-save-bar">
        <button variant="primary" id="save-activate-btn" onClick={() => submit('active')}>
          Save &amp; Activate
        </button>
        <button id="discard-btn" onClick={handleDiscard}>
          Discard changes
        </button>
      </ui-save-bar>

      {/* Server error banner */}
      {serverError && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-md"
          style={{ background: 'var(--error-light, #FEE2E2)', border: '1px solid var(--error, #EF4444)' }}
        >
          <span style={{ color: 'var(--error, #EF4444)', flexShrink: 0 }}>⚠</span>
          <p className="text-sm" style={{ color: 'var(--error, #EF4444)' }}>{serverError}</p>
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* ── LEFT COLUMN (60%) ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 w-full lg:w-[60%]">

          {/* Section 1 — Bundle Details */}
          <s-section>
            <div className="p-5 flex flex-col gap-4">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Bundle Details
              </p>
              <div>
                <s-text-field
                  label="Bundle Name"
                  defaultValue={title}
                  placeholder="e.g., Summer Collection Bundle"
                  onInput={(e) => {
                    setTitle(e.target.value);
                    setErrors((prev) => ({ ...prev, title: '' }));
                  }}
                />
                {errors.title && (
                  <p className="text-xs mt-1" style={{ color: 'var(--error, #EF4444)' }}>{errors.title}</p>
                )}
              </div>
              <s-text-area
                label="Description (optional)"
                defaultValue={description}
                placeholder="Describe what makes this bundle special..."
                rows="3"
                onInput={(e) => setDescription(e.target.value)}
              />
            </div>
          </s-section>

          {/* Section 2 — Products */}
          <s-section>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Products</p>
                {selectedProducts.length > 0 && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'var(--primary-light, #D1FAE5)', color: 'var(--primary-dark, #047857)' }}
                  >
                    {selectedProducts.length} selected
                  </span>
                )}
              </div>

              {/* Add Products dashed button */}
              <button
                type="button"
                onClick={handleSelectProducts}
                className="BS_add-products w-full border-2 border-dashed rounded-lg py-8 flex flex-col items-center gap-2 transition-all"
                style={{
                  borderColor: errors.products ? 'var(--error, #EF4444)' : 'var(--border)',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--background-section, #F3F4F6)';
                  e.currentTarget.style.borderColor = 'var(--primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = errors.products ? 'var(--error, #EF4444)' : 'var(--border)';
                }}
              >
                <span className="text-3xl font-light leading-none" style={{ color: 'var(--primary)' }}>＋</span>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {selectedProducts.length > 0 ? 'Change Products' : 'Add Products'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Select products from your Shopify catalog
                </p>
              </button>

              {errors.products && (
                <p className="text-xs mt-2" style={{ color: 'var(--error, #EF4444)' }}>{errors.products}</p>
              )}

              {/* Product list */}
              {selectedProducts.length > 0 && (
                <div className="flex flex-col gap-2 mt-4">
                  {selectedProducts.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      quantity={product.quantity}
                      onQtyChange={(qty) => updateQty(product.id, qty)}
                      onRemove={() => removeProduct(product.id)}
                    />
                  ))}
                  {selectedProducts.length < 2 && (
                    <p className="text-xs" style={{ color: 'var(--error, #EF4444)' }}>
                      A bundle requires at least 2 products
                    </p>
                  )}
                </div>
              )}
            </div>
          </s-section>

          {/* Section 3 — Discount */}
          <s-section>
            <div className="p-5">
              <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Discount</p>

              {/* Discount type tabs */}
              <div
                className="flex mb-4 rounded-lg overflow-hidden"
                style={{ border: '1px solid var(--border)' }}
              >
                {DISCOUNT_TABS.map((tab, i) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => {
                      setDiscountType(tab.value);
                      setErrors((prev) => ({ ...prev, discountValue: '' }));
                    }}
                    className="flex-1 py-2 text-sm font-medium transition-colors"
                    style={{
                      background: discountType === tab.value ? 'var(--primary)' : 'var(--card)',
                      color: discountType === tab.value ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      borderRight: i < DISCOUNT_TABS.length - 1 ? '1px solid var(--border)' : 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Percentage input + slider */}
              {discountType === 'percentage' && (
                <div className="flex flex-col gap-3">
                  <div>
                    <s-number-field
                      label="Percentage (%)"
                      value={discountValue}
                      min="1"
                      max="50"
                      step="1"
                      placeholder="e.g., 15"
                      onInput={(e) => {
                        setDiscountValue(e.target.value);
                        setErrors((prev) => ({ ...prev, discountValue: '' }));
                      }}
                    />
                    {errors.discountValue && (
                      <p className="text-xs mt-1" style={{ color: 'var(--error, #EF4444)' }}>{errors.discountValue}</p>
                    )}
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={parseFloat(discountValue) || 1}
                    onChange={(e) => {
                      setDiscountValue(e.target.value);
                      setErrors((prev) => ({ ...prev, discountValue: '' }));
                    }}
                    className="w-full"
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted, #9CA3AF)' }}>
                    <span>1%</span><span>25%</span><span>50%</span>
                  </div>
                </div>
              )}

              {/* Fixed amount input */}
              {discountType === 'fixed_amount' && (
                <div>
                  <s-number-field
                    label="Amount ($)"
                    value={discountValue}
                    min="0"
                    step="0.01"
                    placeholder="e.g., 10.00"
                    onInput={(e) => {
                      setDiscountValue(e.target.value);
                      setErrors((prev) => ({ ...prev, discountValue: '' }));
                    }}
                  />
                  {errors.discountValue && (
                    <p className="text-xs mt-1" style={{ color: 'var(--error, #EF4444)' }}>{errors.discountValue}</p>
                  )}
                </div>
              )}

              {/* BOGO section */}
              {discountType === 'bogo' && (
                <div className="flex flex-col gap-4">
                  <div
                    className="rounded-md px-4 py-3"
                    style={{ background: 'var(--primary-light, #D1FAE5)' }}
                  >
                    <p className="text-sm font-medium" style={{ color: 'var(--primary-dark, #047857)' }}>
                      🎁 The cheapest product in your bundle will be automatically applied as FREE when customer adds all items to cart
                    </p>
                  </div>
                  <BogoPreview products={selectedProducts} />
                </div>
              )}

              {/* Live savings banner */}
              {savings > 0 && discountType !== 'bogo' && (
                <div
                  className="mt-4 rounded-md px-4 py-3"
                  style={{ background: 'var(--primary-light, #D1FAE5)' }}
                >
                  <p className="text-sm font-medium" style={{ color: 'var(--primary-dark, #047857)' }}>
                    ✓ Customer saves ${savings.toFixed(2)} on this bundle
                  </p>
                </div>
              )}
            </div>
          </s-section>

          {/* Section 4 — Display & Status */}
          <s-section>
            <div className="p-5">
              <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Display &amp; Status
              </p>

              {/* Show on toggle chips */}
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Show on
                </p>
                <div className="flex flex-wrap gap-2">
                  {DISPLAY_LOCATIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleLocation(key)}
                      className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                      style={{
                        background: displayLocations[key] ? 'var(--primary)' : 'var(--card)',
                        color: displayLocations[key] ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${displayLocations[key] ? 'var(--primary)' : 'var(--border)'}`,
                        cursor: 'pointer',
                      }}
                    >
                      {displayLocations[key] ? '✓ ' : ''}{label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active toggle */}
              <div
                className="flex items-center gap-3 pt-4"
                style={{ borderTop: '1px solid var(--divider, #F3F4F6)' }}
              >
                <s-switch
                  checked={active || undefined}
                  onChange={(e) => setActive(e.target.checked)}
                />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {active ? 'Active' : 'Inactive'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {active
                      ? 'Bundle is live and visible to customers'
                      : 'Bundle is hidden from customers'}
                  </p>
                </div>
              </div>
            </div>
          </s-section>
        </div>

        {/* ── RIGHT COLUMN (40%) — sticky preview ────────────────────────── */}
        <div className="w-full lg:w-[40%]">
          <PreviewCard
            title={title}
            selectedProducts={selectedProducts}
            discountType={discountType}
            discountValue={discountValue}
            active={active}
          />
        </div>
      </div>

    </div>
  );
}
