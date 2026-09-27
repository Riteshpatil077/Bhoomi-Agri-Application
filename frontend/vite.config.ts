/**
 * Bhoomi — Vite configuration
 * Proxy /api and /healthz, /readyz to the Flask backend in development.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/healthz": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/readyz": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
