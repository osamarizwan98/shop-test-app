import { useLoaderData } from 'react-router';
import { Link } from 'react-router';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';
import { AnalyticsService } from '../services/analytics.server.js';

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return `$${toNum(v).toFixed(2)}`;
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [bundleCount, activeBundleCount, todayAgg, analyticsRaw] = await Promise.all([
    prisma.bundle.count({ where: { shop } }),
    prisma.bundle.count({ where: { shop, status: 'active' } }),
    prisma.orderAttribution.aggregate({
      where: { shop, isBundleOrder: true, isCanceled: false, createdAt: { gte: today } },
      _sum: { bundleRevenue: true },
    }),
    AnalyticsService.getDashboardAnalytics(shop),
  ]);

  const bundleRevenue = toNum(analyticsRaw.bundleRevenue);
  const nonBundleRevenue = toNum(analyticsRaw.nonBundleRevenue);
  const bundleOrders = Math.max(toNum(analyticsRaw.bundleOrders), 0);
  const totalOrders = Math.max(toNum(analyticsRaw.totalOrders), 0);
  const nonBundleOrders = Math.max(totalOrders - bundleOrders, 0);

  return {
    bundleCount,
    activeBundleCount,
    todayRevenue: toNum(todayAgg._sum?.bundleRevenue),
    conversionRate: toNum(analyticsRaw.bundleConversionRate) * 100,
    bundleAov: bundleOrders > 0 ? bundleRevenue / bundleOrders : 0,
    normalAov: nonBundleOrders > 0 ? nonBundleRevenue / nonBundleOrders : 0,
    topBundles: (analyticsRaw.topBundles ?? []).slice(0, 3),
  };
}

const QUICK_ACTIONS = [
  { label: 'Create Bundle', to: '/app/bundles/new', primary: true },
  { label: 'View Analytics', to: '/app/analytics', primary: false },
  { label: 'Manage FBT', to: '/app/fbt', primary: false },
];

export default function Dashboard() {
  const { bundleCount, activeBundleCount, todayRevenue, conversionRate, bundleAov, normalAov, topBundles } =
    useLoaderData();

  const kpiCards = [
    { label: 'Bundle Revenue Today', value: money(todayRevenue), sub: 'from bundle orders today' },
    { label: 'Conversion Rate', value: `${toNum(conversionRate).toFixed(1)}%`, sub: 'bundle orders / total orders' },
    { label: 'Active Bundles', value: String(activeBundleCount), sub: 'currently live' },
    { label: 'Avg Order Value', value: `${money(bundleAov)} vs ${money(normalAov)}`, sub: 'bundle vs normal' },
  ];

  return (
    <div className="p-6" style={{ background: 'var(--background)', minHeight: '100vh' }}>

      {/* A. Welcome Banner — only if no bundles exist */}
      {bundleCount === 0 && (
        <div className="mb-6">
          <s-section>
            <div className="flex items-center justify-between p-4 flex-wrap gap-4">
              <div>
                <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                  Welcome to SmartBundle AI
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Create your first bundle to start boosting AOV
                </p>
              </div>
              <Link
                to="/app/bundles/new"
                className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium"
                style={{ background: 'var(--primary)', color: 'var(--text-inverted)' }}
              >
                Create your first bundle
              </Link>
            </div>
          </s-section>
        </div>
      )}

      {/* B. KPI Cards Row */}
      <div className="grid grid-cols-2 gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {kpiCards.map((card) => (
          <s-section key={card.label}>
            <div className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide mb-3"
                style={{ color: 'var(--text-secondary)' }}>
                {card.label}
              </p>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {card.value}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {card.sub}
              </p>
            </div>
          </s-section>
        ))}
      </div>

      {/* C. Quick Actions */}
      <div className="mb-6">
        <s-section>
          <div className="p-5">
            <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              Quick Actions
            </p>
            <div className="flex gap-3 flex-wrap">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.label}
                  to={action.to}
                  className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
                  style={
                    action.primary
                      ? { background: 'var(--primary)', color: 'var(--text-inverted)' }
                      : { background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }
                  }
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </div>
        </s-section>
      </div>

      {/* D. Top 3 Bundles */}
      <s-section>
        <div className="p-5">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Top Performing Bundles
            </p>
            <Link to="/app/analytics" className="text-xs" style={{ color: 'var(--secondary)' }}>
              View all
            </Link>
          </div>

          {topBundles.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
              No bundle sales yet. Create a bundle to start tracking revenue.
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: 'var(--background-section)', borderBottom: '1px solid var(--border)' }}>
                  <th className="py-2 px-3 text-left font-medium text-xs" style={{ color: 'var(--text-secondary)' }}>Bundle</th>
                  <th className="py-2 px-3 text-left font-medium text-xs" style={{ color: 'var(--text-secondary)' }}>Revenue</th>
                  <th className="py-2 px-3 text-left font-medium text-xs" style={{ color: 'var(--text-secondary)' }}>Conversions</th>
                </tr>
              </thead>
              <tbody>
                {topBundles.map((b, i) => (
                  <tr key={b.bundleId} style={{ borderBottom: '1px solid var(--divider)' }}>
                    <td className="py-3 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <span className="mr-2 text-xs" style={{ color: 'var(--text-muted)' }}>#{i + 1}</span>
                      {b.bundleTitle || b.bundleId}
                    </td>
                    <td className="py-3 px-3" style={{ color: 'var(--text-primary)' }}>{money(b.revenue)}</td>
                    <td className="py-3 px-3" style={{ color: 'var(--text-primary)' }}>{b.conversions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
            Something went wrong
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Failed to load the dashboard. Please refresh.
          </p>
          <button
            type="button"
            className="mt-4 px-4 py-2 rounded-md text-sm font-medium"
            style={{ background: 'var(--primary)', color: 'var(--text-inverted)' }}
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>
      </s-section>
    </div>
  );
}
