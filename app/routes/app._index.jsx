import { useLoaderData } from 'react-router';
import { prisma } from '../db.server';
import { authenticate } from '../shopify.server';

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

    // Calculate analytics
    const activeBundles = bundles.filter((b) => b.status === 'active').length;
    const inactiveBundles = bundles.filter((b) => b.status === 'inactive').length;

    return {
      bundles,
      activeBundles,
      inactiveBundles,
    };
  } catch (error) {
    console.error('Error fetching bundles:', error);
    return {
      bundles: [],
      activeBundles: 0,
      inactiveBundles: 0,
      error: 'Failed to load bundles',
    };
  }
}

export default function AppIndex() {
  const { bundles, activeBundles, inactiveBundles, error } =
    useLoaderData();

  // Handle error state
  if (error) {
    return (
      <s-page heading="Bundles">
        <s-section>
          <s-banner tone="critical">
            <s-text>{error}</s-text>
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Bundles">
      {bundles.length === 0 ? (
        <s-section>
          <s-box
            padding="base"
            background="base"
            borderWidth="base"
            borderColor="base"
            borderRadius="base"
          >
            <s-stack direction="block" gap="base" alignment="center">
              <s-heading>Create Your First Bundle</s-heading>
              <s-text tone="subdued">
                Start boosting your Average Order Value with AI-powered product
                bundles.
              </s-text>
              <a href="/app/bundles/new">
                <s-button variant="primary">Create Bundle</s-button>
              </a>
            </s-stack>
          </s-box>
        </s-section>
      ) : (
        <>
          {/* Analytics Grid */}
          <s-section heading="Analytics Overview">
            <s-grid>
              <s-grid-item>
                <s-box
                  padding="base"
                  background="base"
                  borderWidth="base"
                  borderColor="base"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="small">
                    <s-text tone="subdued" size="small">
                      Total Bundles
                    </s-text>
                    <s-heading>{bundles.length}</s-heading>
                  </s-stack>
                </s-box>
              </s-grid-item>

              <s-grid-item>
                <s-box
                  padding="base"
                  background="base"
                  borderWidth="base"
                  borderColor="base"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="small">
                    <s-text tone="subdued" size="small">
                      Active Bundles
                    </s-text>
                    <s-text type="strong">
                      <s-text tone="success">{activeBundles}</s-text>
                    </s-text>
                  </s-stack>
                </s-box>
              </s-grid-item>

              <s-grid-item>
                <s-box
                  padding="base"
                  background="base"
                  borderWidth="base"
                  borderColor="base"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="small">
                    <s-text tone="subdued" size="small">
                      Inactive Bundles
                    </s-text>
                    <s-text type="strong">
                      <s-text tone="critical">{inactiveBundles}</s-text>
                    </s-text>
                  </s-stack>
                </s-box>
              </s-grid-item>
            </s-grid>
          </s-section>

          {/* Bundles Table */}
          <s-section heading="Your Bundles">
            <s-box
              background="base"
              borderWidth="base"
              borderColor="base"
              borderRadius="base"
            >
              <s-table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Discount Type</th>
                    <th>Discount Value</th>
                    <th>Status</th>
                    <th>Created Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bundles.map((bundle) => (
                    <tr key={bundle.id}>
                      <td>
                        <s-text type="strong">{bundle.title}</s-text>
                      </td>
                      <td>
                        <s-text>
                          {bundle.discountType.charAt(0).toUpperCase() +
                            bundle.discountType.slice(1)}
                        </s-text>
                      </td>
                      <td>
                        <s-text>
                          {bundle.discountType === 'percentage'
                            ? `${bundle.discountValue}%`
                            : `$${bundle.discountValue}`}
                        </s-text>
                      </td>
                      <td>
                        <s-badge
                          tone={
                            bundle.status === 'active' ? 'success' : 'attention'
                          }
                        >
                          {bundle.status.charAt(0).toUpperCase() +
                            bundle.status.slice(1)}
                        </s-badge>
                      </td>
                      <td>
                        <s-text tone="subdued">
                          {new Date(bundle.createdAt).toLocaleDateString()}
                        </s-text>
                      </td>
                      <td>
                        <a href={`/app/bundles/${bundle.id}`}>
                          <s-link>View</s-link>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </s-table>
            </s-box>
          </s-section>

          {/* Create Bundle Button */}
          <s-section>
            <a href="/app/bundles/new">
              <s-button variant="primary">Create New Bundle</s-button>
            </a>
          </s-section>
        </>
      )}
    </s-page>
  );
}
