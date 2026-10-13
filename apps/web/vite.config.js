import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vendorChunk, webObfuscation } from "./build/obfuscation.js";

export default defineConfig({
  root: "apps/web",
  plugins: [react(), webObfuscation()],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: { manualChunks: vendorChunk },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 8940,
    proxy: { "/api": "http://127.0.0.1:8942" },
  },
});
