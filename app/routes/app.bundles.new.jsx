import { useState } from 'react';
import { useLoaderData, useActionData, useNavigation, Form } from 'react-router';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';
import { syncBundlesToShopify, checkProductCollisions } from '../utils/bundleSync.js';
import { registerSmartBundleDiscount } from '../services/discountService.server.js';

async function syncActiveBundlesMetafield({ admin, shop }) {
  return await syncBundlesToShopify(admin, shop);
}

/**
 * Loader: Authenticate session and fetch stagnant products for visual indicators
 */
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Error('Shop information not available');
  }

  try {
    // Fetch stagnant products for this shop (to show indicators later)
    const stagnantProducts = await prisma.inventoryAnalysis.findMany({
      where: {
        shop: session.shop,
        isStagnant: true,
      },
      select: {
        productId: true,
      },
    });

    const stagnantProductIds = stagnantProducts.map((p) => p.productId);

    return {
      shop: session.shop,
      stagnantProductIds,
    };
  } catch (error) {
    console.error('Error loading bundle creation page:', error);
    return {
      shop: session?.shop || '',
      stagnantProductIds: [],
      error: 'Failed to load data',
    };
  }
}

/**
 * Action: Handle form submission and save bundle to database
 */
export async function action({ request }) {
  if (request.method !== 'POST') {
    return { error: 'Invalid method' };
  }

  const { admin, session } = await authenticate.admin(request);

  if (!session?.shop) {
    return { error: 'Shop information not available', status: 401 };
  }

  try {
    const formData = await request.formData();
    const bundleTitle = formData.get('bundleTitle');
    const discountType = formData.get('discountType');
    const discountValue = parseFloat(formData.get('discountValue'));
    const productsJson = formData.get('selectedProducts');

    // Validate inputs
    if (!bundleTitle || bundleTitle.trim().length === 0) {
      return { error: 'Bundle title is required' };
    }

    if (!discountType || !['percentage', 'fixed_amount'].includes(discountType)) {
      return { error: 'Invalid discount type' };
    }

    if (isNaN(discountValue) || discountValue < 0) {
      return { error: 'Discount value must be a positive number' };
    }

    if (discountType === 'percentage' && discountValue > 100) {
      return { error: 'Percentage discount cannot exceed 100' };
    }

    let selectedProducts = [];
    try {
      selectedProducts = JSON.parse(productsJson || '[]');
    } catch {
      return { error: 'Invalid product data' };
    }

    if (!Array.isArray(selectedProducts) || selectedProducts.length < 2) {
      return { error: 'At least 2 products must be selected for a bundle' };
    }

    // Check for product collisions with existing active bundles
    const collisionCheck = await checkProductCollisions(session.shop, selectedProducts);
    if (collisionCheck.hasCollisions) {
      const collisionDetails = collisionCheck.collisions.map(c =>
        `"${c.bundleTitle}" (${c.overlapCount} overlapping products)`
      ).join(', ');

      return {
        error: `Cannot create bundle: ${selectedProducts.length === 2 ? 'These products are' : 'Some of these products are'} already part of active bundles: ${collisionDetails}. Please choose different products or deactivate conflicting bundles first.`,
        collisions: collisionCheck.collisions,
      };
    }

    // Save bundle to database
    const bundle = await prisma.bundle.create({
      data: {
        id: crypto.randomUUID(),
        shop: session.shop,
        title: bundleTitle.trim(),
        status: 'active',
        discountType,
        discountValue,
        productIds: selectedProducts,
      },
    });

    try {
      await syncActiveBundlesMetafield({
        admin,
        shop: session.shop,
      });
    } catch (syncError) {
      console.error('Active bundle metafield sync failed:', syncError);
      return {
        error: 'Bundle saved, but syncing active bundles to Shopify failed.',
        bundleId: bundle.id,
        syncFailed: true,
      };
    }

    // Register SmartBundle AI discount function if not already registered
    // Function ID must be obtained from shopify.app.toml
    const functionId = process.env.SHOPIFY_DISCOUNT_FUNCTION_ID;

    if (!functionId) {
      console.warn('SHOPIFY_DISCOUNT_FUNCTION_ID not set. Discount function not registered.');
    } else {
      try {
        const discountResult = await registerSmartBundleDiscount(admin, functionId);

        if (!discountResult.success && !discountResult.duplicate) {
          console.error('Discount registration failed:', discountResult.error);
          // Don't fail the bundle creation, just log the discount error
          console.warn('Bundle created successfully, but discount registration failed. Please register the discount manually from Shopify Admin.');
        } else if (discountResult.success) {
          console.log('SmartBundle AI discount registered:', discountResult.discountId);
        }
      } catch (discountError) {
        console.error('Error registering discount:', discountError);
        // Don't fail the bundle creation if discount registration has an unexpected error
      }
    }

    // Return success with redirect signal
    return {
      success: true,
      message: 'Bundle saved and synced to store successfully.',
      bundleId: bundle.id,
      redirectTo: '/app',
    };
  } catch (error) {
    console.error('Error creating bundle:', error);
    return { error: error.message || 'Failed to create bundle' };
  }
}

/**
 * Component: Bundle Creation Form
 */
export default function CreateBundle() {
  const { stagnantProductIds = [], error: loaderError } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();

  const [bundleTitle, setBundleTitle] = useState('');
  const [discountType, setDiscountType] = useState('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [errors, setErrors] = useState({});

  const isSubmitting = navigation.state === 'submitting';

  /**
   * Trigger Shopify Product Picker
   */
  const handleSelectProducts = async () => {
    try {
      const result = await window.shopify.resourcePicker({
        type: 'product',
        action: 'select',
        multiple: true,
      });

      if (result && result.selection && result.selection.length > 0) {
        const productData = result.selection.map((product) => ({
          id: product.id,
          title: product.title,
          handle: product.handle,
          image: product.images && product.images[0] ? product.images[0].originalSrc : null,
        }));
        setSelectedProducts(productData);
        setErrors((prev) => ({ ...prev, selectedProducts: '' }));
      }
    } catch (error) {
      console.error('Product picker error:', error);
      setErrors((prev) => ({
        ...prev,
        selectedProducts: 'Failed to open product picker. Please try again.',
      }));
    }
  };

  /**
   * Validate form before submission
   */
  const validateForm = () => {
    const newErrors = {};

    if (!bundleTitle.trim()) {
      newErrors.bundleTitle = 'Bundle title is required';
    }

    if (selectedProducts.length < 2) {
      newErrors.selectedProducts = 'At least 2 products must be selected for a bundle';
    }

    if (!discountValue || isNaN(parseFloat(discountValue)) || parseFloat(discountValue) < 0) {
      newErrors.discountValue = 'Discount value must be a positive number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle redirect after successful creation
  if (actionData?.success && actionData?.redirectTo) {
    window.shopify.toast.show(actionData.message || 'Bundle Activated Successfully');
    window.location.href = actionData.redirectTo;
  }

  return (
    <div className="SB_page">
        {/* Page Header */}
        <div className="SB_header">
          <h1 className="SB_headerTitle">Create New Bundle</h1>
          <a href="/app" className="SB_backButton">
            ← Back to Dashboard
          </a>
        </div>

        {/* Error Banner */}
        {(loaderError || actionData?.error) && (
          <div className="SB_banner error">
            <p className="SB_bannerText">{loaderError || actionData?.error}</p>
          </div>
        )}

        <Form method="post">
          {/* Bundle Configuration Card */}
          <div className="SB_card">
            <h2 className="SB_cardTitle">Bundle Details</h2>

            {/* Bundle Title */}
            <div className="SB_formGroup">
              <label htmlFor="bundleTitle" className="SB_label">
                Bundle Title <span style={{ color: '#d72c0d' }}>*</span>
              </label>
              <input
                id="bundleTitle"
                type="text"
                name="bundleTitle"
                placeholder="e.g., Summer Collection Bundle"
                value={bundleTitle}
                onChange={(e) => {
                  setBundleTitle(e.target.value);
                  setErrors((prev) => ({ ...prev, bundleTitle: '' }));
                }}
                className={`SB_input ${errors.bundleTitle ? 'error' : ''}`}
              />
              {errors.bundleTitle && (
                <p className="SB_error">{errors.bundleTitle}</p>
              )}
            </div>

            {/* Discount Configuration */}
            <div className="SB_formGroup">
              <label htmlFor="discountType" className="SB_label">
                Discount Configuration <span style={{ color: '#d72c0d' }}>*</span>
              </label>
              <div className="SB_discountRow">
                <select
                  id="discountType"
                  name="discountType"
                  value={discountType}
                  onChange={(e) => {
                    setDiscountType(e.target.value);
                    setErrors((prev) => ({ ...prev, discountType: '' }));
                  }}
                  className="SB_discountType"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed_amount">Fixed Amount ($)</option>
                </select>

                <div className="SB_discountValue">
                  <input
                    type="number"
                    name="discountValue"
                    placeholder="Enter discount value"
                    value={discountValue}
                    onChange={(e) => {
                      setDiscountValue(e.target.value);
                      setErrors((prev) => ({ ...prev, discountValue: '' }));
                    }}
                    step="0.01"
                    min="0"
                    className={`SB_input ${errors.discountValue ? 'error' : ''}`}
                  />
                  {errors.discountValue && (
                    <p className="SB_error">{errors.discountValue}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Product Selection Card */}
          <div className="SB_card">
            <h2 className="SB_cardTitle">Product Selection</h2>

            <div className="SB_productPicker">
              <button
                type="button"
                onClick={handleSelectProducts}
                className="SB_selectButton"
              >
                {selectedProducts.length === 0 ? '+ Select Products' : `Change Products (${selectedProducts.length})`}
              </button>

              {errors.selectedProducts && (
                <div className="SB_banner error" style={{ marginTop: '12px' }}>
                  <p className="SB_bannerText">{errors.selectedProducts}</p>
                </div>
              )}
            </div>

            {/* Selected Products List */}
            {selectedProducts.length > 0 && (
              <div className="SB_productList">
                <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--p-color-text)', margin: '0 0 12px 0' }}>
                  Selected Products ({selectedProducts.length})
                </h3>

                {selectedProducts.map((product) => (
                  <div key={product.id} className="SB_productItem">
                    {product.image && (
                      <img
                        src={product.image}
                        alt={product.title}
                        className="SB_productImage"
                      />
                    )}

                    <div className="SB_productInfo">
                      <h4 className="SB_productTitle">{product.title}</h4>
                      {stagnantProductIds.includes(product.id) && (
                        <span className="SB_stagnantBadge">
                          ⚠️ Stagnant Inventory
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedProducts(selectedProducts.filter(p => p.id !== product.id))}
                      className="SB_removeButton"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hidden input for selected products JSON */}
          <input type="hidden" name="selectedProducts" value={JSON.stringify(selectedProducts)} />

          {/* Action Buttons */}
          <div className="SB_actions">
            <a href="/app" className="SB_secondaryButton">
              Cancel
            </a>
            <button
              type="submit"
              disabled={isSubmitting}
              onClick={(e) => {
                if (isSubmitting) {
                  e.preventDefault();
                  return;
                }
                if (!validateForm()) {
                  e.preventDefault();
                }
              }}
              className="SB_primaryButton"
            >
              {isSubmitting ? 'Creating Bundle...' : 'Create Bundle'}
            </button>
          </div>
        </Form>
      </div>
  );
}
