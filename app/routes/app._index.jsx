import { useEffect, useMemo } from 'react';
import { isRouteErrorResponse, useFetcher, useLoaderData, useRouteError } from 'react-router';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';
import { AnalyticsService } from '../services/analytics.server.js';
import { syncBundlesToShopify } from '../utils/bundleSync.js';

async function syncActiveBundlesMetafield({ admin, shop }) {
  return await syncBundlesToShopify(admin, shop);
}

function getProductsCount(productIds) {
  return Array.isArray(productIds) ? productIds.length : 0;
}

function formatDiscount(bundle) {
  if (bundle.discountType === 'percentage') {
    return `${bundle.discountValue}%`;
  }

  return `$${Number(bundle.discountValue || 0).toFixed(2)}`;
}

function toSafeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toSafeCount(value) {
  const numeric = Math.floor(toSafeNumber(value));
  return numeric > 0 ? numeric : 0;
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Error('Shop information not available');
  }

  try {
    const bundleWhere = { shop: session.shop };
    const [bundleCount, latestBundle] = await Promise.all([
      prisma.bundle.count({ where: bundleWhere }),
      prisma.bundle.findFirst({
        where: bundleWhere,
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);

    const cacheVersion = latestBundle?.updatedAt?.toISOString() || '0';
    const etag = `W/"sb-bundles:${session.shop}:${bundleCount}:${cacheVersion}"`;
    const requestEtag = request.headers.get('if-none-match');

    if (requestEtag === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
          ETag: etag,
        },
      });
    }

    const [bundles, analyticsRaw] = await Promise.all([
      prisma.bundle.findMany({
        where: bundleWhere,
        select: {
          id: true,
          title: true,
          status: true,
          discountType: true,
          discountValue: true,
          productIds: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      AnalyticsService.getDashboardAnalytics(session.shop),
    ]);

    const plainBundles = bundles.map((bundle) => ({
      id: bundle.id,
      title: bundle.title,
      status: bundle.status,
      discountType: bundle.discountType,
      discountValue: bundle.discountValue,
      productIds: Array.isArray(bundle.productIds) ? bundle.productIds : [],
      createdAt: bundle.createdAt.toISOString(),
      updatedAt: bundle.updatedAt.toISOString(),
    }));

    const activeBundles = plainBundles.filter((bundle) => bundle.status === 'active').length;
    const inactiveBundles = plainBundles.filter((bundle) => bundle.status === 'inactive').length;

    const safeRevenue = Number(toSafeNumber(analyticsRaw?.bundleRevenue).toFixed(2));
    const safeNonBundleRevenue = Number(toSafeNumber(analyticsRaw?.nonBundleRevenue).toFixed(2));
    const safeBundleSales = toSafeCount(analyticsRaw?.bundleOrders);
    const safeTotalOrders = toSafeCount(analyticsRaw?.totalOrders);
    const safeConversionRate = Number(toSafeNumber(analyticsRaw?.bundleConversionRate) * 100);
    const safeUplift = Number(toSafeNumber(analyticsRaw?.revenueUplift) * 100);

    const payload = {
      bundles: plainBundles,
      stats: {
        totalBundles: plainBundles.length,
        activeBundles,
        inactiveBundles,
      },
      analytics: {
        totalOrders: safeTotalOrders,
        totalBundleSales: safeBundleSales,
        totalRevenue: safeRevenue,
        totalNonBundleRevenue: safeNonBundleRevenue,
        bundleConversionRate: safeConversionRate,
        revenueUplift: safeUplift,
        topBundles: Array.isArray(analyticsRaw?.topBundles) ? analyticsRaw.topBundles : [],
        trend: Array.isArray(analyticsRaw?.trend) ? analyticsRaw.trend : [],
        lastUpdatedAt: new Date().toISOString(),
      },
    };

    return new Response(JSON.stringify(payload), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
        ETag: etag,
      },
    });
  } catch (error) {
    console.error('Error loading bundle dashboard:', error);
    throw new Response(JSON.stringify({
      message: 'Failed to load bundle dashboard.',
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    return { error: 'Invalid method.' };
  }

  const { admin, session } = await authenticate.admin(request);

  if (!session?.shop) {
    return { error: 'Shop information not available.', status: 401 };
  }

  try {
    const formData = await request.formData();
    const intent = formData.get('intent');
    const bundleId = formData.get('bundleId');

    if (typeof bundleId !== 'string' || bundleId.length === 0) {
      return { error: 'Bundle ID is required.' };
    }

    const existingBundle = await prisma.bundle.findFirst({
      where: {
        id: bundleId,
        shop: session.shop,
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (!existingBundle) {
      return { error: 'Bundle not found.' };
    }

    if (intent === 'TOGGLE_STATUS') {
      const nextStatus = existingBundle.status === 'active' ? 'inactive' : 'active';

      await prisma.bundle.update({
        where: {
          id: existingBundle.id,
        },
        data: {
          status: nextStatus,
          inventoryHidden: false,
        },
      });

      try {
        await syncActiveBundlesMetafield({
          admin,
          shop: session.shop,
        });
      } catch (syncError) {
        console.error('Metafield sync failed after bundle toggle:', syncError);
        return {
          error: 'Bundle status updated, but syncing active bundles to Shopify failed.',
          syncFailed: true,
        };
      }

      return {
        success: true,
        message: `Bundle "${existingBundle.title}" ${nextStatus === 'active' ? 'activated' : 'paused'} successfully.`,
      };
    }

    if (intent === 'DELETE') {
      await prisma.bundle.delete({
        where: {
          id: existingBundle.id,
        },
      });

      try {
        await syncActiveBundlesMetafield({
          admin,
          shop: session.shop,
        });
      } catch (syncError) {
        console.error('Metafield sync failed after bundle deletion:', syncError);
        return {
          error: 'Bundle deleted, but syncing active bundles to Shopify failed.',
          syncFailed: true,
        };
      }

      return {
        success: true,
        message: `Bundle "${existingBundle.title}" deleted successfully.`,
      };
    }

    if (intent === 'SYNC') {
      try {
        const syncResult = await syncActiveBundlesMetafield({
          admin,
          shop: session.shop,
        });

        return {
          success: true,
          message: `Successfully synced ${syncResult.syncedBundles} bundles to Shopify metafields.`,
        };
      } catch (syncError) {
        console.error('Manual sync failed:', syncError);
        return {
          error: `Sync failed: ${syncError.message}`,
        };
      }
    }

    return { error: 'Unsupported action.' };
  } catch (error) {
    console.error('Error updating bundle dashboard:', error);
    return {
      error: error.message || 'Failed to update bundle.',
    };
  }
}

function formatCurrency(value) {
  return `$${toSafeNumber(value).toFixed(2)}`;
}

function formatTimestamp(value) {
  if (!value) {
    return 'Just now';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  return date.toLocaleString();
}

function renderSBStatCard({ key, label, value, icon, emphasizeValue = false }) {
  return (
    <article key={key} className="SB_stat-card SB_stat-card--analytics">
      <span className="SB_stat-icon" aria-hidden="true">{icon}</span>
      <span className="SB_stat-label">{label}</span>
      <strong className={`SB_stat-value ${emphasizeValue ? 'SB_stat_value' : ''}`}>{value}</strong>
    </article>
  );
}

function renderTrendChart(series = []) {
  const normalized = Array.isArray(series) ? series : [];
  if (normalized.length === 0) {
    return (
      <div className="SB_chartEmpty">
        <p className="SB_section-note">No trend data yet. New orders will appear here automatically.</p>
      </div>
    );
  }

  const points = normalized.map((entry) => {
    const bundleRevenue = toSafeNumber(entry?.bundleRevenue);
    const nonBundleRevenue = toSafeNumber(entry?.nonBundleRevenue);
    return {
      day: String(entry?.day || ''),
      total: bundleRevenue + nonBundleRevenue,
      bundleRevenue,
    };
  });

  const maxValue = Math.max(...points.map((p) => p.total), 1);
  const width = 680;
  const height = 160;
  const padding = 18;

  const toX = (index) => {
    if (points.length === 1) {
      return padding;
    }
    const usable = width - padding * 2;
    return padding + (usable * index) / (points.length - 1);
  };

  const toY = (value) => {
    const usable = height - padding * 2;
    return height - padding - (usable * value) / maxValue;
  };

  const totalPath = points
    .map((p, index) => `${index === 0 ? 'M' : 'L'} ${toX(index)} ${toY(p.total)}`)
    .join(' ');
  const bundlePath = points
    .map((p, index) => `${index === 0 ? 'M' : 'L'} ${toX(index)} ${toY(p.bundleRevenue)}`)
    .join(' ');

  return (
    <div className="SB_trendChart" role="img" aria-label="Revenue trend chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="SB_trendChartSvg" aria-hidden="true">
        <path className="SB_trendChartGrid" d={`M ${padding} ${height - padding} H ${width - padding}`} />
        <path className="SB_trendChartLine SB_trendChartLine--total" d={totalPath} />
        <path className="SB_trendChartLine SB_trendChartLine--bundle" d={bundlePath} />
      </svg>
      <div className="SB_trendChartLegend">
        <span className="SB_legendItem"><span className="SB_legendSwatch total" aria-hidden="true"></span>Total</span>
        <span className="SB_legendItem"><span className="SB_legendSwatch bundle" aria-hidden="true"></span>Bundle</span>
      </div>
    </div>
  );
}

export default function AppIndex() {
  const { bundles, stats, analytics } = useLoaderData();
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== 'idle';

  const analyticsCards = useMemo(() => ([
    {
      key: 'revenue',
      label: 'Bundle Revenue',
      value: formatCurrency(analytics?.totalRevenue),
      icon: '$',
      emphasizeValue: true,
    },
    {
      key: 'uplift',
      label: 'Revenue Uplift',
      value: `${toSafeNumber(analytics?.revenueUplift).toFixed(1)}%`,
      icon: '↑',
      emphasizeValue: false,
    },
    {
      key: 'sales',
      label: 'Bundle Sales',
      value: `${toSafeCount(analytics?.totalBundleSales)}`,
      icon: '#',
      emphasizeValue: false,
    },
    {
      key: 'conversion',
      label: 'Bundle Conversion',
      value: `${toSafeNumber(analytics?.bundleConversionRate).toFixed(1)}%`,
      icon: '◎',
      emphasizeValue: false,
    },
  ]), [analytics?.bundleConversionRate, analytics?.revenueUplift, analytics?.totalBundleSales, analytics?.totalRevenue]);

  useEffect(() => {
    if (!fetcher.data) {
      return;
    }

    if (fetcher.data?.success && typeof window !== 'undefined' && window.shopify?.toast) {
      window.shopify.toast.show(fetcher.data.message || 'Bundle updated successfully.');
    }

    if (fetcher.data?.error && typeof window !== 'undefined' && window.shopify?.toast) {
      window.shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data]);

  const handleManagementSubmit = (event) => {
    const submitter = event.nativeEvent?.submitter;
    const intent = submitter?.value;

    if (intent === 'DELETE' && typeof window !== 'undefined') {
      const confirmed = window.confirm('Delete this bundle? This will also remove it from the synced storefront discount rules.');

      if (!confirmed) {
        event.preventDefault();
      }
    }
  };

  return (
    <div className="SB_admin_container SB_dashboard">
      <div className="SB_header">
        <div>
          <h1 className="SB_dashboard-title">Bundle Management</h1>
          <p className="SB_dashboard-subtitle">
            View bundle performance, toggle availability, and keep Shopify metafields synced in real time.
          </p>
        </div>
        <div className="SB_headerActions">
          <fetcher.Form method="post">
            <button
              type="submit"
              name="intent"
              value="SYNC"
              className="SB_secondaryButton"
              disabled={isSubmitting}
            >
              {isSubmitting && fetcher.formData?.get('intent') === 'SYNC'
                ? 'Syncing...'
                : 'Sync Now'}
            </button>
          </fetcher.Form>
          <a href="/app/bundles/new" className="SB_primaryButton">
            Create bundle
          </a>
        </div>
      </div>

      <section className="SB_analytics_section">
        <div className="SB_analytics_header">
          <h2 className="SB_section-title Polaris-Text--headingLg">Bundle Analytics</h2>
          <p className="SB_section-note">Last updated: {formatTimestamp(analytics?.lastUpdatedAt)}</p>
        </div>
        <div className="SB_analytics_grid">
          {analyticsCards.map((card) => renderSBStatCard(card))}
        </div>
      </section>

      <section className="SB_section">
        <div className="SB_section-header">
          <div>
            <h2 className="SB_section-title Polaris-Text--headingLg">Revenue Trend</h2>
            <p className="SB_section-note">Daily subtotal revenue for the last 14 days.</p>
          </div>
        </div>
        {renderTrendChart(analytics?.trend)}
      </section>

      <section className="SB_section">
        <div className="SB_section-header">
          <div>
            <h2 className="SB_section-title Polaris-Text--headingLg">Top Performing Bundles</h2>
            <p className="SB_section-note">Ranked by attributed revenue.</p>
          </div>
        </div>

        {Array.isArray(analytics?.topBundles) && analytics.topBundles.length > 0 ? (
          <div>
            <table className="SB_table">
              <thead>
                <tr>
                  <th>Bundle</th>
                  <th>Conversions</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {analytics.topBundles.map((entry) => (
                  <tr key={entry.bundleId}>
                    <td>
                      <strong className="SB_bundleTitle">{entry.bundleTitle || entry.bundleId}</strong>
                    </td>
                    <td>{toSafeCount(entry.conversions)}</td>
                    <td>{formatCurrency(entry.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="SB_empty_state_wrapper">
            <div className="SB_banner SB_bannerInline">
              <p className="SB_bannerText">No bundle conversions yet. Once orders come in, leaderboard data will appear here.</p>
            </div>
          </div>
        )}
      </section>

      <div className="SB_stats-grid">
        <article className="SB_stat-card">
          <span className="SB_stat-label">Total bundles</span>
          <strong className="SB_stat-value">{stats.totalBundles}</strong>
        </article>
        <article className="SB_stat-card">
          <span className="SB_stat-label">Active bundles</span>
          <strong className="SB_stat-value">{stats.activeBundles}</strong>
        </article>
        <article className="SB_stat-card">
          <span className="SB_stat-label">Inactive bundles</span>
          <strong className="SB_stat-value">{stats.inactiveBundles}</strong>
        </article>
        <article className="SB_stat-card">
          <span className="SB_stat-label">Total orders tracked</span>
          <strong className="SB_stat-value">{toSafeCount(analytics?.totalOrders)}</strong>
        </article>
      </div>

      <section className="SB_section">
        <div className="SB_section-header">
          <div>
            <h2 className="SB_section-title Polaris-Text--headingLg">Your bundles</h2>
            <p className="SB_section-note">
              Any status or delete action immediately refreshes the synced `active_bundles` metafield.
            </p>
          </div>
        </div>

        {bundles.length === 0 ? (
          <div className="SB_empty_state_wrapper">
            <div className="Polaris-EmptyState">
              <div className="Polaris-EmptyState__Section">
                <p className="Polaris-Text--headingMd">No bundles created yet</p>
                <p className="Polaris-Text--bodyMd SB_empty-description">
                  Create your first bundle to start syncing automatic discount rules to Shopify.
                </p>
                <a href="/app/bundles/new" className="SB_primaryButton">
                  Create first bundle
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <table className="SB_table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Products Count</th>
                  <th>Discount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bundles.map((bundle) => {
                  const isPending = isSubmitting && (
                    fetcher.formData?.get('bundleId') === bundle.id ||
                    fetcher.formData?.get('intent') === 'SYNC'
                  );

                  return (
                    <tr key={bundle.id}>
                      <td>
                        <div>
                          <strong className="SB_bundleTitle">{bundle.title}</strong>
                          <div className="SB_bundleMeta">
                            Updated {new Date(bundle.updatedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </td>
                      <td>{getProductsCount(bundle.productIds)}</td>
                      <td>{formatDiscount(bundle)}</td>
                      <td>
                        <span className={`SB_status-badge ${bundle.status === 'active' ? 'active' : 'inactive'}`}>
                          {bundle.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <fetcher.Form method="post" className="SB_actions" onSubmit={handleManagementSubmit}>
                          <input type="hidden" name="bundleId" value={bundle.id} />
                          <button
                            type="submit"
                            name="intent"
                            value="TOGGLE_STATUS"
                            className="SB_secondaryButton"
                            disabled={isPending}
                          >
                            {isPending && fetcher.formData?.get('intent') === 'TOGGLE_STATUS'
                              ? 'Saving...'
                              : bundle.status === 'active'
                                ? 'Pause'
                                : 'Activate'}
                          </button>
                          <button
                            type="submit"
                            name="intent"
                            value="DELETE"
                            className="SB_removeButton"
                            disabled={isPending}
                          >
                            {isPending && fetcher.formData?.get('intent') === 'DELETE'
                              ? 'Deleting...'
                              : 'Delete'}
                          </button>
                        </fetcher.Form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = 'Something went wrong while loading SmartBundle AI.';

  if (isRouteErrorResponse(error)) {
    errorMessage = error?.data?.message || error.statusText || errorMessage;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <div className="SB_admin_container SB_dashboard">
      <div className="SB_empty_state_wrapper SB_error_boundary">
        <div className="SB_banner SB_banner-error">
          <p className="SB_empty-title">Something went wrong</p>
          <p className="SB_empty-description">{errorMessage}</p>
          <button
            type="button"
            className="SB_primaryButton"
            onClick={() => window.location.reload()}
          >
            Refresh page
          </button>
        </div>
      </div>
    </div>
  );
}
