import { useLoaderData, Link } from 'react-router';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';
import BundleForm from '../components/BundleForm';

export async function loader({ request, params }) {
  const { session } = await authenticate.admin(request);
  const bundle = await prisma.bundle.findFirst({
    where: { id: params.id, shop: session.shop },
  });
  if (!bundle) throw new Response('Bundle not found', { status: 404 });
  return { bundle };
}

export async function action({ request, params }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');

  if (intent !== 'update') return { error: 'Invalid intent' };

  const id = String(formData.get('id') ?? params.id ?? '');
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

  const existing = await prisma.bundle.findFirst({
    where: { id, shop: session.shop },
    select: { id: true },
  });
  if (!existing) return { error: 'Bundle not found' };

  await prisma.bundle.update({
    where: { id },
    data: {
      title,
      discountType,
      discountValue,
      status,
      productIds,
    },
  });

  return { success: true };
}

export default function EditBundle() {
  const { bundle } = useLoaderData();

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
          Edit Bundle
        </p>
      </div>

      {/* key=bundle.id ensures BundleForm re-mounts fresh if the user navigates
          between different edit pages without a full page reload */}
      <BundleForm key={bundle.id} bundle={bundle} intent="update" />
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="p-6">
      <s-section>
        <div className="p-6 text-center">
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Bundle not found
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            This bundle may have been deleted.
          </p>
          <Link
            to="/app/bundles"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium mt-4"
            style={{ background: 'var(--primary)', color: '#fff' }}
          >
            Back to Bundles
          </Link>
        </div>
      </s-section>
    </div>
  );
}
