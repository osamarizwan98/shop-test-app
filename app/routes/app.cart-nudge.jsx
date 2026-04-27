import { useState, useEffect } from 'react';
import { useLoaderData, useFetcher } from 'react-router';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import cartNudgeStyles from '../styles/cart-nudge.css?url';

export const links = () => [{ rel: 'stylesheet', href: cartNudgeStyles }];

// ── Loader ─────────────────────────────────────────────────────────────────────

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [bundles, config] = await Promise.all([
    prisma.bundle.findMany({
      where: { shop, status: 'active' },
      select: { id: true, title: true, discountType: true, discountValue: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.cartNudgeConfig.findFirst({ where: { shopDomain: shop } }),
  ]);

  return Response.json({ bundles, config });
}

// ── Action ─────────────────────────────────────────────────────────────────────

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');
  const shop = session.shop;

  if (intent === 'save') {
    const active = formData.get('active') === 'true';
    const dismissDuration = Math.max(1, parseInt(String(formData.get('dismissDuration') ?? '24'), 10) || 24);
    const maxNudgesPerSession = Math.max(1, parseInt(String(formData.get('maxNudgesPerSession') ?? '1'), 10) || 1);

    const config = await prisma.cartNudgeConfig.upsert({
      where: { shopDomain: shop },
      create: { shopDomain: shop, active, dismissDuration, maxNudgesPerSession },
      update: { active, dismissDuration, maxNudgesPerSession },
    });

    return Response.json({ ok: true, config });
  }

  if (intent === 'toggle') {
    const existing = await prisma.cartNudgeConfig.findFirst({ where: { shopDomain: shop } });
    const newActive = existing ? !existing.active : false;

    const config = await prisma.cartNudgeConfig.upsert({
      where: { shopDomain: shop },
      create: { shopDomain: shop, active: newActive },
      update: { active: newActive },
    });

    return Response.json({ ok: true, config });
  }

  return Response.json({ error: 'Unknown intent' }, { status: 400 });
}

// ── Nudge Widget Preview ────────────────────────────────────────────────────────

function NudgePreview() {
  return (
    <div className="BS_cn-preview-viewport">
      <div className="BS_cn-widget">
        <div className="BS_cn-widget-header">
          <div className="BS_cn-widget-icon">🛒</div>
          <p className="BS_cn-widget-heading">Complete Your Bundle</p>
        </div>
        <div className="BS_cn-widget-body">
          <p className="BS_cn-widget-msg">
            You're missing one item from the <strong>Summer Essentials Bundle</strong>. Add it now and save 15%!
          </p>
          <div className="BS_cn-widget-product">
            <div className="BS_cn-widget-thumb" />
            <div className="BS_cn-widget-product-info">
              <span className="BS_cn-widget-product-name">SPF 50 Sunscreen Spray</span>
              <span className="BS_cn-widget-product-sub">Bundle discount: −15%</span>
            </div>
          </div>
          <div className="BS_cn-widget-actions">
            <div className="BS_cn-widget-btn-primary">Add to Cart</div>
            <div className="BS_cn-widget-btn-dismiss">No thanks</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page component ─────────────────────────────────────────────────────────────

export default function CartNudgePage() {
  const { bundles, config } = useLoaderData();
  const fetcher = useFetcher();
  const busy = fetcher.state !== 'idle';

  const [active, setActive] = useState(config?.active ?? true);
  const [dismissDuration, setDismissDuration] = useState(String(config?.dismissDuration ?? 24));
  const [maxNudgesPerSession, setMaxNudgesPerSession] = useState(String(config?.maxNudgesPerSession ?? 1));
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) {
      setIsDirty(false);
    }
  }, [fetcher.state, fetcher.data]);

  function handleToggleActive() {
    const next = !active;
    setActive(next);
    setIsDirty(true);
  }

  function handleDismissDurationChange(e) {
    setDismissDuration(e.target.value);
    setIsDirty(true);
  }

  function handleMaxNudgesChange(e) {
    setMaxNudgesPerSession(e.target.value);
    setIsDirty(true);
  }

  function handleSave() {
    const fd = new FormData();
    fd.set('intent', 'save');
    fd.set('active', String(active));
    fd.set('dismissDuration', dismissDuration);
    fd.set('maxNudgesPerSession', maxNudgesPerSession);
    fetcher.submit(fd, { method: 'POST' });
  }

  function handleDiscard() {
    setActive(config?.active ?? true);
    setDismissDuration(String(config?.dismissDuration ?? 24));
    setMaxNudgesPerSession(String(config?.maxNudgesPerSession ?? 1));
    setIsDirty(false);
  }

  return (
    <div className="BS_cn-page">
      {/* ── Contextual save bar ───────────────────────────────────────────── */}
      {isDirty && (
        <s-contextual-save-bar>
          <s-button
            slot="save-action"
            variant="primary"
            onClick={handleSave}
            loading={busy ? '' : undefined}
          >
            Save
          </s-button>
          <s-button slot="discard-action" onClick={handleDiscard}>
            Discard
          </s-button>
        </s-contextual-save-bar>
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="BS_cn-header">
        <h1 className="BS_cn-title">Cart Bundle Nudge</h1>
        <p className="BS_cn-subtitle">
          Remind customers to complete bundles in their cart
        </p>
      </div>

      {fetcher.data?.error && (
        <div className="BS_cn-error">{fetcher.data.error}</div>
      )}

      {/* ── Status card ──────────────────────────────────────────────────── */}
      <div className="BS_cn-card">
        <p className="BS_cn-card-title">Status</p>
        <div className="BS_cn-toggle-row">
          <div className="BS_cn-toggle-info">
            <span className="BS_cn-toggle-label">Enable Cart Nudges</span>
            <span className="BS_cn-toggle-desc">
              Show nudge widgets when customers have incomplete bundles in their cart
            </span>
          </div>
          <button
            type="button"
            className={`BS_cn-toggle${active ? ' BS_cn-toggle--on' : ''}`}
            onClick={handleToggleActive}
            role="switch"
            aria-checked={active}
          >
            <span className="BS_cn-toggle-thumb" />
          </button>
        </div>
      </div>

      {/* ── Settings card ────────────────────────────────────────────────── */}
      <div className="BS_cn-card">
        <p className="BS_cn-card-title">Settings</p>
        <div className="BS_cn-fields">
          <div className="BS_cn-field">
            <label className="BS_cn-field-label" htmlFor="dismissDuration">
              Dismiss Duration (hours)
            </label>
            <input
              id="dismissDuration"
              className="BS_cn-input"
              type="number"
              min="1"
              max="720"
              step="1"
              value={dismissDuration}
              onChange={handleDismissDurationChange}
            />
            <span className="BS_cn-field-hint">
              How long "No thanks" suppresses the nudge for a customer
            </span>
          </div>

          <div className="BS_cn-field">
            <label className="BS_cn-field-label" htmlFor="maxNudgesPerSession">
              Max Nudges per Session
            </label>
            <input
              id="maxNudgesPerSession"
              className="BS_cn-input"
              type="number"
              min="1"
              max="10"
              step="1"
              value={maxNudgesPerSession}
              onChange={handleMaxNudgesChange}
            />
            <span className="BS_cn-field-hint">
              Maximum number of nudge widgets shown per browsing session
            </span>
          </div>
        </div>
      </div>

      {/* ── Preview card ─────────────────────────────────────────────────── */}
      <div className="BS_cn-preview-card">
        <p className="BS_cn-preview-title">Preview</p>
        <NudgePreview />
        <p className="BS_cn-preview-caption">
          This is a static preview of how the nudge widget appears in the customer's cart.
        </p>
      </div>

      {/* ── Active bundles ───────────────────────────────────────────────── */}
      <div className="BS_cn-bundles-card">
        <p className="BS_cn-card-title">Eligible Bundles</p>
        <p className="BS_cn-card-desc">
          Active bundles that can trigger cart nudges for customers.
        </p>

        {bundles.length === 0 ? (
          <div className="BS_cn-bundles-empty">
            No active bundles found. Create and activate a bundle to enable cart nudges.
          </div>
        ) : (
          <div className="BS_cn-bundle-list">
            {bundles.map((bundle) => (
              <div key={bundle.id} className="BS_cn-bundle-row">
                <span className="BS_cn-bundle-title">{bundle.title}</span>
                <span className="BS_cn-bundle-badge">
                  {bundle.discountType === 'percentage'
                    ? `${bundle.discountValue}% off`
                    : `$${bundle.discountValue} off`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="p-6">
      <s-section>
        <div className="p-6 text-center">
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Failed to load Cart Bundle Nudge settings
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
