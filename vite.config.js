import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this site from /<repo-name>/ — the workflow sets
  // VITE_BASE_PATH automatically. Locally (npm run dev) it just falls back to "/".
  base: process.env.VITE_BASE_PATH || "/",
  build: {
    outDir: "dist",
  },
});
