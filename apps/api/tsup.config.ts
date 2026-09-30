import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  dts: true,
  clean: true,
  platform: "node",
  target: "es2022",
  external: ["@prisma/client", "better-sqlite3", "better-sqlite3-sqlcipher", "integer"],
  noExternal: [/^(?!@prisma\/client$|better-sqlite3$|better-sqlite3-sqlcipher$|integer$).+/],
  esbuildOptions(options) {
    options.logOverride = {
      "ignored-bare-import": "silent",
      // `backup.snapshot.ts` guards `import.meta.url` with `__filename` for the
      // CJS bundle (see resolveDriverModule); the empty-import-meta warning is
      // expected and harmless there.
      "empty-import-meta": "silent",
    };
  },
});
