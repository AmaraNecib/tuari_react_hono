import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  dts: true,
  clean: true,
  platform: "node",
  target: "es2022",
  external: ["@prisma/client", "better-sqlite3"],
  noExternal: [/^(?!@prisma\/client$|better-sqlite3$).+/],
  esbuildOptions(options) {
    options.logOverride = { "ignored-bare-import": "silent" };
  },
});
