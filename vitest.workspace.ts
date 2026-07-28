import { defineWorkspace } from "vitest/config"
import path from "path"

export default defineWorkspace([
  {
    test: {
      name: "api",
      root: "./apps/api",
      include: ["src/**/*.test.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "html"],
        thresholds: {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        include: [
          "src/modules/workforce/**/*.ts",
          "src/modules/invoice/**/*.ts",
        ],
        exclude: [
          "**/*.test.ts",
          "**/*.types.ts",
          "**/adapters/**/*.ts",
        ],
      },
    },
  },
  {
    test: {
      name: "web",
      root: "./apps/web",
      include: ["src/**/*.test.{ts,tsx}"],
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
        "@": path.resolve(__dirname, "apps/web/src"),
      },
    },
  },
  {
    test: {
      name: "contracts",
      root: "./packages/contracts",
      include: ["src/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "root",
      include: [],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/playwright-report/**",
      ],
    },
  },
])