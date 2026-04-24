# SmartBundle AI — Project Context

## Template
Shopify App Template - React Router v7
https://github.com/Shopify/shopify-app-template-react-router

## UI Stack
- Polaris Web Components (already configured in template — no script tags needed)
- Tailwind CSS for custom layout/spacing/colors
- NO @shopify/polaris (deprecated)
- NO @shopify/app-bridge-react (deprecated)

## Polaris Web Components Usage
- Use s- prefix tags: <s-page>, <s-button>, <s-stack>, <s-section> etc
- Custom layout/grid/spacing → Tailwind className
- Full component list: https://shopify.dev/docs/api/app-home/polaris-web-components

## Key Files
- app/root.tsx         → root layout
- app/routes/app.tsx   → main layout with NavMenu
- app/shopify.server.ts → auth config
- prisma/schema.prisma → database schema
- docs/SmartBundle_AI_Complete_Spec.md → full feature spec

## Color System (CSS Variables)
--primary: #10B981
--primary-hover: #059669
--secondary: #3B82F6
--background: #F9FAFB
--card: #FFFFFF
--text-primary: #111827
--text-secondary: #6B7280
--border: #E5E7EB

## Custom CSS Classes — Naming Convention
- All custom CSS classes MUST use BS_ prefix
- Examples: BS_card, BS_hero-section, BS_bundle-grid
- Tailwind utility classes → no prefix needed (they are not custom)
- Polaris Web Components → no prefix needed (s- prefix already there)
- Never use generic names like .card, .button, .wrapper without BS_ prefix

## Rules for Code Agent
- Always use loader/action pattern — NO separate API files
- Always authenticate: const { admin, session } = await authenticate.admin(request)
- Navigation: Link from react-router — never <a> tags
- Mutations: useFetcher() — never fetch() directly
- Webhooks declared in shopify.app.toml — NOT in code
- Follow spec in docs/SmartBundle_AI_Complete_Spec.md for each feature