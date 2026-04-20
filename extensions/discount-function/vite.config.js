import { defineConfig } from "vite";

// Prevent inheritance from the app-level Vite config while still returning
// a valid config object for Shopify's function tooling to parse.
export default defineConfig({});
