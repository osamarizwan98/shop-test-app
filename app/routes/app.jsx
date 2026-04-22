import { Outlet, useLoaderData, useRouteError, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { Loading } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

/*
 * SUBMISSION CHECKLIST FOR SHOPIFY APP STORE
 * ==========================================
 * [ ] GDPR Webhooks: customers/data_request, customers/redact, shop/redact implemented and return 200 OK
 * [ ] App Bridge Navigation: All navigation uses s-link or embedded modals, no external pop-ups
 * [ ] Loading States: Loading bar shown during route changes using @shopify/app-bridge-react
 * [ ] Form Validation: Clear error messages, percentage discounts 1-99%
 * [ ] Bundle Size: Ensure extension bundles < Shopify limits (theme: 50MB, function: minimal)
 * [ ] Security: No blocked APIs, proper authentication, scopes requested
 * [ ] UX: Consistent SB_ class prefixes, Polaris components used
 * [ ] Testing: All tests pass, smoke tests run successfully
 * [ ] Documentation: README updated, changelog accurate
 */

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
  const navigation = useNavigation();

  if (navigation.state === "loading") {
    return <Loading />;
  }

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/style-settings">Style settings</s-link>
        <s-link href="/app/additional">Additional page</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
