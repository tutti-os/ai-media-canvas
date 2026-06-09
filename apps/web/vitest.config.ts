import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    testTimeout: 10000,
    environmentOptions: {
      jsdom: {
        url: "http://localhost:3000",
      },
    },
  },
});
