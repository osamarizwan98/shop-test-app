import { useLoaderData, Link, useFetcher } from 'react-router';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';
import { registerShopifyDiscount, deleteShopifyDiscount } from '../utils/discounts.server';
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
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');

  if (intent === 'register-discount') {
    const bundle = await prisma.bundle.findFirst({
      where: { id: params.id, shop: session.shop },
    });
    if (!bundle) return { error: 'Bundle not found' };
    try {
      const discountId = await registerShopifyDiscount(admin, bundle);
      await prisma.bundle.update({
        where: { id: params.id },
        data: { shopifyDiscountId: discountId, status: 'active' },
      });
      return { success: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to register discount' };
    }
  }

  if (intent === 'deactivate') {
    const bundle = await prisma.bundle.findFirst({
      where: { id: params.id, shop: session.shop },
    });
    if (!bundle) return { error: 'Bundle not found' };
    if (bundle.shopifyDiscountId) {
      try {
        await deleteShopifyDiscount(admin, bundle.shopifyDiscountId);
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Failed to delete Shopify discount' };
      }
    }
    await prisma.bundle.update({
      where: { id: params.id },
      data: { shopifyDiscountId: null, status: 'inactive' },
    });
    return { success: true };
  }

  if (intent === 'update') {
    const id = String(formData.get('id') ?? params.id ?? '');
    const title = String(formData.get('title') ?? '').trim();
    const discountType = String(formData.get('discountType') ?? '');
    const rawDiscountValue = parseFloat(String(formData.get('discountValue') ?? '0'));
    const discountValue = discountType === 'bogo' ? 0 : rawDiscountValue;
    const status = String(formData.get('status') ?? 'active');

    let productIds = [];
    try {
      productIds = JSON.parse(String(formData.get('productIds') ?? '[]'));
    } catch {
      return { error: 'Invalid product data' };
    }

    if (!title) return { error: 'Bundle name is required' };
    if (!['percentage', 'fixed_amount', 'bogo'].includes(discountType))
      return { error: 'Invalid discount type' };
    if (discountType !== 'bogo' && (isNaN(discountValue) || discountValue < 0))
      return { error: 'Invalid discount value' };

    const existing = await prisma.bundle.findFirst({
      where: { id, shop: session.shop },
      select: { id: true },
    });
    if (!existing) return { error: 'Bundle not found' };

    await prisma.bundle.update({
      where: { id },
      data: { title, discountType, discountValue, status, productIds },
    });

    return { success: true };
  }

  return { error: 'Invalid intent' };
}

export default function EditBundle() {
  const { bundle } = useLoaderData();
  const discountFetcher = useFetcher();

  // Optimistic status: flip immediately on submit, before server round-trip
  const pendingIntent = discountFetcher.formData?.get('intent');
  const optimisticStatus =
    pendingIntent === 'register-discount' ? 'active'
    : pendingIntent === 'deactivate' ? 'inactive'
    : bundle.status;

  const isActive = optimisticStatus === 'active';
  const isSubmitting = discountFetcher.state !== 'idle';
  const actionError = discountFetcher.data?.error;

  return (
    <div className="p-6" style={{ background: 'var(--background)', minHeight: '100vh' }}>

      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/app/bundles" className="text-sm" style={{ color: 'var(--secondary)' }}>
          ← Bundles
        </Link>
        <span style={{ color: 'var(--border)' }}>/</span>
        <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Edit Bundle
        </p>
      </div>

      {/* Activate / Deactivate card */}
      <div
        className="mb-5 rounded-lg p-4"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{
                background: isActive ? '#D1FAE5' : '#F3F4F6',
                color: isActive ? '#065F46' : 'var(--text-secondary)',
              }}
            >
              {isActive ? 'Active' : 'Inactive'}
            </span>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {isActive
                ? 'Discount is live and applying at checkout.'
                : 'Discount is off. Activate to apply it at checkout.'}
            </p>
          </div>

          <discountFetcher.Form method="post">
            <input
              type="hidden"
              name="intent"
              value={isActive ? 'deactivate' : 'register-discount'}
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              style={
                isActive
                  ? { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' }
                  : { background: 'var(--primary)', color: '#fff', border: 'none' }
              }
            >
              {isSubmitting
                ? isActive ? 'Deactivating…' : 'Activating…'
                : isActive ? 'Deactivate' : 'Activate'}
            </button>
          </discountFetcher.Form>
        </div>

        {actionError && (
          <p className="text-sm mt-3" style={{ color: '#DC2626' }}>
            {actionError}
          </p>
        )}
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
