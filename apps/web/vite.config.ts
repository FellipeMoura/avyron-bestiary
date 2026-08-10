import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "/",
  server: {
    port: 5100,
    proxy: {
      "/api": "http://localhost:5101",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false, // production ships a minified bundle only
  },
});
