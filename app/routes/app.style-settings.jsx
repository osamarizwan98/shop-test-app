import { useEffect } from 'react';
import { useFetcher, useLoaderData } from 'react-router';
import prisma from '../db.server.js';
import { StyleProvider, useStyleConfig } from '../components/StyleProvider.jsx';
import { authenticate } from '../shopify.server.js';
import { sanitizeBundleStyleConfig, getDefaultBundleStyleConfig } from '../utils/styleConfig.server.js';
import { syncBundleStyleConfigToShopify } from '../utils/bundleSync.js';

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  if (!session?.shop) {
    throw new Response('Unauthorized', { status: 401 });
  }

  const existing = await prisma.bundleStyleSettings.findUnique({
    where: { shop: session.shop },
    select: { config: true },
  });

  const styleConfig = sanitizeBundleStyleConfig(
    existing?.config ?? getDefaultBundleStyleConfig(),
  );

  return {
    styleConfig,
  };
}

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  if (!session?.shop) {
    return { success: false, error: 'Shop information not available.' };
  }

  const formData = await request.formData();
  const rawConfig = formData.get('styleConfig');

  let parsedConfig = null;
  try {
    parsedConfig = JSON.parse(typeof rawConfig === 'string' ? rawConfig : '{}');
  } catch {
    return { success: false, error: 'Invalid style payload.' };
  }

  const sanitized = sanitizeBundleStyleConfig(parsedConfig);

  await prisma.bundleStyleSettings.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      config: sanitized,
    },
    update: {
      config: sanitized,
    },
  });

  try {
    await syncBundleStyleConfigToShopify(admin, session.shop);
  } catch (error) {
    return {
      success: false,
      error: `Saved locally, but Shopify metafield sync failed: ${error.message}`,
      styleConfig: sanitized,
    };
  }

  return {
    success: true,
    message: 'Style settings saved and synced.',
    styleConfig: sanitized,
  };
}

function StyleSettingsPanel() {
  const { styleConfig, setStyleConfig } = useStyleConfig();
  const fetcher = useFetcher();
  const isSaving = fetcher.state !== 'idle';

  useEffect(() => {
    if (!fetcher.data) {
      return;
    }

    if (fetcher.data?.success && typeof window !== 'undefined' && window.shopify?.toast) {
      window.shopify.toast.show(fetcher.data.message || 'Settings saved.');
    }

    if (!fetcher.data?.success && fetcher.data?.error && typeof window !== 'undefined' && window.shopify?.toast) {
      window.shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data]);

  const updateField = (field) => (event) => {
    const nextValue = event.target.type === 'range' ? Number(event.target.value) : event.target.value;
    setStyleConfig((prev) => ({ ...prev, [field]: nextValue }));
  };

  return (
    <div className="SB_admin_container SB_dashboard">
      <div className="SB_header">
        <div>
          <h1 className="SB_dashboard-title">Bundle UI Style Engine</h1>
          <p className="SB_dashboard-subtitle">
            Configure storefront bundle styles without touching theme code.
          </p>
        </div>
      </div>

      <section className="SB_section">
        <div className="SB_section-header">
          <h2 className="SB_section-title Polaris-Text--headingLg">Style Controls</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: '1rem' }}>
          <label className="SB_bundleMeta">
            Button color
            <input type="color" value={styleConfig.buttonColor} onChange={updateField('buttonColor')} />
          </label>
          <label className="SB_bundleMeta">
            Card background
            <input type="color" value={styleConfig.cardBackgroundColor} onChange={updateField('cardBackgroundColor')} />
          </label>
          <label className="SB_bundleMeta">
            Badge color
            <input type="color" value={styleConfig.badgeColor} onChange={updateField('badgeColor')} />
          </label>
          <label className="SB_bundleMeta">
            Progress track color
            <input
              type="color"
              value={styleConfig.progressBackgroundColor}
              onChange={updateField('progressBackgroundColor')}
            />
          </label>
          <label className="SB_bundleMeta">
            Progress fill color
            <input type="color" value={styleConfig.progressFillColor} onChange={updateField('progressFillColor')} />
          </label>
          <label className="SB_bundleMeta">
            Text color
            <input type="color" value={styleConfig.textColor} onChange={updateField('textColor')} />
          </label>
          <label className="SB_bundleMeta">
            Font size: {styleConfig.fontSize}px
            <input type="range" min="12" max="22" step="1" value={styleConfig.fontSize} onChange={updateField('fontSize')} />
          </label>
          <label className="SB_bundleMeta">
            Border radius: {styleConfig.borderRadius}px
            <input type="range" min="4" max="32" step="1" value={styleConfig.borderRadius} onChange={updateField('borderRadius')} />
          </label>
          <label className="SB_bundleMeta">
            Layout preset
            <select value={styleConfig.layoutPreset} onChange={updateField('layoutPreset')}>
              <option value="grid">Grid</option>
              <option value="list">List</option>
            </select>
          </label>
        </div>

        <fetcher.Form method="post" style={{ marginTop: '1rem' }}>
          <input type="hidden" name="styleConfig" value={JSON.stringify(styleConfig)} />
          <button type="submit" className="SB_primaryButton" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save and Sync'}
          </button>
        </fetcher.Form>
      </section>

      <section className="SB_section">
        <div className="SB_section-header">
          <h2 className="SB_section-title Polaris-Text--headingLg">Live Preview</h2>
        </div>
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: `${styleConfig.borderRadius}px`,
            padding: '1rem',
            background: styleConfig.cardBackgroundColor,
            color: styleConfig.textColor,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <strong style={{ fontSize: `${styleConfig.fontSize + 2}px` }}>Frequently bought together</strong>
            <span style={{ background: styleConfig.badgeColor, color: '#fff', borderRadius: '999px', padding: '0.25rem 0.5rem' }}>
              15% off
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: styleConfig.layoutPreset === 'grid' ? 'repeat(2, minmax(0, 1fr))' : '1fr',
              gap: '0.5rem',
              marginBottom: '0.75rem',
            }}
          >
            <div style={{ border: '1px solid #e5e7eb', borderRadius: `${styleConfig.borderRadius}px`, padding: '0.5rem' }}>Product A</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: `${styleConfig.borderRadius}px`, padding: '0.5rem' }}>Product B</div>
          </div>
          <button
            type="button"
            style={{
              background: styleConfig.buttonColor,
              color: '#fff',
              border: 0,
              borderRadius: `${styleConfig.borderRadius}px`,
              fontSize: `${styleConfig.fontSize}px`,
              padding: '0.65rem 1rem',
              width: '100%',
            }}
          >
            Add bundle to cart
          </button>
          <div style={{ marginTop: '1rem' }}>
            <p style={{ marginBottom: '0.3rem', fontSize: `${styleConfig.fontSize - 1}px` }}>Progress to next reward</p>
            <div style={{ height: '10px', borderRadius: '999px', background: styleConfig.progressBackgroundColor }}>
              <div
                style={{
                  width: '58%',
                  height: '100%',
                  borderRadius: '999px',
                  background: styleConfig.progressFillColor,
                }}
              ></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function AppStyleSettingsRoute() {
  const { styleConfig } = useLoaderData();

  return (
    <StyleProvider initialConfig={styleConfig}>
      <StyleSettingsPanel />
    </StyleProvider>
  );
}
