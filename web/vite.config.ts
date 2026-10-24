import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: "..", // root .env.local is written by `convex dev`
  envPrefix: ["VITE_", "CONVEX_URL"], // expose CONVEX_URL as-is, no VITE_ copy needed
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
});
