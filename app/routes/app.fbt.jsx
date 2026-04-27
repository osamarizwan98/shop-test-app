import { useState, useEffect } from 'react';
import { useLoaderData, useFetcher } from 'react-router';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';
import fbtStyles from '../styles/fbt.css?url';

export const links = () => [{ rel: 'stylesheet', href: fbtStyles }];

const FREE_PLAN_MAX = 1;

const PRODUCTS_QUERY = `
  query FbtProducts {
    products(first: 50) {
      nodes {
        id
        title
        featuredImage { url }
        variants(first: 1) {
          nodes { id price }
        }
      }
    }
  }
`;

// ── Loader ─────────────────────────────────────────────────────────────────────
export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  const [configs, productsRes] = await Promise.all([
    prisma.fbtConfig.findMany({
      where: { shop: session.shop },
      include: { products: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    }),
    admin.graphql(PRODUCTS_QUERY),
  ]);

  const { data: gqlData } = await productsRes.json();

  return Response.json({
    configs,
    shopProducts: gqlData?.products?.nodes ?? [],
  });
}

// ── Action ─────────────────────────────────────────────────────────────────────
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');

  if (intent === 'create') {
    const count = await prisma.fbtConfig.count({ where: { shop: session.shop } });
    if (count >= FREE_PLAN_MAX) {
      return Response.json(
        { error: 'Free plan limit reached (max 1 FBT config)' },
        { status: 403 },
      );
    }

    const productId = String(formData.get('productId') ?? '').trim();
    if (!productId) return Response.json({ error: 'productId is required' }, { status: 400 });

    const title = String(formData.get('title') ?? '').trim() || null;
    const isEnabled = formData.get('isActive') !== 'false';

    let products = [];
    try {
      products = JSON.parse(String(formData.get('products') ?? '[]'));
    } catch {
      return Response.json({ error: 'Invalid products JSON' }, { status: 400 });
    }

    const config = await prisma.fbtConfig.create({
      data: {
        shop: session.shop,
        productId,
        title,
        isEnabled,
        products: {
          create: products.map((p) => ({ productId: p.productId, position: p.position ?? 0 })),
        },
      },
      include: { products: { orderBy: { position: 'asc' } } },
    });

    return Response.json({ config });
  }

  if (intent === 'update') {
    const configId = String(formData.get('configId') ?? '').trim();
    if (!configId) return Response.json({ error: 'configId is required' }, { status: 400 });

    const title = String(formData.get('title') ?? '').trim() || null;
    const isEnabled = formData.get('isActive') !== 'false';

    let products = [];
    try {
      products = JSON.parse(String(formData.get('products') ?? '[]'));
    } catch {
      return Response.json({ error: 'Invalid products JSON' }, { status: 400 });
    }

    await prisma.fbtProduct.deleteMany({ where: { fbtConfigId: configId } });
    const config = await prisma.fbtConfig.update({
      where: { id: configId, shop: session.shop },
      data: {
        title,
        isEnabled,
        products: {
          create: products.map((p) => ({ productId: p.productId, position: p.position ?? 0 })),
        },
      },
      include: { products: { orderBy: { position: 'asc' } } },
    });

    return Response.json({ config });
  }

  if (intent === 'delete') {
    const configId = String(formData.get('configId') ?? '').trim();
    if (!configId) return Response.json({ error: 'configId is required' }, { status: 400 });

    await prisma.fbtConfig.delete({ where: { id: configId, shop: session.shop } });
    return Response.json({ ok: true });
  }

  if (intent === 'toggle') {
    const configId = String(formData.get('configId') ?? '').trim();
    if (!configId) return Response.json({ error: 'configId is required' }, { status: 400 });

    const current = await prisma.fbtConfig.findUnique({
      where: { id: configId, shop: session.shop },
      select: { isEnabled: true },
    });
    if (!current) return Response.json({ error: 'Config not found' }, { status: 404 });

    const config = await prisma.fbtConfig.update({
      where: { id: configId, shop: session.shop },
      data: { isEnabled: !current.isEnabled },
    });

    return Response.json({ config });
  }

  return Response.json({ error: 'Unknown intent' }, { status: 400 });
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function FbtPage() {
  const { configs, shopProducts } = useLoaderData();
  const fetcher = useFetcher();
  const busy = fetcher.state !== 'idle';

  // ── Dialog state ────────────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editConfig, setEditConfig] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ── Sheet form state ─────────────────────────────────────────────────────────
  const [sourceId, setSourceId] = useState('');
  const [sourceQ, setSourceQ] = useState('');
  const [related, setRelated] = useState([]);
  const [relatedQ, setRelatedQ] = useState('');
  const [discountType, setDiscountType] = useState('none');
  const [discountValue, setDiscountValue] = useState('');
  const [locations, setLocations] = useState(['product_page']);
  const [isActive, setIsActive] = useState(true);

  // Close dialogs on successful mutation
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && !fetcher.data.error) {
      setSheetOpen(false);
      setDeleteTarget(null);
    }
  }, [fetcher.state, fetcher.data]);

  function resetForm() {
    setSourceId('');
    setSourceQ('');
    setRelated([]);
    setRelatedQ('');
    setDiscountType('none');
    setDiscountValue('');
    setLocations(['product_page']);
    setIsActive(true);
  }

  function openCreate() {
    setEditConfig(null);
    resetForm();
    setSheetOpen(true);
  }

  function openEdit(cfg) {
    setEditConfig(cfg);
    setSourceId(cfg.productId);
    setSourceQ('');
    setRelated(
      cfg.products
        .map((p) => shopProducts.find((sp) => sp.id === p.productId))
        .filter((p) => Boolean(p)),
    );
    setRelatedQ('');
    setDiscountType('none');
    setDiscountValue('');
    setLocations(['product_page']);
    setIsActive(cfg.isEnabled);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    resetForm();
  }

  function handleSave() {
    if (!sourceId || related.length === 0) return;
    const fd = new FormData();
    fd.set('intent', editConfig ? 'update' : 'create');
    if (editConfig) fd.set('configId', editConfig.id);
    fd.set('productId', sourceId);
    fd.set('products', JSON.stringify(related.map((p, i) => ({ productId: p.id, position: i }))));
    fd.set('isActive', String(isActive));
    if (discountType !== 'none') {
      fd.set('discountType', discountType);
      fd.set('discountValue', discountValue);
    }
    fd.set('displayLocations', JSON.stringify(locations));
    fetcher.submit(fd, { method: 'POST' });
  }

  function handleToggle(configId) {
    const fd = new FormData();
    fd.set('intent', 'toggle');
    fd.set('configId', configId);
    fetcher.submit(fd, { method: 'POST' });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const fd = new FormData();
    fd.set('intent', 'delete');
    fd.set('configId', deleteTarget);
    fetcher.submit(fd, { method: 'POST' });
  }

  function addRelated(p) {
    if (related.length >= 3 || related.find((r) => r.id === p.id)) return;
    setRelated((prev) => [...prev, p]);
    setRelatedQ('');
  }

  function toggleLocation(val) {
    setLocations((prev) =>
      prev.includes(val) ? prev.filter((l) => l !== val) : [...prev, val],
    );
  }

  const sourceProd = shopProducts.find((p) => p.id === sourceId);
  const filteredSource = sourceQ.length > 0
    ? shopProducts.filter((p) => p.title.toLowerCase().includes(sourceQ.toLowerCase()))
    : [];
  const filteredRelated = relatedQ.length > 0
    ? shopProducts.filter(
        (p) =>
          p.id !== sourceId &&
          p.title.toLowerCase().includes(relatedQ.toLowerCase()) &&
          !related.find((r) => r.id === p.id),
      )
    : [];

  return (
    <div className="BS_fbt-page">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="BS_fbt-header">
        <div>
          <h1 className="BS_fbt-title">Frequently Bought Together</h1>
          <p className="BS_fbt-subtitle">
            {configs.length} config{configs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="BS_fbt-cta" onClick={openCreate}>
          + Add FBT Config
        </button>
      </div>

      {fetcher.data?.error && (
        <div className="BS_fbt-error-banner">{fetcher.data.error}</div>
      )}

      {/* ── List / Empty state ──────────────────────────────────────────────── */}
      <s-section>
        {configs.length === 0 ? (
          <div className="BS_fbt-empty">
            <div className="BS_fbt-empty-icon">🛒</div>
            <p className="BS_fbt-empty-title">No FBT configurations yet</p>
            <p className="BS_fbt-empty-sub">
              Add Frequently Bought Together recommendations to increase your average order value.
            </p>
            <button className="BS_fbt-cta" onClick={openCreate}>
              Create FBT Config
            </button>
          </div>
        ) : (
          <div className="BS_fbt-table-wrap">
            <table className="BS_fbt-table">
              <thead>
                <tr>
                  <th>Source Product</th>
                  <th>Related</th>
                  <th>Discount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((cfg) => {
                  const src = shopProducts.find((p) => p.id === cfg.productId);
                  const isToggling =
                    busy &&
                    fetcher.formData?.get('intent') === 'toggle' &&
                    fetcher.formData?.get('configId') === cfg.id;
                  return (
                    <tr key={cfg.id}>
                      <td>
                        <div className="BS_fbt-cell-product">
                          {src?.featuredImage?.url ? (
                            <img
                              src={src.featuredImage.url}
                              alt=""
                              className="BS_fbt-thumb"
                            />
                          ) : (
                            <div className="BS_fbt-thumb-placeholder">📦</div>
                          )}
                          <span>{src?.title ?? cfg.productId}</span>
                        </div>
                      </td>
                      <td>
                        <span className="BS_fbt-count">
                          {cfg.products.length} product{cfg.products.length !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td>
                        <span className="BS_fbt-none-label">—</span>
                      </td>
                      <td>
                        <span
                          className={`BS_fbt-badge ${
                            cfg.isEnabled ? 'BS_fbt-badge--active' : 'BS_fbt-badge--inactive'
                          }`}
                        >
                          {cfg.isEnabled ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="BS_fbt-row-actions">
                          <button className="BS_fbt-act" onClick={() => openEdit(cfg)}>
                            Edit
                          </button>
                          <button
                            className="BS_fbt-act"
                            onClick={() => handleToggle(cfg.id)}
                            disabled={isToggling}
                          >
                            {isToggling ? '…' : cfg.isEnabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            className="BS_fbt-act BS_fbt-act--danger"
                            onClick={() => setDeleteTarget(cfg.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

      {/* ── Create / Edit sheet ─────────────────────────────────────────────── */}
      {sheetOpen && (
        <div className="BS_fbt-overlay" onClick={closeSheet}>
          <aside className="BS_fbt-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="BS_fbt-sheet-head">
              <h2 className="BS_fbt-sheet-title">
                {editConfig ? 'Edit FBT Config' : 'Create FBT Config'}
              </h2>
              <button className="BS_fbt-sheet-close" onClick={closeSheet}>
                ✕
              </button>
            </div>

            <div className="BS_fbt-sheet-body">
              {/* Source product picker */}
              <div className="BS_fbt-field">
                <label className="BS_fbt-label">Source Product</label>
                {sourceProd ? (
                  <div className="BS_fbt-selected">
                    {sourceProd.featuredImage?.url && (
                      <img
                        src={sourceProd.featuredImage.url}
                        alt=""
                        className="BS_fbt-thumb"
                      />
                    )}
                    <span className="BS_fbt-selected-name">{sourceProd.title}</span>
                    <button className="BS_fbt-deselect" onClick={() => setSourceId('')}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="BS_fbt-picker">
                    <input
                      className="BS_fbt-input"
                      type="text"
                      placeholder="Search products…"
                      value={sourceQ}
                      onChange={(e) => setSourceQ(e.target.value)}
                    />
                    {filteredSource.length > 0 && (
                      <div className="BS_fbt-dropdown">
                        {filteredSource.slice(0, 8).map((p) => (
                          <button
                            key={p.id}
                            className="BS_fbt-dd-item"
                            onClick={() => {
                              setSourceId(p.id);
                              setSourceQ('');
                            }}
                          >
                            {p.featuredImage?.url && (
                              <img
                                src={p.featuredImage.url}
                                alt=""
                                className="BS_fbt-thumb-sm"
                              />
                            )}
                            <span>{p.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {sourceQ.length > 0 && filteredSource.length === 0 && (
                      <p className="BS_fbt-dd-empty">No products found</p>
                    )}
                  </div>
                )}
              </div>

              {/* Related products multi-select (max 3) */}
              <div className="BS_fbt-field">
                <label className="BS_fbt-label">
                  Related Products
                  <span className="BS_fbt-label-hint">{related.length} / 3</span>
                </label>
                {related.length > 0 && (
                  <div className="BS_fbt-related-list">
                    {related.map((p) => (
                      <div key={p.id} className="BS_fbt-related-item">
                        {p.featuredImage?.url && (
                          <img
                            src={p.featuredImage.url}
                            alt=""
                            className="BS_fbt-thumb"
                          />
                        )}
                        <div className="BS_fbt-related-meta">
                          <span className="BS_fbt-related-name">{p.title}</span>
                          <span className="BS_fbt-related-price">
                            {p.variants.nodes[0]?.price ?? '—'}
                          </span>
                        </div>
                        <button
                          className="BS_fbt-remove"
                          onClick={() =>
                            setRelated((r) => r.filter((x) => x.id !== p.id))
                          }
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {related.length < 3 && (
                  <div className="BS_fbt-picker">
                    <input
                      className="BS_fbt-input"
                      type="text"
                      placeholder="Search products to add…"
                      value={relatedQ}
                      onChange={(e) => setRelatedQ(e.target.value)}
                    />
                    {filteredRelated.length > 0 && (
                      <div className="BS_fbt-dropdown">
                        {filteredRelated.slice(0, 6).map((p) => (
                          <button
                            key={p.id}
                            className="BS_fbt-dd-item"
                            onClick={() => addRelated(p)}
                          >
                            {p.featuredImage?.url && (
                              <img
                                src={p.featuredImage.url}
                                alt=""
                                className="BS_fbt-thumb-sm"
                              />
                            )}
                            <div>
                              <p className="BS_fbt-dd-name">{p.title}</p>
                              <p className="BS_fbt-dd-price">
                                {p.variants.nodes[0]?.price ?? '—'}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {relatedQ.length > 0 && filteredRelated.length === 0 && (
                      <p className="BS_fbt-dd-empty">No matching products</p>
                    )}
                  </div>
                )}
              </div>

              {/* Discount type */}
              <div className="BS_fbt-field">
                <label className="BS_fbt-label">Discount</label>
                <select
                  className="BS_fbt-select"
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value)}
                >
                  <option value="none">None</option>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </div>
              {discountType !== 'none' && (
                <div className="BS_fbt-field">
                  <label className="BS_fbt-label">
                    {discountType === 'percentage' ? 'Percentage (%)' : 'Amount ($)'}
                  </label>
                  <input
                    className="BS_fbt-input"
                    type="number"
                    min="0"
                    step={discountType === 'percentage' ? '1' : '0.01'}
                    placeholder={discountType === 'percentage' ? 'e.g. 10' : 'e.g. 5.00'}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                  />
                </div>
              )}

              {/* Display locations */}
              <div className="BS_fbt-field">
                <label className="BS_fbt-label">Display Locations</label>
                <div className="BS_fbt-checks">
                  {[
                    { val: 'product_page', label: 'Product Page' },
                    { val: 'cart_drawer', label: 'Cart Drawer' },
                  ].map(({ val, label }) => (
                    <label key={val} className="BS_fbt-check-row">
                      <input
                        type="checkbox"
                        className="BS_fbt-checkbox"
                        checked={locations.includes(val)}
                        onChange={() => toggleLocation(val)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Active toggle */}
              <div className="BS_fbt-field BS_fbt-field--inline">
                <span className="BS_fbt-label">Active</span>
                <button
                  type="button"
                  className={`BS_fbt-toggle ${isActive ? 'BS_fbt-toggle--on' : ''}`}
                  onClick={() => setIsActive((v) => !v)}
                  aria-pressed={isActive}
                >
                  <span className="BS_fbt-toggle-thumb" />
                </button>
              </div>
            </div>

            <div className="BS_fbt-sheet-foot">
              <button className="BS_fbt-btn BS_fbt-btn--ghost" onClick={closeSheet}>
                Cancel
              </button>
              <button
                className="BS_fbt-btn BS_fbt-btn--primary"
                onClick={handleSave}
                disabled={!sourceId || related.length === 0 || busy}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Delete confirm dialog ───────────────────────────────────────────── */}
      {deleteTarget && (
        <div
          className="BS_fbt-overlay"
          style={{ justifyContent: 'center', alignItems: 'center' }}
        >
          <div className="BS_fbt-dialog">
            <h3 className="BS_fbt-dialog-title">Delete configuration?</h3>
            <p className="BS_fbt-dialog-body">
              This will permanently remove the FBT config and all linked product associations.
              This action cannot be undone.
            </p>
            <div className="BS_fbt-dialog-actions">
              <button
                className="BS_fbt-btn BS_fbt-btn--ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="BS_fbt-btn BS_fbt-btn--danger"
                onClick={confirmDelete}
                disabled={busy}
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="p-6">
      <s-section>
        <div className="p-6 text-center">
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Failed to load FBT configurations
          </p>
          <button
            type="button"
            className="mt-4 px-4 py-2 rounded-md text-sm font-medium"
            style={{ background: 'var(--primary)', color: '#fff' }}
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>
      </s-section>
    </div>
  );
}
