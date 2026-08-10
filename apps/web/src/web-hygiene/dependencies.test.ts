import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Dependency-hygiene regression tests for issue #282.
 *
 * Pins the post-fix state so a future PR cannot silently re-add a dead
 * dependency, move the shadcn CLI back into `dependencies`, reintroduce a
 * namespace ("barrel") import from a Radix package, reference a removed
 * package in the Vite manualChunks config, or leave a stale lockfile entry.
 */

const webRoot = resolve(__dirname, "../..");
const repoRoot = resolve(webRoot, "../..");

const packageJson = JSON.parse(
  readFileSync(resolve(webRoot, "package.json"), "utf8"),
) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

const lockfile = readFileSync(resolve(repoRoot, "pnpm-lock.yaml"), "utf8");
const viteConfigSource = readFileSync(resolve(webRoot, "vite.config.ts"), "utf8");
const alertDialogSource = readFileSync(
  resolve(webRoot, "src/components/ui/alert-dialog.tsx"),
  "utf8",
);

/** The six dependencies removed in #282 — must stay gone. */
const REMOVED_DEPS = [
  "recharts",
  "cmdk",
  "embla-carousel-react",
  "vaul",
  "next-themes",
  "@tanstack/react-router-devtools",
] as const;

/** Packages that had dead `manualChunks` entries in vite.config.ts (#282). */
const REMOVED_CHUNK_DEPS = ["cmdk", "vaul", "next-themes"] as const;

describe("web dependency hygiene (#282)", () => {
  it("does not declare any of the six removed dead dependencies", () => {
    const allDeclared = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    for (const dep of REMOVED_DEPS) {
      expect(allDeclared[dep], `${dep} must not be declared`).toBeUndefined();
    }
    // Positive control: the dependency object is not accidentally emptied,
    // which would make every absence assertion pass vacuously.
    expect(packageJson.dependencies["@radix-ui/react-alert-dialog"]).toBe("^1.1.15");
  });

  it("keeps the shadcn CLI in devDependencies, not dependencies", () => {
    expect(packageJson.dependencies["shadcn"]).toBeUndefined();
    // Property under test is *where* the CLI lives, not its exact version —
    // a legitimate future shadcn upgrade must not trip a hygiene test.
    expect(packageJson.devDependencies["shadcn"]).toMatch(/^\^4\.\d+\.\d+$/);
  });

  it("drops the removed packages from pnpm-lock.yaml", () => {
    for (const dep of REMOVED_DEPS) {
      const escaped = dep.replace("/", "\\/");
      expect(
        lockfile,
        `${dep} must not appear in pnpm-lock.yaml`,
      ).not.toMatch(new RegExp(`(^|\\s)${escaped}@`, "m"));
    }
  });

  it("does not mention any removed package in the vite manualChunks config", () => {
    for (const dep of REMOVED_CHUNK_DEPS) {
      expect(
        viteConfigSource,
        `vite.config.ts must not group removed package ${dep}`,
      ).not.toContain(dep);
    }
  });

  it("uses named (tree-shakeable) imports from @radix-ui/react-alert-dialog", () => {
    expect(alertDialogSource).not.toMatch(
      /import \* as AlertDialogPrimitive from "@radix-ui\/react-alert-dialog"/,
    );
    expect(alertDialogSource).toMatch(
      /import \{[\s\S]*\} from "@radix-ui\/react-alert-dialog"/,
    );
  });
});
