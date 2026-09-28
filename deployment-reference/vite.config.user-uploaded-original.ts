import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // We already have our own Express production server (server.cjs),
  // so we do not need Nitro to provide the production Node server.
  nitro: false,

  tanstackStart: {
    server: {
      entry: "server",
    },

    // Generate an SPA HTML shell so Express can serve the frontend.
    spa: {
      enabled: true,
      prerender: {
        outputPath: "/index.html",
        crawlLinks: false,
        retryCount: 0,
      },
    },
  },

  vite: {
    // Lovable MCP route generation has a Windows path separator bug
    // in the project's installed version. Generated MCP routes
    // already exist in src/routes, so do not rerun that plugin locally.
    plugins: [],
  },
});