import { useState } from 'react';
import { useLoaderData, useActionData, useNavigation, Form } from 'react-router';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';
import { syncBundlesToShopify, checkProductCollisions } from '../utils/bundleSync.js';
import { validateBundleSubmission } from '../utils/bundleValidation.server.js';
import {
  getSmartBundleDiscountFunctionId,
  MISSING_DISCOUNT_FUNCTION_ID_ERROR,
  WRITE_DISCOUNTS_SCOPE_ERROR,
} from '../constants/discounts.server.js';

async function syncActiveBundlesMetafield({ admin, shop }) {
  return await syncBundlesToShopify(admin, shop);
}

const SMART_BUNDLE_AUTO_DISCOUNT_TITLE = 'SmartBundle AI Auto-Discount';
const FALLBACK_FUNCTION_ID_PLACEHOLDER = '[PASTE_YOUR_UUID_HERE]';

const QUERY_EXISTING_AUTO_DISCOUNT = `#graphql
  query SmartBundleDiscountCheck($query: String!) {
    automaticDiscountNodes(first: 25, query: $query) {
      edges {
        node {
          id
          discount {
            ... on DiscountAutomaticApp {
              title
              status
              appDiscountType {
                functionId
              }
            }
          }
        }
      }
    }
  }
`;

const CREATE_AUTO_DISCOUNT_MUTATION = `#graphql
  mutation SmartBundleDiscountCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
      userErrors {
        field
        message
      }
      automaticAppDiscount {
        id
        discountId
        title
        status
      }
    }
  }
`;

function formatGraphQLErrors(errors = []) {
  return errors
    .map((error) => error?.message)
    .filter(Boolean)
    .join(', ');
}

function formatUserErrors(userErrors = []) {
  return userErrors
    .map(({ field, message }) => {
      const fieldPath = Array.isArray(field) ? field.join('.') : field;
      return fieldPath ? `${fieldPath}: ${message}` : message;
    })
    .filter(Boolean)
    .join(', ');
}

function isWriteDiscountsError(message = '') {
  const normalized = message.toLowerCase();
  return normalized.includes('write_discounts') || normalized.includes('access denied');
}

async function ensureDiscountActive(admin) {
  const functionId = getSmartBundleDiscountFunctionId() || FALLBACK_FUNCTION_ID_PLACEHOLDER;

  if (!functionId || functionId === FALLBACK_FUNCTION_ID_PLACEHOLDER) {
    return {
      success: false,
      duplicate: false,
      error: MISSING_DISCOUNT_FUNCTION_ID_ERROR,
      code: 'MISSING_DISCOUNT_FUNCTION_ID',
    };
  }

  try {
    const existingResponse = await admin.graphql(QUERY_EXISTING_AUTO_DISCOUNT, {
      variables: {
        query: `title:'${SMART_BUNDLE_AUTO_DISCOUNT_TITLE}'`,
      },
    });
    const existingData = await existingResponse.json();

    if (existingData.errors?.length) {
      const queryError = formatGraphQLErrors(existingData.errors);
      if (isWriteDiscountsError(queryError)) {
        return {
          success: false,
          duplicate: false,
          error: WRITE_DISCOUNTS_SCOPE_ERROR,
          code: 'MISSING_WRITE_DISCOUNTS_SCOPE',
        };
      }

      return {
        success: false,
        duplicate: false,
        error: queryError,
        code: 'DISCOUNT_CHECK_FAILED',
      };
    }

    const existingActiveDiscount = (existingData?.data?.automaticDiscountNodes?.edges || [])
      .map(({ node }) => ({
        id: node?.id,
        ...(node?.discount || {}),
      }))
      .find((discount) => (
        discount?.title === SMART_BUNDLE_AUTO_DISCOUNT_TITLE &&
        discount?.status === 'ACTIVE' &&
        discount?.appDiscountType?.functionId === functionId
      ));

    if (existingActiveDiscount) {
      return {
        success: true,
        duplicate: true,
        discountId: existingActiveDiscount.id,
      };
    }

    const createResponse = await admin.graphql(CREATE_AUTO_DISCOUNT_MUTATION, {
      variables: {
        automaticAppDiscount: {
          title: SMART_BUNDLE_AUTO_DISCOUNT_TITLE,
          functionId,
          startsAt: new Date().toISOString(),
        },
      },
    });
    const createData = await createResponse.json();

    if (createData.errors?.length) {
      const mutationError = formatGraphQLErrors(createData.errors);
      if (isWriteDiscountsError(mutationError)) {
        return {
          success: false,
          duplicate: false,
          error: WRITE_DISCOUNTS_SCOPE_ERROR,
          code: 'MISSING_WRITE_DISCOUNTS_SCOPE',
        };
      }

      return {
        success: false,
        duplicate: false,
        error: mutationError,
        code: 'DISCOUNT_CREATE_FAILED',
      };
    }

    const { userErrors = [], automaticAppDiscount } =
      createData?.data?.discountAutomaticAppCreate || {};

    if (userErrors.length > 0) {
      console.error('discountAutomaticAppCreate userErrors:', userErrors);
      const detailedUserErrors = formatUserErrors(userErrors);

      if (isWriteDiscountsError(detailedUserErrors)) {
        return {
          success: false,
          duplicate: false,
          error: WRITE_DISCOUNTS_SCOPE_ERROR,
          code: 'MISSING_WRITE_DISCOUNTS_SCOPE',
          userErrors,
        };
      }

      return {
        success: false,
        duplicate: false,
        error: detailedUserErrors,
        code: 'DISCOUNT_CREATE_USER_ERRORS',
        userErrors,
      };
    }

    if (!automaticAppDiscount?.id) {
      return {
        success: false,
        duplicate: false,
        error: 'Discount was created but no discount ID was returned.',
        code: 'DISCOUNT_ID_MISSING',
      };
    }

    return {
      success: true,
      duplicate: false,
      discountId: automaticAppDiscount.discountId || automaticAppDiscount.id,
    };
  } catch (error) {
    return {
      success: false,
      duplicate: false,
      error: `Failed to ensure discount activation: ${error.message}`,
      code: 'DISCOUNT_ACTIVATION_EXCEPTION',
    };
  }
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
    const validation = validateBundleSubmission({
      bundleTitle: formData.get('bundleTitle'),
      discountType: formData.get('discountType'),
      discountValueRaw: formData.get('discountValue'),
      productsJson: formData.get('selectedProducts'),
    });

    if (!validation.success) {
      return { error: validation.error };
    }

    const { bundleTitle, discountType, discountValue, selectedProducts } = validation.data;

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

    try {
      const discountResult = await ensureDiscountActive(admin);

      if (!discountResult.success) {
        console.error('Automatic discount activation failed:', {
          code: discountResult.code,
          error: discountResult.error,
          userErrors: discountResult.userErrors || [],
        });

        return {
          success: false,
          error: discountResult.error,
          code: discountResult.code || 'DISCOUNT_ACTIVATION_FAILED',
          bundleSaved: true,
          bundleId: bundle.id,
          discountRegistrationFailed: true,
          writeDiscountsScopeRequired: discountResult.code === 'MISSING_WRITE_DISCOUNTS_SCOPE',
        };
      }

      if (!discountResult.duplicate) {
        console.log('SmartBundle auto-discount registered:', discountResult.discountId);
      }
    } catch (discountError) {
      console.error('Automatic discount activation exception:', discountError);
      return {
        success: false,
        error: `Bundle saved, but automatic discount activation failed: ${discountError.message}`,
        code: 'DISCOUNT_ACTIVATION_EXCEPTION',
        bundleSaved: true,
        bundleId: bundle.id,
        discountRegistrationFailed: true,
      };
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
          variantId:
            typeof product?.variants?.[0]?.id === 'string'
              ? product.variants[0].id
              : '',
          price:
            typeof product?.variants?.[0]?.price === 'string' ||
            typeof product?.variants?.[0]?.price === 'number'
              ? product.variants[0].price
              : '',
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
    } else if (discountType === 'percentage' && (parseFloat(discountValue) < 1 || parseFloat(discountValue) > 99)) {
      newErrors.discountValue = 'Discount percentage must be between 1 and 99';
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
    <div className="SB_admin_container SB_page">
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
            <h2 className="SB_cardTitle Polaris-Text--headingLg">Bundle Details</h2>

            {/* Bundle Title */}
            <div className="SB_formGroup">
              <label htmlFor="bundleTitle" className="SB_label">
                Bundle Title <span className="SB_requiredMark">*</span>
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
                Discount Configuration <span className="SB_requiredMark">*</span>
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
            <h2 className="SB_cardTitle Polaris-Text--headingLg">Product Selection</h2>

            <div className="SB_productPicker">
              <button
                type="button"
                onClick={handleSelectProducts}
                className="SB_selectButton"
              >
                {selectedProducts.length === 0 ? '+ Select Products' : `Change Products (${selectedProducts.length})`}
              </button>

              {errors.selectedProducts && (
                <div className="SB_banner error SB_bannerInline">
                  <p className="SB_bannerText">{errors.selectedProducts}</p>
                </div>
              )}
            </div>

            {/* Selected Products List */}
            {selectedProducts.length > 0 && (
              <div className="SB_productList">
                <h3 className="SB_productListTitle">
                  Selected Products ({selectedProducts.length})
                </h3>

                {selectedProducts.map((product) => (
                  <div key={product.id} className="SB_productItem SB_product_row">
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
