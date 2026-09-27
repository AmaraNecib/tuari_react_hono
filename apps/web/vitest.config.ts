import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    // Same worker cap as the API config: see the note there. The default is
    // (cores - 1), which is more of the machine than a local test run needs.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 2),
    environment: "jsdom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
