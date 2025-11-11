// vite.config.js
// ============================================================
// InCheck Dashboard – Vite Configuration
// Optimized for modular lazy loading, small bundles, and fast deploys
// ============================================================

import { defineConfig } from "vite";

export default defineConfig({
  root: ".", // project root (where index.html is)
  base: "./", // relative paths for deployment on any server
  build: {
    outDir: "dist", // production output directory
    emptyOutDir: true, // clear dist before rebuild

    // Rollup optimization options
    rollupOptions: {
      output: {
        // Split large libraries into separate chunks
        manualChunks: {
          // Chart.js chunk (~40KB)
          chart: ["chart.js"],

          // FullCalendar modules (~60KB combined)
          calendar: [
            "@fullcalendar/core",
            "@fullcalendar/daygrid",
            "@fullcalendar/interaction",
          ],

          // Utilities (shared across views)
          utils: ["./js/utils.js"],
        },
        // File naming pattern for better caching
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },

    // Target ES2020 for modern browsers
    target: "es2020",

    // Minify using terser for smaller JS output
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true, // removes console.* calls
        drop_debugger: true,
      },
    },

    // Inline small assets (images/icons < 8 KB)
    assetsInlineLimit: 8192,
  },

  // Dev server config (for local development)
  server: {
    port: 5173,
    open: true,
    strictPort: true,
  },
});
