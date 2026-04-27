import { useState, useEffect } from 'react';
import { useLoaderData, useFetcher } from 'react-router';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import progressBarStyles from '../styles/progress-bar.css?url';

export const links = () => [{ rel: 'stylesheet', href: progressBarStyles }];

// ── Loader ─────────────────────────────────────────────────────────────────────

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  const config = await prisma.progressBarConfig.findFirst({
    where: { shopDomain: session.shop },
    include: { milestones: { orderBy: { position: 'asc' } } },
  });

  return Response.json({ config });
}

// ── Action ─────────────────────────────────────────────────────────────────────

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');
  const shop = session.shop;

  if (intent === 'save') {
    const activeOnCart = formData.get('activeOnCart') === 'true';
    const activeOnDrawer = formData.get('activeOnDrawer') === 'true';
    const animationStyle = String(formData.get('animationStyle') ?? 'smooth');

    let milestones = [];
    try {
      milestones = JSON.parse(String(formData.get('milestones') ?? '[]'));
    } catch {
      return Response.json({ error: 'Invalid milestones JSON' }, { status: 400 });
    }

    const config = await prisma.progressBarConfig.upsert({
      where: { shopDomain: shop },
      create: { shopDomain: shop, activeOnCart, activeOnDrawer, animationStyle },
      update: { activeOnCart, activeOnDrawer, animationStyle },
    });

    await prisma.progressBarMilestone.deleteMany({ where: { configId: config.id } });

    if (milestones.length > 0) {
      await prisma.progressBarMilestone.createMany({
        data: milestones.map((m, i) => ({
          configId: config.id,
          type: String(m.type ?? 'free_shipping'),
          threshold: Number(m.threshold) || 0,
          rewardValue: Number(m.rewardValue) || 0,
          rewardLabel: String(m.rewardLabel ?? ''),
          message: String(m.message ?? ''),
          position: i,
        })),
      });
    }

    const updated = await prisma.progressBarConfig.findUnique({
      where: { id: config.id },
      include: { milestones: { orderBy: { position: 'asc' } } },
    });

    return Response.json({ ok: true, config: updated });
  }

  if (intent === 'reset') {
    const existing = await prisma.progressBarConfig.findFirst({
      where: { shopDomain: shop },
    });
    if (existing) {
      await prisma.progressBarMilestone.deleteMany({ where: { configId: existing.id } });
      await prisma.progressBarConfig.delete({ where: { id: existing.id } });
    }
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unknown intent' }, { status: 400 });
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MILESTONE_TYPES = [
  { value: 'free_shipping',       label: 'Free Shipping' },
  { value: 'percentage_discount', label: '% Discount' },
  { value: 'fixed_discount',      label: '$ Discount' },
  { value: 'bonus_item',          label: 'Bonus Item' },
];

const ANIMATION_OPTIONS = [
  { value: 'smooth', label: 'Smooth' },
  { value: 'pulse',  label: 'Pulse' },
  { value: 'none',   label: 'None' },
];

const BLANK_MILESTONE = {
  type: 'free_shipping',
  threshold: '',
  rewardValue: '',
  rewardLabel: '',
  message: '',
};

function dbMilestoneToRow(m) {
  return {
    type: m.type,
    threshold: String(m.threshold),
    rewardValue: String(m.rewardValue),
    rewardLabel: m.rewardLabel,
    message: m.message,
  };
}

// ── Preview strip ──────────────────────────────────────────────────────────────

function PreviewStrip({ milestones, animationStyle }) {
  const valid = milestones.filter((m) => Number(m.threshold) > 0);

  if (valid.length === 0) {
    return (
      <p className="BS_pb-preview-empty">
        Add milestones above to see a live preview of the progress bar.
      </p>
    );
  }

  const max = Math.max(...valid.map((m) => Number(m.threshold)));
  const DEMO_CART = max * 0.4;

  return (
    <div className="BS_pb-preview-wrap">
      <div className="BS_pb-preview-track">
        <div
          className={`BS_pb-preview-fill${animationStyle === 'pulse' ? ' BS_pb-preview-fill--pulse' : ''}`}
          style={{ width: `${Math.min((DEMO_CART / max) * 100, 100)}%` }}
        />
        {valid.map((m, i) => {
          const pct = (Number(m.threshold) / max) * 100;
          const reached = DEMO_CART >= Number(m.threshold);
          return (
            <span
              key={i}
              className="BS_pb-preview-marker"
              style={{ left: `${pct}%` }}
            >
              <span
                className={`BS_pb-preview-dot${reached ? ' BS_pb-preview-dot--reached' : ''}`}
              />
              <span className="BS_pb-preview-marker-label">
                ${m.threshold}
                {m.rewardLabel ? ` · ${m.rewardLabel}` : ''}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Page component ─────────────────────────────────────────────────────────────

export default function ProgressBarPage() {
  const { config } = useLoaderData();
  const fetcher = useFetcher();
  const busy = fetcher.state !== 'idle';

  // ── Form state ────────────────────────────────────────────────────────────
  const [activeOnCart, setActiveOnCart] = useState(config?.activeOnCart ?? true);
  const [activeOnDrawer, setActiveOnDrawer] = useState(config?.activeOnDrawer ?? true);
  const [animationStyle, setAnimationStyle] = useState(config?.animationStyle ?? 'smooth');
  const [milestones, setMilestones] = useState(
    config?.milestones?.map(dbMilestoneToRow) ?? [],
  );
  const [isDirty, setIsDirty] = useState(false);

  // ── Hide save bar on successful save ──────────────────────────────────────
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) {
      setIsDirty(false);
    }
  }, [fetcher.state, fetcher.data]);

  // ── Change helpers ────────────────────────────────────────────────────────
  function toggle(setter) {
    setter((v) => {
      setIsDirty(true);
      return !v;
    });
  }

  function handleAnimationChange(e) {
    setAnimationStyle(e.target.value);
    setIsDirty(true);
  }

  function addMilestone() {
    if (milestones.length >= 5) return;
    setMilestones((prev) => [...prev, { ...BLANK_MILESTONE }]);
    setIsDirty(true);
  }

  function removeMilestone(idx) {
    setMilestones((prev) => prev.filter((_, i) => i !== idx));
    setIsDirty(true);
  }

  function updateMilestone(idx, field, value) {
    setMilestones((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)),
    );
    setIsDirty(true);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  function handleSave() {
    const fd = new FormData();
    fd.set('intent', 'save');
    fd.set('activeOnCart', String(activeOnCart));
    fd.set('activeOnDrawer', String(activeOnDrawer));
    fd.set('animationStyle', animationStyle);
    fd.set('milestones', JSON.stringify(milestones));
    fetcher.submit(fd, { method: 'POST' });
  }

  // ── Discard ───────────────────────────────────────────────────────────────
  function handleDiscard() {
    setActiveOnCart(config?.activeOnCart ?? true);
    setActiveOnDrawer(config?.activeOnDrawer ?? true);
    setAnimationStyle(config?.animationStyle ?? 'smooth');
    setMilestones(config?.milestones?.map(dbMilestoneToRow) ?? []);
    setIsDirty(false);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function handleReset() {
    const fd = new FormData();
    fd.set('intent', 'reset');
    fetcher.submit(fd, { method: 'POST' });
    setActiveOnCart(true);
    setActiveOnDrawer(true);
    setAnimationStyle('smooth');
    setMilestones([]);
    setIsDirty(false);
  }

  return (
    <div className="BS_pb-page">
      {/* ── Contextual save bar ─────────────────────────────────────────── */}
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

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="BS_pb-header">
        <h1 className="BS_pb-title">Cart Progress Bar</h1>
        <p className="BS_pb-subtitle">
          Show customers how close they are to unlocking rewards — drives higher average order value.
        </p>
      </div>

      {fetcher.data?.error && (
        <div className="BS_pb-error">{fetcher.data.error}</div>
      )}

      {/* ── Display toggles ────────────────────────────────────────────── */}
      <div className="BS_pb-card">
        <p className="BS_pb-card-title">Display Settings</p>
        <div className="BS_pb-toggles">
          <div className="BS_pb-toggle-row">
            <div className="BS_pb-toggle-info">
              <span className="BS_pb-toggle-label">Show on Cart Page</span>
              <span className="BS_pb-toggle-desc">
                Display the progress bar on the /cart page
              </span>
            </div>
            <button
              type="button"
              className={`BS_pb-toggle${activeOnCart ? ' BS_pb-toggle--on' : ''}`}
              onClick={() => toggle(setActiveOnCart)}
              role="switch"
              aria-checked={activeOnCart}
            >
              <span className="BS_pb-toggle-thumb" />
            </button>
          </div>

          <div className="BS_pb-toggle-row">
            <div className="BS_pb-toggle-info">
              <span className="BS_pb-toggle-label">Show on Cart Drawer</span>
              <span className="BS_pb-toggle-desc">
                Display the progress bar in the cart drawer / side cart
              </span>
            </div>
            <button
              type="button"
              className={`BS_pb-toggle${activeOnDrawer ? ' BS_pb-toggle--on' : ''}`}
              onClick={() => toggle(setActiveOnDrawer)}
              role="switch"
              aria-checked={activeOnDrawer}
            >
              <span className="BS_pb-toggle-thumb" />
            </button>
          </div>
        </div>

        <div className="BS_pb-field">
          <label className="BS_pb-field-label">Animation Style</label>
          <select
            className="BS_pb-select"
            value={animationStyle}
            onChange={handleAnimationChange}
          >
            {ANIMATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Progress preview ───────────────────────────────────────────── */}
      <div className="BS_pb-preview-card">
        <p className="BS_pb-preview-title">Preview</p>
        <PreviewStrip milestones={milestones} animationStyle={animationStyle} />
      </div>

      {/* ── Milestones ─────────────────────────────────────────────────── */}
      <s-section>
        <div className="BS_pb-milestones-head">
          <p className="BS_pb-card-title" style={{ margin: 0 }}>
            Milestones
            <span className="BS_pb-milestones-count"> — {milestones.length} / 5</span>
          </p>
          <button
            className="BS_pb-add-btn"
            onClick={addMilestone}
            disabled={milestones.length >= 5}
          >
            + Add Milestone
          </button>
        </div>

        {milestones.length === 0 ? (
          <div className="BS_pb-ms-empty">
            No milestones yet. Add one to get started.
          </div>
        ) : (
          <div className="BS_pb-milestone-list">
            {milestones.map((m, idx) => (
              <div key={idx} className="BS_pb-milestone-row">
                {/* Type */}
                <div className="BS_pb-ms-field">
                  <span className="BS_pb-ms-label">Reward Type</span>
                  <select
                    className="BS_pb-ms-select"
                    value={m.type}
                    onChange={(e) => updateMilestone(idx, 'type', e.target.value)}
                  >
                    {MILESTONE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Threshold */}
                <div className="BS_pb-ms-field">
                  <span className="BS_pb-ms-label">Threshold ($)</span>
                  <input
                    className="BS_pb-ms-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="50"
                    value={m.threshold}
                    onChange={(e) => updateMilestone(idx, 'threshold', e.target.value)}
                  />
                </div>

                {/* Reward value */}
                <div className="BS_pb-ms-field">
                  <span className="BS_pb-ms-label">
                    {m.type === 'percentage_discount' ? 'Value (%)' : 'Value ($)'}
                  </span>
                  <input
                    className="BS_pb-ms-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="10"
                    value={m.rewardValue}
                    onChange={(e) => updateMilestone(idx, 'rewardValue', e.target.value)}
                  />
                </div>

                {/* Reward label */}
                <div className="BS_pb-ms-field">
                  <span className="BS_pb-ms-label">Reward Label</span>
                  <input
                    className="BS_pb-ms-input"
                    type="text"
                    placeholder="Free Shipping!"
                    value={m.rewardLabel}
                    onChange={(e) => updateMilestone(idx, 'rewardLabel', e.target.value)}
                  />
                </div>

                {/* Message */}
                <div className="BS_pb-ms-field">
                  <span className="BS_pb-ms-label">Progress Message</span>
                  <input
                    className="BS_pb-ms-input"
                    type="text"
                    placeholder="You're $10 away from free shipping!"
                    value={m.message}
                    onChange={(e) => updateMilestone(idx, 'message', e.target.value)}
                  />
                </div>

                {/* Remove */}
                <button
                  className="BS_pb-ms-remove"
                  onClick={() => removeMilestone(idx)}
                  title="Remove milestone"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Reset config */}
        {config && (
          <button
            className="BS_pb-reset-btn"
            onClick={handleReset}
            disabled={busy}
          >
            Reset to defaults
          </button>
        )}
      </s-section>
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="p-6">
      <s-section>
        <div className="p-6 text-center">
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Failed to load progress bar settings
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
