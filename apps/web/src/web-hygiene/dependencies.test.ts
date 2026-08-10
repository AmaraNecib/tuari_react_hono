import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Dependency-hygiene regression tests for issue #282.
 *
 * Pins the post-fix state so a future PR cannot silently re-add a dead
 * dependency, move the shadcn CLI back into `dependencies`, reintroduce a
 * namespace ("barrel") import from a Radix package, or reference a removed
 * package in the Vite manualChunks config.
 */

const webRoot = resolve(__dirname, "../..");

const packageJson = JSON.parse(
  readFileSync(resolve(webRoot, "package.json"), "utf8"),
) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

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

describe("web dependency hygiene (#282)", () => {
  it("does not declare any of the six removed dead dependencies", () => {
    const allDeclared = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    for (const dep of REMOVED_DEPS) {
      expect(allDeclared[dep], `${dep} must not be declared`).toBeUndefined();
    }
  });

  it("keeps the shadcn CLI in devDependencies, not dependencies", () => {
    expect(packageJson.dependencies["shadcn"]).toBeUndefined();
    expect(packageJson.devDependencies["shadcn"]).toBe("^4.0.5");
  });

  it("does not reference any removed package in the vite manualChunks config", () => {
    for (const dep of ["cmdk", "vaul", "next-themes"]) {
      expect(
        viteConfigSource.includes(`packageRoot === "${dep}"`),
        `vite.config.ts must not group removed package ${dep}`,
      ).toBe(false);
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
