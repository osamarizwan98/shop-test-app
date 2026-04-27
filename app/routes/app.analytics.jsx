import { useState, useEffect } from 'react';
import { useLoaderData, Link } from 'react-router';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import analyticsStyles from '../styles/analytics.css?url';

export const links = () => [{ rel: 'stylesheet', href: analyticsStyles }];

// ── Server helpers ─────────────────────────────────────────────────────────────

function getPeriodStart(period) {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);
  return since;
}

async function getAnalyticsSummary(shop, since) {
  const [revenueAgg, savingsAgg, viewCount, purchaseCount] = await Promise.all([
    prisma.analyticsEvent.aggregate({
      where: { shopDomain: shop, event: 'bundle_purchased', timestamp: { gte: since } },
      _sum: { revenue: true },
    }),
    prisma.analyticsEvent.aggregate({
      where: { shopDomain: shop, event: 'bundle_purchased', timestamp: { gte: since } },
      _sum: { discountAmount: true },
    }),
    prisma.analyticsEvent.count({
      where: { shopDomain: shop, event: 'bundle_viewed', timestamp: { gte: since } },
    }),
    prisma.analyticsEvent.count({
      where: { shopDomain: shop, event: 'bundle_purchased', timestamp: { gte: since } },
    }),
  ]);

  const totalRevenue = revenueAgg._sum.revenue ?? 0;
  const totalSavings = savingsAgg._sum.discountAmount ?? 0;
  const conversionRate = viewCount > 0 ? (purchaseCount / viewCount) * 100 : 0;

  return { totalRevenue, totalSavings, conversionRate, viewCount, purchaseCount };
}

async function getTopBundles(shop, since, limit) {
  const purchaseGroups = await prisma.analyticsEvent.groupBy({
    by: ['bundleId'],
    where: {
      shopDomain: shop,
      event: 'bundle_purchased',
      timestamp: { gte: since },
      bundleId: { not: null },
    },
    _sum: { revenue: true },
    _count: { id: true },
    orderBy: { _sum: { revenue: 'desc' } },
    take: limit,
  });

  const bundleIds = purchaseGroups.map((r) => r.bundleId).filter(Boolean);
  if (bundleIds.length === 0) return [];

  const viewGroups = await prisma.analyticsEvent.groupBy({
    by: ['bundleId'],
    where: {
      shopDomain: shop,
      event: 'bundle_viewed',
      timestamp: { gte: since },
      bundleId: { in: bundleIds },
    },
    _count: { id: true },
  });

  const bundles = await prisma.bundle.findMany({
    where: { id: { in: bundleIds } },
    select: { id: true, title: true },
  });

  const titleMap = new Map(bundles.map((b) => [b.id, b.title]));
  const viewMap = new Map(viewGroups.map((v) => [v.bundleId, v._count.id]));

  return purchaseGroups.map((row, i) => {
    const conversions = row._count.id;
    const views = viewMap.get(row.bundleId) ?? 0;
    return {
      rank: i + 1,
      bundleId: row.bundleId,
      title: titleMap.get(row.bundleId) ?? 'Unknown Bundle',
      revenue: row._sum.revenue ?? 0,
      conversions,
      convRate: views > 0 ? (conversions / views) * 100 : 0,
    };
  });
}

async function getChartData(shop, since) {
  const events = await prisma.analyticsEvent.findMany({
    where: { shopDomain: shop, event: 'bundle_purchased', timestamp: { gte: since } },
    select: { timestamp: true, revenue: true },
    orderBy: { timestamp: 'asc' },
  });

  // Group by calendar day in JS — avoids SQLite date-function quirks
  const byDay = new Map();
  for (const e of events) {
    const day = e.timestamp.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + (e.revenue ?? 0));
  }

  return Array.from(byDay.entries()).map(([date, revenue]) => ({ date, revenue }));
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const period = url.searchParams.get('period') ?? '30d';
  const since = getPeriodStart(period);

  const [summary, topBundles, chartData] = await Promise.all([
    getAnalyticsSummary(session.shop, since),
    getTopBundles(session.shop, since, 5),
    getChartData(session.shop, since),
  ]);

  return { summary, topBundles, chartData, period };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const { events } = await request.json();

  if (!Array.isArray(events) || events.length === 0) {
    return { ok: true };
  }

  await prisma.analyticsEvent.createMany({
    data: events.map((e) => ({
      shopDomain: session.shop,
      event: String(e.event ?? ''),
      bundleId: e.bundleId ?? null,
      sessionId: e.sessionId ?? null,
      orderId: e.orderId ?? null,
      revenue: e.revenue != null ? Number(e.revenue) : null,
      discountAmount: e.discountAmount != null ? Number(e.discountAmount) : null,
      metadata: e.metadata ?? null,
      timestamp: e.timestamp ? new Date(e.timestamp) : undefined,
    })),
    skipDuplicates: true,
  });

  return { ok: true };
}

// ── UI components ──────────────────────────────────────────────────────────────

const CHART_COLORS = {
  revenue:  'var(--primary)',
  clicks:   'var(--secondary)',
  warnings: 'var(--accent)',
  error:    'var(--error)',
};

const PERIOD_OPTIONS = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
];

function PeriodSelector({ period }) {
  return (
    <div className="BS_period-tabs">
      {PERIOD_OPTIONS.map((opt) => (
        <Link
          key={opt.value}
          to={`?period=${opt.value}`}
          className={`BS_period-tab${period === opt.value ? ' BS_period-tab--active' : ''}`}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}

function KpiCard({ label, value, sub }) {
  return (
    <div className="BS_kpi-card">
      <p className="BS_kpi-label">{label}</p>
      <p className="BS_kpi-value">{value}</p>
      {sub && <p className="BS_kpi-sub">{sub}</p>}
    </div>
  );
}

// Renders nothing on SSR; swaps in children after mount to avoid recharts
// calling browser APIs (ResizeObserver) during server rendering.
function ClientOnly({ height, children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div style={{ height }} />;
  return <>{children}</>;
}

function RevenueChart({ data }) {
  return (
    <ClientOnly height={220}>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="BS_rev-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.revenue} stopOpacity={0.2} />
              <stop offset="95%" stopColor={CHART_COLORS.revenue} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
            tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip
            formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Revenue']}
            contentStyle={{ border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke={CHART_COLORS.revenue}
            strokeWidth={2}
            fill="url(#BS_rev-fill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ClientOnly>
  );
}

function BundleLeaderboard({ bundles }) {
  return (
    <table className="BS_leaderboard-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Bundle Name</th>
          <th>Revenue</th>
          <th>Conv.</th>
          <th>Conv. Rate</th>
        </tr>
      </thead>
      <tbody>
        {bundles.map((b) => (
          <tr key={b.bundleId} className={b.rank === 1 ? 'BS_leaderboard-row--top' : ''}>
            <td className="BS_leaderboard-rank">#{b.rank}</td>
            <td>{b.title}</td>
            <td>${b.revenue.toFixed(2)}</td>
            <td>{b.conversions}</td>
            <td>{b.convRate.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AovChart({ bundleAov }) {
  const data = [
    { name: 'Bundle', aov: bundleAov, fill: CHART_COLORS.revenue },
    { name: 'Regular', aov: 0, fill: CHART_COLORS.clicks },
  ];

  return (
    <ClientOnly height={220}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
            tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip
            formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Avg Order Value']}
            contentStyle={{ border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="aov" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ClientOnly>
  );
}

function EmptyState() {
  return (
    <div className="BS_empty-state">
      <div className="BS_empty-icon">📊</div>
      <p className="BS_empty-title">No analytics yet</p>
      <p className="BS_empty-sub">
        Your analytics will appear after your first bundle sale. Set up your first bundle to get
        started.
      </p>
      <Link to="/app/bundles/new" className="BS_empty-cta">
        Create Bundle
      </Link>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const { summary, topBundles, chartData, period } = useLoaderData();
  const isEmpty = summary.totalRevenue === 0 && topBundles.length === 0;
  const bundleAov =
    summary.purchaseCount > 0 ? summary.totalRevenue / summary.purchaseCount : 0;

  return (
    <div className="BS_analytics-page">
      <div className="BS_analytics-header">
        <p className="BS_analytics-title">Analytics</p>
        <PeriodSelector period={period} />
      </div>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          {/* KPI row */}
          <div className="BS_kpi-grid">
            <KpiCard
              label="Bundle Revenue"
              value={`$${summary.totalRevenue.toFixed(2)}`}
              sub={`${summary.purchaseCount} order${summary.purchaseCount !== 1 ? 's' : ''}`}
            />
            <KpiCard
              label="Conversion Rate"
              value={`${summary.conversionRate.toFixed(1)}%`}
              sub={`${summary.viewCount} views → ${summary.purchaseCount} sales`}
            />
            <KpiCard
              label="Total Savings"
              value={`$${summary.totalSavings.toFixed(2)}`}
              sub="Discounts applied to orders"
            />
            <KpiCard
              label="Bundle AOV"
              value={`$${bundleAov.toFixed(2)}`}
              sub="Avg order value (bundle orders)"
            />
          </div>

          {/* Revenue chart */}
          <div className="BS_chart-card">
            <p className="BS_section-title">Daily Bundle Revenue</p>
            {chartData.length === 0 ? (
              <p className="BS_chart-empty">No revenue data for this period.</p>
            ) : (
              <RevenueChart data={chartData} />
            )}
          </div>

          {/* Bottom: leaderboard + AOV chart */}
          <div className="BS_bottom-row">
            <div className="BS_panel">
              <p className="BS_section-title">Top 5 Bundles</p>
              {topBundles.length === 0 ? (
                <p className="BS_chart-empty">No bundle data for this period.</p>
              ) : (
                <BundleLeaderboard bundles={topBundles} />
              )}
            </div>
            <div className="BS_panel">
              <p className="BS_section-title">Avg Order Value</p>
              <AovChart bundleAov={bundleAov} />
              <p className="BS_aov-note">
                Regular order AOV available after Order webhooks are configured.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
