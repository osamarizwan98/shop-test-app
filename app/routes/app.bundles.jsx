import { useLoaderData, useFetcher, Link } from 'react-router';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const bundles = await prisma.bundle.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' },
  });
  return { bundles };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get('intent');
  const id = formData.get('id');

  if (intent === 'delete') {
    await prisma.bundle.delete({ where: { id } });
    return { success: true };
  }

  if (intent === 'toggle') {
    const bundle = await prisma.bundle.findFirst({
      where: { id, shop: session.shop },
      select: { status: true },
    });
    if (!bundle) return { error: 'Bundle not found' };
    await prisma.bundle.update({
      where: { id },
      data: { status: bundle.status === 'active' ? 'inactive' : 'active' },
    });
    return { success: true };
  }

  return { error: 'Unknown intent' };
}

function discountLabel(type, value) {
  if (type === 'percentage') return `${value}% off`;
  if (type === 'fixed_amount') return `$${Number(value).toFixed(2)} off`;
  return `${value}`;
}

function productCount(productIds) {
  if (Array.isArray(productIds)) return productIds.length;
  return 0;
}

function StatusBadge({ status }) {
  const isActive = status === 'active';
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={
        isActive
          ? { background: 'var(--primary-light, #D1FAE5)', color: 'var(--primary-dark, #047857)' }
          : { background: 'var(--background-section, #F3F4F6)', color: 'var(--text-muted, #9CA3AF)' }
      }
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

function BundleRow({ bundle }) {
  const fetcher = useFetcher();
  const isDeleting = fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'delete';
  const isToggling = fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'toggle';

  return (
    <tr
      className="transition-colors"
      style={{
        borderBottom: '1px solid var(--divider, #F3F4F6)',
        opacity: isDeleting ? 0.4 : 1,
      }}
    >
      <td className="py-3 px-4 font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
        {bundle.title}
      </td>
      <td className="py-3 px-4 text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
        {productCount(bundle.productIds)}
      </td>
      <td className="py-3 px-4 text-sm" style={{ color: 'var(--text-primary)' }}>
        {discountLabel(bundle.discountType, bundle.discountValue)}
      </td>
      <td className="py-3 px-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Fixed Bundle
      </td>
      <td className="py-3 px-4">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="toggle" />
          <input type="hidden" name="id" value={bundle.id} />
          <button type="submit" className="cursor-pointer" disabled={isToggling}>
            <StatusBadge status={isToggling ? (bundle.status === 'active' ? 'inactive' : 'active') : bundle.status} />
          </button>
        </fetcher.Form>
      </td>
      <td className="py-3 px-4 text-sm" style={{ color: 'var(--text-primary)' }}>
        ${Number(bundle.totalRevenue).toFixed(2)}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Link
            to={`/app/bundles/${bundle.id}`}
            className="text-xs px-3 py-1 rounded font-medium"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            Edit
          </Link>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="id" value={bundle.id} />
            <button
              type="submit"
              disabled={isDeleting}
              className="text-xs px-3 py-1 rounded font-medium"
              style={{ background: 'var(--error-light, #FEE2E2)', color: 'var(--error, #EF4444)', border: 'none', cursor: 'pointer' }}
              onClick={(e) => {
                if (!window.confirm(`Delete "${bundle.title}"? This cannot be undone.`)) {
                  e.preventDefault();
                }
              }}
            >
              {isDeleting ? '...' : 'Delete'}
            </button>
          </fetcher.Form>
        </div>
      </td>
    </tr>
  );
}

export default function BundleList() {
  const { bundles } = useLoaderData();

  return (
    <div className="p-6" style={{ background: 'var(--background)', minHeight: '100vh' }}>

      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Bundles
          </p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {bundles.length} bundle{bundles.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Link
          to="/app/bundles/new"
          className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium"
          style={{ background: 'var(--primary)', color: 'var(--text-inverted, #fff)' }}
        >
          + Create Bundle
        </Link>
      </div>

      <s-section>
        {bundles.length === 0 ? (
          /* Empty state */
          <div className="py-16 flex flex-col items-center text-center gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
              style={{ background: 'var(--primary-light, #D1FAE5)' }}
            >
              📦
            </div>
            <div>
              <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                No bundles yet
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                Create your first bundle to boost AOV
              </p>
            </div>
            <Link
              to="/app/bundles/new"
              className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium mt-2"
              style={{ background: 'var(--primary)', color: 'var(--text-inverted, #fff)' }}
            >
              Create your first bundle
            </Link>
          </div>
        ) : (
          /* Bundles table */
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: 'var(--background-section, #F3F4F6)', borderBottom: '1px solid var(--border)' }}>
                  <th className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Name
                  </th>
                  <th className="py-3 px-4 text-center font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Products
                  </th>
                  <th className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Discount
                  </th>
                  <th className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Type
                  </th>
                  <th className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Status
                  </th>
                  <th className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Revenue
                  </th>
                  <th className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {bundles.map((bundle) => (
                  <BundleRow key={bundle.id} bundle={bundle} />
                ))}
              </tbody>
            </table>
          </div>
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
            Failed to load bundles
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Please refresh the page.
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
