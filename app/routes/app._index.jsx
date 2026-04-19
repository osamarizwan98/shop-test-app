import { useEffect } from 'react';
import { useFetcher, useLoaderData } from 'react-router';
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

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Error('Shop information not available');
  }

  try {
    const bundles = await prisma.bundle.findMany({
      where: {
        shop: session.shop,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

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

    // Fetch analytics data
    const analytics = await AnalyticsService.getAnalytics(session.shop);

    return {
      bundles: plainBundles,
      stats: {
        totalBundles: plainBundles.length,
        activeBundles,
        inactiveBundles,
      },
      analytics: {
        totalBundleSales: analytics.totalBundleSales,
        totalRevenue: analytics.totalRevenue,
        totalSavings: analytics.totalSavings,
      },
    };
  } catch (error) {
    console.error('Error loading bundle dashboard:', error);
    return {
      bundles: [],
      stats: {
        totalBundles: 0,
        activeBundles: 0,
        inactiveBundles: 0,
      },
      error: 'Failed to load bundle dashboard.',
    };
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

export default function AppIndex() {
  const { bundles, stats, analytics, error } = useLoaderData();
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== 'idle';

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
    <div className="SB_dashboard">
      <div className="SB_header">
        <div>
          <h1 className="SB_dashboard-title">Bundle Management</h1>
          <p className="SB_dashboard-subtitle">
            View bundle performance, toggle availability, and keep Shopify metafields synced in real time.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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

      {error ? (
        <div className="SB_banner SB_banner-error">
          <p className="SB_bannerText">{error}</p>
        </div>
      ) : null}

      <div className="SB_stats-grid">
        <article className="SB_stat-card">
          <span className="SB_stat-label">Total Revenue</span>
          <strong className="SB_stat-value">${analytics.totalRevenue.toFixed(2)}</strong>
        </article>
        <article className="SB_stat-card">
          <span className="SB_stat-label">Bundle Sales</span>
          <strong className="SB_stat-value">{analytics.totalBundleSales}</strong>
        </article>
        <article className="SB_stat-card">
          <span className="SB_stat-label">Total Savings</span>
          <strong className="SB_stat-value">${analytics.totalSavings.toFixed(2)}</strong>
        </article>
      </div>

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
      </div>

      <section className="SB_section">
        <div className="SB_section-header">
          <div>
            <h2 className="SB_section-title">Your bundles</h2>
            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '8px 0 0 0' }}>
              Any status or delete action immediately refreshes the synced `active_bundles` metafield.
            </p>
          </div>
        </div>

        {bundles.length === 0 ? (
          <div className="SB_empty-state">
            <p className="SB_empty-title">No bundles created yet.</p>
            <p className="SB_empty-description">
              Create your first bundle to start syncing automatic discount rules to Shopify.
            </p>
            <a href="/app/bundles/new" className="SB_primaryButton">
              Create first bundle
            </a>
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
                          <strong style={{ fontSize: '0.875rem', color: '#1a202c' }}>{bundle.title}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
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
                            style={{ padding: '8px 16px', fontSize: '0.75rem' }}
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
