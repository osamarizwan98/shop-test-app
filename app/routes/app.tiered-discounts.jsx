import { useState, useEffect } from 'react';
import { useLoaderData, useFetcher } from 'react-router';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';
import { registerShopifyDiscount, deleteShopifyDiscount } from '../utils/discounts.server';
import tdStyles from '../styles/tiered-discounts.css?url';

export const links = () => [{ rel: 'stylesheet', href: tdStyles }];

// ── GraphQL ───────────────────────────────────────────────────────────────────

const CURRENT_APP_INSTALLATION_QUERY = `#graphql
  query CurrentAppInstallation {
    currentAppInstallation {
      id
    }
  }
`;

const METAFIELDS_SET_MUTATION = `#graphql
  mutation SetTieredConfig($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCTS_QUERY = `#graphql
  query TieredProducts {
    products(first: 50) {
      nodes {
        id
        title
        featuredImage { url }
      }
    }
  }
`;

const COLLECTIONS_QUERY = `#graphql
  query TieredCollections {
    collections(first: 50) {
      nodes {
        id
        title
      }
    }
  }
`;

// ── Metafield sync helper ─────────────────────────────────────────────────────

async function pushTieredConfig(admin, shop) {
  const actives = await prisma.tieredDiscount.findMany({
    where: { shop, active: true },
    include: { tiers: { orderBy: { minimumQuantity: 'asc' } } },
  });

  const tieredDiscounts = actives.map((d) => ({
    id: d.id,
    title: d.title,
    productScope: d.productScope,
    productIds: d.productIds,
    collectionIds: d.collectionIds,
    tiers: d.tiers.map((t) => ({
      minimumQuantity: t.minimumQuantity,
      type: t.discountType,
      value: t.discountValue,
    })),
  }));

  const installRes = await admin.graphql(CURRENT_APP_INSTALLATION_QUERY);
  const installData = await installRes.json();
  const ownerId = installData?.data?.currentAppInstallation?.id;
  if (!ownerId) throw new Error('Unable to resolve app installation ID');

  const metaRes = await admin.graphql(METAFIELDS_SET_MUTATION, {
    variables: {
      metafields: [
        {
          ownerId,
          namespace: 'smartbundle',
          key: 'config',
          type: 'json',
          value: JSON.stringify({ tieredDiscounts }),
        },
      ],
    },
  });

  const metaData = await metaRes.json();
  const userErrors = metaData?.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(', '));
  }
}

function parseTiers(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonField(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  const [discounts, productsRes, collectionsRes] = await Promise.all([
    prisma.tieredDiscount.findMany({
      where: { shop: session.shop },
      include: { tiers: { orderBy: { minimumQuantity: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    }),
    admin.graphql(PRODUCTS_QUERY),
    admin.graphql(COLLECTIONS_QUERY),
  ]);

  const [{ data: pData }, { data: cData }] = await Promise.all([
    productsRes.json(),
    collectionsRes.json(),
  ]);

  return Response.json({
    discounts,
    products: pData?.products?.nodes ?? [],
    collections: cData?.collections?.nodes ?? [],
  });
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');
  const shop = session.shop;

  // ── create ─────────────────────────────────────────────────────────────────
  if (intent === 'create') {
    const title = String(formData.get('title') ?? '').trim();
    if (!title) return Response.json({ error: 'title is required' }, { status: 400 });

    const productScope = String(formData.get('productScope') ?? 'all');
    const productIds = parseJsonField(String(formData.get('productIds') ?? '[]'));
    const collectionIds = parseJsonField(String(formData.get('collectionIds') ?? '[]'));
    const tiers = parseTiers(String(formData.get('tiers') ?? '[]'));

    if (tiers.length === 0) {
      return Response.json({ error: 'At least one tier is required' }, { status: 400 });
    }

    const discount = await prisma.tieredDiscount.create({
      data: {
        shop,
        title,
        productScope,
        productIds,
        collectionIds,
        active: true,
        tiers: {
          create: tiers.map((t, i) => ({
            minimumQuantity: t.minimumQuantity,
            discountType: t.discountType,
            discountValue: t.discountValue,
            position: i,
          })),
        },
      },
      include: { tiers: { orderBy: { minimumQuantity: 'asc' } } },
    });

    const shopifyDiscountId = await registerShopifyDiscount(admin, {
      id: discount.id,
      title: discount.title,
      discountType: 'percentage',
      discountValue: 0,
    });

    const updated = await prisma.tieredDiscount.update({
      where: { id: discount.id },
      data: { shopifyDiscountId },
      include: { tiers: { orderBy: { minimumQuantity: 'asc' } } },
    });

    await pushTieredConfig(admin, shop);
    return Response.json({ ok: true, discount: updated });
  }

  // ── update ─────────────────────────────────────────────────────────────────
  if (intent === 'update') {
    const id = String(formData.get('id') ?? '').trim();
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

    const title = String(formData.get('title') ?? '').trim();
    const productScope = String(formData.get('productScope') ?? 'all');
    const productIds = parseJsonField(String(formData.get('productIds') ?? '[]'));
    const collectionIds = parseJsonField(String(formData.get('collectionIds') ?? '[]'));
    const tiers = parseTiers(String(formData.get('tiers') ?? '[]'));

    await prisma.tieredDiscountTier.deleteMany({ where: { tieredDiscountId: id } });
    await prisma.tieredDiscount.update({
      where: { id, shop },
      data: {
        title,
        productScope,
        productIds,
        collectionIds,
        tiers: {
          create: tiers.map((t, i) => ({
            minimumQuantity: t.minimumQuantity,
            discountType: t.discountType,
            discountValue: t.discountValue,
            position: i,
          })),
        },
      },
    });

    await pushTieredConfig(admin, shop);
    return Response.json({ ok: true });
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  if (intent === 'delete') {
    const id = String(formData.get('id') ?? '').trim();
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

    const record = await prisma.tieredDiscount.findFirst({ where: { id, shop } });
    if (!record) return Response.json({ error: 'Not found' }, { status: 404 });

    if (record.shopifyDiscountId) {
      await deleteShopifyDiscount(admin, record.shopifyDiscountId);
    }

    await prisma.tieredDiscount.delete({ where: { id } });
    await pushTieredConfig(admin, shop);
    return Response.json({ ok: true });
  }

  // ── activate ───────────────────────────────────────────────────────────────
  if (intent === 'activate') {
    const id = String(formData.get('id') ?? '').trim();
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

    const record = await prisma.tieredDiscount.findFirst({ where: { id, shop } });
    if (!record) return Response.json({ error: 'Not found' }, { status: 404 });

    let shopifyDiscountId = record.shopifyDiscountId;

    if (!shopifyDiscountId) {
      shopifyDiscountId = await registerShopifyDiscount(admin, {
        id: record.id,
        title: record.title,
        discountType: 'percentage',
        discountValue: 0,
      });
    }

    await prisma.tieredDiscount.update({
      where: { id },
      data: { active: true, shopifyDiscountId },
    });

    await pushTieredConfig(admin, shop);
    return Response.json({ ok: true });
  }

  // ── deactivate ─────────────────────────────────────────────────────────────
  if (intent === 'deactivate') {
    const id = String(formData.get('id') ?? '').trim();
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

    const record = await prisma.tieredDiscount.findFirst({ where: { id, shop } });
    if (!record) return Response.json({ error: 'Not found' }, { status: 404 });

    if (record.shopifyDiscountId) {
      await deleteShopifyDiscount(admin, record.shopifyDiscountId);
    }

    await prisma.tieredDiscount.update({
      where: { id },
      data: { active: false, shopifyDiscountId: null },
    });

    await pushTieredConfig(admin, shop);
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unknown intent' }, { status: 400 });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tierSummary(tiers) {
  if (tiers.length === 0) return '—';
  return [...tiers]
    .sort((a, b) => a.minimumQuantity - b.minimumQuantity)
    .map(
      (t) =>
        `${t.minimumQuantity}=${t.discountValue}${t.discountType === 'percentage' ? '%' : '$'}`,
    )
    .join(', ');
}

function scopeLabel(scope, productIds, collectionIds) {
  if (scope === 'specific_products') {
    const n = Array.isArray(productIds) ? productIds.length : 0;
    return `${n} Product${n !== 1 ? 's' : ''}`;
  }
  if (scope === 'specific_collections') {
    const n = Array.isArray(collectionIds) ? collectionIds.length : 0;
    return `${n} Collection${n !== 1 ? 's' : ''}`;
  }
  return 'All Bundles';
}

const BLANK_TIER = { minQty: '', type: 'percentage', value: '' };

// ── Component ─────────────────────────────────────────────────────────────────

export default function TieredDiscountsPage() {
  const { discounts, products, collections } = useLoaderData();
  const fetcher = useFetcher();
  const busy = fetcher.state !== 'idle';

  // ── UI state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ── Form state
  const [title, setTitle] = useState('');
  const [applyTo, setApplyTo] = useState('all');
  const [targetItems, setTargetItems] = useState([]);
  const [targetQ, setTargetQ] = useState('');
  const [tiers, setTiers] = useState([{ ...BLANK_TIER }]);
  const [isActive, setIsActive] = useState(true);
  const [validationError, setValidationError] = useState('');

  // Close overlays on successful mutation
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && !fetcher.data.error) {
      setSheetOpen(false);
      setDeleteTarget(null);
    }
  }, [fetcher.state, fetcher.data]);

  function resetForm() {
    setTitle('');
    setApplyTo('all');
    setTargetItems([]);
    setTargetQ('');
    setTiers([{ ...BLANK_TIER }]);
    setIsActive(true);
    setValidationError('');
    setEditId(null);
  }

  function closeSheet() {
    setSheetOpen(false);
    resetForm();
  }

  function openCreate() {
    resetForm();
    setSheetOpen(true);
  }

  function openEdit(d) {
    resetForm();
    setEditId(d.id);
    setTitle(d.title);
    setApplyTo(d.productScope);
    setIsActive(d.active);

    const scope = d.productScope;
    const rawIds = scope === 'specific_collections' ? d.collectionIds : d.productIds;
    const ids = Array.isArray(rawIds) ? rawIds : [];
    const sourceList = scope === 'specific_collections' ? collections : products;
    setTargetItems(
      sourceList
        .filter((s) => ids.includes(s.id))
        .map((s) => ({ id: s.id, title: s.title })),
    );

    setTiers(
      d.tiers.length > 0
        ? d.tiers.map((t) => ({
            minQty: String(t.minimumQuantity),
            type: t.discountType,
            value: String(t.discountValue),
          }))
        : [{ ...BLANK_TIER }],
    );
    setSheetOpen(true);
  }

  function validateAndSave() {
    if (!title.trim()) return 'Rule name is required';
    if (tiers.length === 0) return 'At least one tier is required';
    const qtys = [];
    for (const t of tiers) {
      const qty = parseInt(t.minQty, 10);
      const val = parseFloat(t.value);
      if (isNaN(qty) || qty < 1) return 'All minimum quantities must be whole numbers ≥ 1';
      if (isNaN(val) || val <= 0) return 'All discount values must be positive numbers';
      if (t.type === 'percentage' && val > 100) return 'Percentage value cannot exceed 100';
      if (qtys.includes(qty)) return `Duplicate minimum quantity: ${qty}`;
      qtys.push(qty);
    }
    for (let i = 1; i < qtys.length; i++) {
      if (qtys[i] <= qtys[i - 1]) return 'Minimum quantities must be in ascending order';
    }
    return null;
  }

  function handleSave() {
    const err = validateAndSave();
    if (err) { setValidationError(err); return; }
    setValidationError('');

    const fd = new FormData();
    fd.set('intent', editId ? 'update' : 'create');
    if (editId) fd.set('id', editId);
    fd.set('title', title.trim());
    fd.set('productScope', applyTo);
    fd.set(
      'productIds',
      JSON.stringify(applyTo === 'specific_products' ? targetItems.map((i) => i.id) : []),
    );
    fd.set(
      'collectionIds',
      JSON.stringify(applyTo === 'specific_collections' ? targetItems.map((i) => i.id) : []),
    );
    fd.set(
      'tiers',
      JSON.stringify(
        tiers.map((t) => ({
          minimumQuantity: parseInt(t.minQty, 10),
          discountType: t.type,
          discountValue: parseFloat(t.value),
        })),
      ),
    );
    fd.set('isActive', String(isActive));
    fetcher.submit(fd, { method: 'POST' });
  }

  function submitIntent(intent, id) {
    const fd = new FormData();
    fd.set('intent', intent);
    fd.set('id', id);
    fetcher.submit(fd, { method: 'POST' });
  }

  // Target search
  const searchPool = applyTo === 'specific_collections' ? collections : products;

  const filtered =
    targetQ.length > 0
      ? searchPool.filter(
          (s) =>
            s.title.toLowerCase().includes(targetQ.toLowerCase()) &&
            !targetItems.find((t) => t.id === s.id),
        )
      : [];

  function addTarget(item) {
    setTargetItems((prev) => [...prev, { id: item.id, title: item.title }]);
    setTargetQ('');
  }

  function removeTarget(id) {
    setTargetItems((prev) => prev.filter((i) => i.id !== id));
  }

  function updateTier(idx, patch) {
    setTiers((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  return (
    <div className="BS_td-page">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="BS_td-header">
        <div>
          <h1 className="BS_td-title">Tiered Volume Discounts</h1>
          <p className="BS_td-subtitle">
            {discounts.length} rule{discounts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="BS_td-cta" onClick={openCreate}>
          + Create Rule
        </button>
      </div>

      {/* ── Info banner ────────────────────────────────────────────────────── */}
      <div className="BS_td-banner">
        <span className="BS_td-banner-icon">ℹ</span>
        <span>
          Tier progress bar shows automatically on product pages via FBT block extension.
          No extra setup needed.
        </span>
      </div>

      {/* ── Server error ───────────────────────────────────────────────────── */}
      {fetcher.data?.error && (
        <div className="BS_td-error">{fetcher.data.error}</div>
      )}

      {/* ── List / Empty ───────────────────────────────────────────────────── */}
      <s-section>
        {discounts.length === 0 ? (
          <div className="BS_td-empty">
            <div className="BS_td-empty-icon">🏷️</div>
            <p className="BS_td-empty-title">No tiered discount rules yet</p>
            <p className="BS_td-empty-sub">
              Create volume discount rules to reward customers who buy more — automatically
              applied at checkout.
            </p>
            <button className="BS_td-cta" onClick={openCreate}>
              Create Rule
            </button>
          </div>
        ) : (
          <div className="BS_td-list">
            {discounts.map((d) => {
              const isActing =
                busy && fetcher.formData?.get('id') === d.id;
              return (
                <div key={d.id} className="BS_td-card">
                  <div className="BS_td-card-body">
                    <div className="BS_td-card-row">
                      <span className="BS_td-card-name">{d.title}</span>
                      <span
                        className={`BS_td-badge ${
                          d.active ? 'BS_td-badge--active' : 'BS_td-badge--inactive'
                        }`}
                      >
                        {d.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="BS_td-card-meta">
                      <span className="BS_td-card-meta-item">
                        <span className="BS_td-meta-label">Apply To:&nbsp;</span>
                        {scopeLabel(d.productScope, d.productIds, d.collectionIds)}
                      </span>
                      <span className="BS_td-card-meta-sep">·</span>
                      <span className="BS_td-card-meta-item">
                        <span className="BS_td-meta-label">Tiers:&nbsp;</span>
                        {tierSummary(d.tiers)}
                      </span>
                    </div>
                  </div>

                  <div className="BS_td-card-actions">
                    <button
                      className="BS_td-act"
                      onClick={() => openEdit(d)}
                      disabled={isActing}
                    >
                      Edit
                    </button>
                    {d.active ? (
                      <button
                        className="BS_td-act"
                        onClick={() => submitIntent('deactivate', d.id)}
                        disabled={isActing}
                      >
                        {isActing && fetcher.formData?.get('intent') === 'deactivate'
                          ? '…'
                          : 'Deactivate'}
                      </button>
                    ) : (
                      <button
                        className="BS_td-act BS_td-act--primary"
                        onClick={() => submitIntent('activate', d.id)}
                        disabled={isActing}
                      >
                        {isActing && fetcher.formData?.get('intent') === 'activate'
                          ? '…'
                          : 'Activate'}
                      </button>
                    )}
                    <button
                      className="BS_td-act BS_td-act--danger"
                      onClick={() => setDeleteTarget(d.id)}
                      disabled={isActing}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </s-section>

      {/* ── Create / Edit sheet ────────────────────────────────────────────── */}
      {sheetOpen && (
        <div className="BS_td-overlay" onClick={closeSheet}>
          <aside className="BS_td-sheet" onClick={(e) => e.stopPropagation()}>
            {/* Sheet header */}
            <div className="BS_td-sheet-head">
              <h2 className="BS_td-sheet-title">
                {editId ? 'Edit Rule' : 'Create Rule'}
              </h2>
              <button className="BS_td-sheet-close" onClick={closeSheet}>
                ✕
              </button>
            </div>

            {/* Sheet body */}
            <div className="BS_td-sheet-body">
              {/* Name */}
              <div className="BS_td-field">
                <label className="BS_td-label">Rule Name</label>
                <input
                  className="BS_td-input"
                  type="text"
                  placeholder="e.g. Buy More Save More"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Apply To */}
              <div className="BS_td-field">
                <label className="BS_td-label">Apply To</label>
                <select
                  className="BS_td-select"
                  value={applyTo}
                  onChange={(e) => {
                    setApplyTo(e.target.value);
                    setTargetItems([]);
                    setTargetQ('');
                  }}
                >
                  <option value="all">Bundle (All Products)</option>
                  <option value="specific_collections">Specific Collection</option>
                  <option value="specific_products">Specific Product</option>
                </select>
              </div>

              {/* Target selector */}
              {applyTo !== 'all' && (
                <div className="BS_td-field">
                  <label className="BS_td-label">
                    {applyTo === 'specific_collections'
                      ? 'Select Collections'
                      : 'Select Products'}
                  </label>
                  {targetItems.length > 0 && (
                    <div className="BS_td-chips">
                      {targetItems.map((item) => (
                        <span key={item.id} className="BS_td-chip">
                          {item.title}
                          <button
                            className="BS_td-chip-remove"
                            onClick={() => removeTarget(item.id)}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="BS_td-picker">
                    <input
                      className="BS_td-input"
                      type="text"
                      placeholder={
                        applyTo === 'specific_collections'
                          ? 'Search collections…'
                          : 'Search products…'
                      }
                      value={targetQ}
                      onChange={(e) => setTargetQ(e.target.value)}
                    />
                    {filtered.length > 0 && (
                      <div className="BS_td-dropdown">
                        {filtered.slice(0, 8).map((item) => (
                          <button
                            key={item.id}
                            className="BS_td-dd-item"
                            onClick={() => addTarget(item)}
                          >
                            {item.title}
                          </button>
                        ))}
                      </div>
                    )}
                    {targetQ.length > 0 && filtered.length === 0 && (
                      <div className="BS_td-dropdown">
                        <p className="BS_td-dd-empty">No results found</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tier builder */}
              <div className="BS_td-field">
                <div className="BS_td-tiers-head">
                  <span className="BS_td-label">Discount Tiers</span>
                  <span className="BS_td-label-hint">{tiers.length} / 5</span>
                </div>
                <div className="BS_td-tiers">
                  {tiers.map((tier, idx) => (
                    <div key={idx} className="BS_td-tier-row">
                      <div className="BS_td-tier-field">
                        <span className="BS_td-tier-label">Min Qty</span>
                        <input
                          className="BS_td-input BS_td-input--sm"
                          type="number"
                          min="1"
                          step="1"
                          placeholder="2"
                          value={tier.minQty}
                          onChange={(e) => updateTier(idx, { minQty: e.target.value })}
                        />
                      </div>
                      <div className="BS_td-tier-field">
                        <span className="BS_td-tier-label">Type</span>
                        <select
                          className="BS_td-select BS_td-select--sm"
                          value={tier.type}
                          onChange={(e) =>
                            updateTier(idx, { type: e.target.value })
                          }
                        >
                          <option value="percentage">%</option>
                          <option value="fixed_amount">$</option>
                        </select>
                      </div>
                      <div className="BS_td-tier-field">
                        <span className="BS_td-tier-label">Value</span>
                        <input
                          className="BS_td-input BS_td-input--sm"
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="10"
                          value={tier.value}
                          onChange={(e) => updateTier(idx, { value: e.target.value })}
                        />
                      </div>
                      {tiers.length > 1 && (
                        <button
                          className="BS_td-tier-remove"
                          onClick={() =>
                            setTiers((prev) => prev.filter((_, i) => i !== idx))
                          }
                          title="Remove tier"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {tiers.length < 5 && (
                  <button
                    className="BS_td-add-tier"
                    onClick={() => setTiers((prev) => [...prev, { ...BLANK_TIER }])}
                  >
                    + Add Tier
                  </button>
                )}
              </div>

              {/* Active toggle */}
              <div className="BS_td-field BS_td-field--inline">
                <label className="BS_td-label">Active</label>
                <button
                  className={`BS_td-toggle ${isActive ? 'BS_td-toggle--on' : ''}`}
                  onClick={() => setIsActive((v) => !v)}
                  role="switch"
                  aria-checked={isActive}
                >
                  <span className="BS_td-toggle-thumb" />
                </button>
              </div>

              {/* Validation error */}
              {validationError && (
                <div className="BS_td-validation-error">{validationError}</div>
              )}
            </div>

            {/* Sheet footer */}
            <div className="BS_td-sheet-foot">
              <button className="BS_td-btn BS_td-btn--ghost" onClick={closeSheet}>
                Cancel
              </button>
              <button
                className="BS_td-btn BS_td-btn--primary"
                onClick={handleSave}
                disabled={busy}
              >
                {busy ? 'Saving…' : 'Save & Publish'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Delete confirm dialog ──────────────────────────────────────────── */}
      {deleteTarget && (
        <div
          className="BS_td-overlay BS_td-overlay--center"
          onClick={() => setDeleteTarget(null)}
        >
          <div className="BS_td-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="BS_td-dialog-title">Delete this rule?</p>
            <p className="BS_td-dialog-body">
              This will permanently remove the rule and its associated Shopify discount.
              This action cannot be undone.
            </p>
            <div className="BS_td-dialog-actions">
              <button
                className="BS_td-btn BS_td-btn--ghost"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="BS_td-btn BS_td-btn--danger"
                onClick={() => submitIntent('delete', deleteTarget)}
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
