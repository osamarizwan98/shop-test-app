import { authenticate } from '../shopify.server';

const PRODUCTS_QUERY = `
  query SearchProducts($q: String!) {
    products(first: 10, query: $q) {
      nodes {
        id
        title
        featuredImage { url }
        variants(first: 1) {
          nodes { id price }
        }
      }
    }
  }
`;

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';

  if (!q.trim()) return Response.json({ products: [] });

  const response = await admin.graphql(PRODUCTS_QUERY, { variables: { q } });
  const { data } = await response.json();

  return Response.json({ products: data?.products?.nodes ?? [] });
}
