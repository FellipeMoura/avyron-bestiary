import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "/",
  // O .env é compartilhado na raiz do monorepo (ver .env.example) — sem isso
  // o Vite só olharia apps/web/, onde não há nenhum.
  envDir: "../..",
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
