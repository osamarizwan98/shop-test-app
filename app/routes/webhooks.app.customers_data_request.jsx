import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}: GDPR data request acknowledged`);

  // Log the request for audit purposes
  console.log(`GDPR Data Request - Shop: ${shop}, Topic: ${topic}, Timestamp: ${new Date().toISOString()}`);

  return new Response(null, { status: 200 });
};