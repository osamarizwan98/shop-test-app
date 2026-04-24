import { useState, useEffect, useRef } from 'react';
import { useFetcher, useNavigate, Link } from 'react-router';

const DISPLAY_LOCATIONS = [
  { key: 'product_page', label: 'Product Page' },
  { key: 'cart', label: 'Cart' },
  { key: 'cart_drawer', label: 'Cart Drawer' },
];

// JSON string for s-select options attribute
const DISCOUNT_TYPE_OPTIONS = JSON.stringify([
  { label: 'Percentage', value: 'percentage' },
  { label: 'Fixed Amount', value: 'fixed_amount' },
  { label: 'BOGO (Buy One Get One)', value: 'bogo' },
]);

function discountPreview(type, value) {
  if (type === 'bogo') return 'Customer gets the cheapest item free';
  const v = parseFloat(value);
  if (!value || isNaN(v) || v <= 0) return null;
  if (type === 'percentage') return `Customer saves ${v}% off bundle`;
  if (type === 'fixed_amount') return `Customer saves $${v.toFixed(2)} off bundle`;
  return null;
}

// Normalize a Shopify GID to a plain numeric ID string used in productIds JSON
function gidToId(gid) {
  return gid?.split('/').pop() ?? gid;
}

function ProductCard({ product, quantity, onQtyChange, onRemove }) {
  // price is stored as a plain string on selectedProducts objects
  const price = product.price ?? product.variants?.nodes?.[0]?.price ?? '0.00';
  const imgUrl = product.featuredImage?.url;
  return (
    <div
      className="BS_product-card flex items-center gap-3 p-3 rounded-lg"
      style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
    >
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={product.title}
          className="w-12 h-12 rounded object-cover shrink-0"
        />
      ) : (
        <div
          className="w-12 h-12 rounded shrink-0 flex items-center justify-center text-lg"
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
      <div className="flex items-center gap-2 shrink-0">
        <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Qty</label>
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => onQtyChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-14 text-center text-sm rounded px-2 py-1"
          style={{
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          type="button"
          onClick={onRemove}
          className="text-xs px-2 py-1 rounded"
          style={{
            background: 'var(--error-light, #FEE2E2)',
            color: 'var(--error, #EF4444)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function ProductSearch({ selectedIds, onAdd }) {
  const searchFetcher = useFetcher();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const results = searchFetcher.data?.products ?? [];
  const isSearching = searchFetcher.state !== 'idle';

  function handleInput(value) {
    setQuery(value);
    setOpen(true);
    if (value.trim()) {
      searchFetcher.load(`/api/products/search?q=${encodeURIComponent(value.trim())}`);
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const visibleResults = results.filter((p) => !selectedIds.includes(gidToId(p.id)));

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Search products
        </label>
        <input
          type="text"
          value={query}
          placeholder="Type product name..."
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          className="w-full px-3 py-2 rounded-md text-sm"
          style={{
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
      </div>

      {open && (query.trim()) && (
        <div
          className="BS_search-dropdown absolute z-50 w-full mt-1 rounded-lg overflow-hidden"
          style={{
            border: '1px solid var(--border)',
            background: 'var(--card)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          {isSearching && (
            <div className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Searching…
            </div>
          )}
          {!isSearching && visibleResults.length === 0 && (
            <div className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              No products found
            </div>
          )}
          {visibleResults.map((product) => {
            const price = product.variants?.nodes?.[0]?.price ?? '0.00';
            const imgUrl = product.featuredImage?.url;
            return (
              <button
                key={product.id}
                type="button"
                className="BS_search-result w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--background-section, #F3F4F6)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => {
                  onAdd(product);
                  setQuery('');
                  setOpen(false);
                }}
              >
                {imgUrl ? (
                  <img src={imgUrl} alt={product.title} className="w-8 h-8 rounded object-cover shrink-0" />
                ) : (
                  <div
                    className="w-8 h-8 rounded shrink-0 flex items-center justify-center text-sm"
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
                <span className="text-xs font-medium shrink-0" style={{ color: 'var(--primary)' }}>
                  + Add
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BundleForm({ bundle = null, intent }) {
  const fetcher = useFetcher();
  const navigate = useNavigate();

  // Local state — uncontrolled web components read from here on submit
  const [title, setTitle] = useState(bundle?.title ?? '');
  const [description, setDescription] = useState(''); // not in schema yet
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
  // selectedProducts: array of { id (plain), gid, title, price, featuredImage, quantity }
  const [selectedProducts, setSelectedProducts] = useState(() => {
    if (!bundle?.productIds) return [];
    const ids = Array.isArray(bundle.productIds) ? bundle.productIds : [];
    // productIds may be plain ID strings or objects; normalise to objects
    return ids.map((item) =>
      typeof item === 'object' && item !== null
        ? { quantity: 1, ...item }
        : { id: item, gid: null, title: item, price: '0.00', featuredImage: null, quantity: 1 },
    );
  });
  const [errors, setErrors] = useState({});

  const isSubmitting = fetcher.state !== 'idle';

  // Navigate to list after successful save
  useEffect(() => {
    if (fetcher.data?.success) {
      navigate('/app/bundles');
    }
  }, [fetcher.data, navigate]);

  function toggleLocation(key) {
    setDisplayLocations((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function validate() {
    const errs = {};
    if (!title.trim()) errs.title = 'Bundle name is required';
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

  function addProduct(product) {
    const id = gidToId(product.id);
    setSelectedProducts((prev) => {
      if (prev.some((p) => p.id === id)) return prev;
      const price = product.variants?.nodes?.[0]?.price ?? '0.00';
      return [
        ...prev,
        { id, gid: product.id, title: product.title, price, featuredImage: product.featuredImage, quantity: 1 },
      ];
    });
  }

  function removeProduct(id) {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== id));
  }

  function updateQty(id, qty) {
    setSelectedProducts((prev) => prev.map((p) => (p.id === id ? { ...p, quantity: qty } : p)));
  }

  function handleSubmit() {
    if (!validate()) return;

    const data = new FormData();
    data.set('intent', intent);
    data.set('title', title.trim());
    // Map BOGO → percentage/100 until schema enum is extended
    data.set('discountType', discountType === 'bogo' ? 'percentage' : discountType);
    data.set('discountValue', discountType === 'bogo' ? '100' : discountValue);
    data.set('status', active ? 'active' : 'inactive');
    data.set('productIds', JSON.stringify(selectedProducts.map(({ id, gid, title, price, featuredImage, quantity }) => ({ id, gid, title, price, featuredImage, quantity }))));
    if (intent === 'update' && bundle?.id) data.set('id', bundle.id);

    fetcher.submit(data, { method: 'post' });
  }

  const serverError = fetcher.data?.error;
  const preview = discountPreview(discountType, discountValue);

  return (
    <div className="flex flex-col gap-5 max-w-3xl">

      {/* Server-side error */}
      {serverError && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-md"
          style={{
            background: 'var(--error-light, #FEE2E2)',
            border: '1px solid var(--error, #EF4444)',
          }}
        >
          <span style={{ color: 'var(--error, #EF4444)', flexShrink: 0 }}>⚠</span>
          <p className="text-sm" style={{ color: 'var(--error, #EF4444)' }}>{serverError}</p>
        </div>
      )}

      {/* ── Section 1: Bundle Details ── */}
      <s-section>
        <div className="p-5">
          <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Bundle Details
          </p>
          <div className="flex flex-col gap-4">

            {/* Name */}
            <div>
              <s-text-field
                label="Bundle Name"
                defaultValue={title}
                placeholder="e.g., Summer Collection Bundle"
                onInput={(e) => {
                  setTitle(e.target.value);
                  setErrors((p) => ({ ...p, title: '' }));
                }}
              />
              {errors.title && (
                <p className="text-xs mt-1" style={{ color: 'var(--error, #EF4444)' }}>
                  {errors.title}
                </p>
              )}
            </div>

            {/* Description — UI only, not persisted until schema updated */}
            <s-text-area
              label="Description (optional)"
              defaultValue={description}
              placeholder="Describe what makes this bundle special..."
              onInput={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
      </s-section>

      {/* ── Section 2: Products ── */}
      <s-section>
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Products
            </p>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {selectedProducts.length} selected
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <ProductSearch
              selectedIds={selectedProducts.map((p) => p.id)}
              onAdd={addProduct}
            />

            {selectedProducts.length > 0 ? (
              <div className="flex flex-col gap-2 mt-1">
                {selectedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    quantity={product.quantity}
                    onQtyChange={(qty) => updateQty(product.id, qty)}
                    onRemove={() => removeProduct(product.id)}
                  />
                ))}
              </div>
            ) : (
              <div
                className="rounded-lg border-2 border-dashed flex flex-col items-center justify-center py-8 gap-1"
                style={{ borderColor: 'var(--border)', background: 'var(--background-section, #F3F4F6)' }}
              >
                <span className="text-2xl">📦</span>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  No products added yet
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted, #9CA3AF)' }}>
                  Search above to add products to this bundle
                </p>
              </div>
            )}
          </div>
        </div>
      </s-section>

      {/* ── Section 3: Discount ── */}
      <s-section>
        <div className="p-5">
          <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Discount
          </p>
          <div className="flex flex-col gap-4">

            <s-select
              label="Discount Type"
              options={DISCOUNT_TYPE_OPTIONS}
              value={discountType}
              onChange={(e) => {
                setDiscountType(e.target.value);
                setErrors((p) => ({ ...p, discountValue: '' }));
              }}
            />

            {discountType !== 'bogo' && (
              <div>
                <s-number-field
                  label={discountType === 'percentage' ? 'Percentage (%)' : 'Amount ($)'}
                  defaultValue={discountValue}
                  min="0"
                  step={discountType === 'percentage' ? '1' : '0.01'}
                  placeholder={discountType === 'percentage' ? 'e.g., 15' : 'e.g., 10.00'}
                  onInput={(e) => {
                    setDiscountValue(e.target.value);
                    setErrors((p) => ({ ...p, discountValue: '' }));
                  }}
                />
                {errors.discountValue && (
                  <p className="text-xs mt-1" style={{ color: 'var(--error, #EF4444)' }}>
                    {errors.discountValue}
                  </p>
                )}
              </div>
            )}

            {/* Live discount preview */}
            {(preview || discountType === 'bogo') && (
              <div
                className="BS_discount-preview rounded-md px-4 py-3"
                style={{ background: 'var(--primary-light, #D1FAE5)' }}
              >
                <p className="text-sm font-medium" style={{ color: 'var(--primary-dark, #047857)' }}>
                  ✓{' '}
                  {discountType === 'bogo'
                    ? 'Customer gets the cheapest item free'
                    : preview}
                </p>
              </div>
            )}
          </div>
        </div>
      </s-section>

      {/* ── Section 4: Display & Status ── */}
      <s-section>
        <div className="p-5">
          <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Display &amp; Status
          </p>
          <div className="flex flex-col gap-5">

            {/* Show on checkboxes — UI only until displayLocations added to schema */}
            <div>
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                Show on
              </p>
              <div className="flex flex-wrap gap-5">
                {DISPLAY_LOCATIONS.map(({ key, label }) => (
                  <label
                    key={key}
                    className="BS_checkbox-label flex items-center gap-2 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded"
                      style={{ accentColor: 'var(--primary)' }}
                      checked={displayLocations[key]}
                      onChange={() => toggleLocation(key)}
                    />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {label}
                    </span>
                  </label>
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
        </div>
      </s-section>

      {/* ── Form actions ── */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <Link
          to="/app/bundles"
          className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          Cancel
        </Link>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={handleSubmit}
          className="inline-flex items-center px-5 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--primary)', color: 'var(--text-inverted, #fff)', cursor: 'pointer' }}
        >
          {isSubmitting
            ? intent === 'create' ? 'Creating...' : 'Saving...'
            : intent === 'create' ? 'Create Bundle' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
