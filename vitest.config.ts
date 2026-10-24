import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["convex/**/*.test.ts", "web/src/**/*.test.{ts,tsx}"],
  },
});
