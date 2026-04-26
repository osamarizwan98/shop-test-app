import { Link } from 'react-router';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';
import BundleForm from '../components/BundleForm';

export async function loader({ request }) {
  await authenticate.admin(request);
  return {};
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');

  if (intent !== 'create') return { error: 'Invalid intent' };

  const title = String(formData.get('title') ?? '').trim();
  const discountType = String(formData.get('discountType') ?? '');
  const discountValue = parseFloat(String(formData.get('discountValue') ?? '0'));
  const status = String(formData.get('status') ?? 'active');

  let productIds = [];
  try {
    productIds = JSON.parse(String(formData.get('productIds') ?? '[]'));
  } catch {
    return { error: 'Invalid product data' };
  }

  if (!title) return { error: 'Bundle name is required' };
  if (!['percentage', 'fixed_amount'].includes(discountType))
    return { error: 'Invalid discount type' };
  if (isNaN(discountValue) || discountValue < 0)
    return { error: 'Invalid discount value' };

  await prisma.bundle.create({
    data: {
      shop: session.shop,
      title,
      discountType,
      discountValue,
      status,
      productIds,
    },
  });

  return { success: true };
}

export default function NewBundle() {
  return (
    <div className="p-6" style={{ background: 'var(--background)', minHeight: '100vh' }}>

      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/app/bundles"
          className="text-sm"
          style={{ color: 'var(--secondary)' }}
        >
          ← Bundles
        </Link>
        <span style={{ color: 'var(--border)' }}>/</span>
        <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Create Bundle
        </p>
      </div>
      <BundleForm intent="create" />
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="p-6">
      <s-section>
        <div className="p-6 text-center">
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Failed to load
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
