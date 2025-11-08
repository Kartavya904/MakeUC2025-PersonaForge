import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",                          // ✅ relative asset paths for file://
  plugins: [react()],
  root: path.resolve(__dirname, "renderer"),
  publicDir: path.resolve(__dirname, "renderer/public"),
  build: {
    outDir: path.resolve(__dirname, "renderer-dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
