// @vitest-environment node
//
// Runs a real `vite build`, which depends on esbuild; esbuild's
// `TextEncoder instanceof Uint8Array` invariant is false under the jsdom
// environment, so this file must stay on the node environment.

import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";

/**
 * Prod-HTML hygiene regression tests for issue #282.
 *
 * The issue's core complaint: the impeccable dev-livereload block in
 * `apps/web/index.html` was copied verbatim into `dist/index.html`, so every
 * production page requested `http://localhost:8400/live.js`.
 *
 * The first test pins the source (index.html must never carry the markers —
 * this is where the impeccable tool re-injects them). The second runs a real
 * `vite build` and asserts the produced `dist/index.html` — the exact artifact
 * the issue complained about — stays clean, so a re-injected marker can never
 * silently leak into the production build again.
 */

const webRoot = resolve(__dirname, "../..");
const repoRoot = resolve(webRoot, "../..");
const indexHtmlSource = readFileSync(resolve(webRoot, "index.html"), "utf8");

const devScriptMarkers = ["impeccable-live", "localhost:8400", "live.js"] as const;

/** Temp build output, cleaned up after the suite. */
const buildOutDir = mkdtempSync(join(tmpdir(), "tuari-web-hygiene-build-"));

beforeAll(() => {
  // `vite build` resolves `@tuari/contracts` (workspace:* dependency) against
  // its built `dist/` entry. CI and the pre-push hook build it first, but a
  // fresh worktree has an empty dist — make the test self-sufficient instead
  // of order-dependent (no-op when the entry already exists).
  const contractsEntry = resolve(repoRoot, "packages/contracts/dist/index.js");
  if (!existsSync(contractsEntry)) {
    execSync("pnpm --filter @tuari/contracts build", { cwd: repoRoot, stdio: "inherit" });
  }
});

afterAll(() => {
  rmSync(buildOutDir, { recursive: true, force: true });
});

describe("web prod-HTML hygiene (#282)", () => {
  it("does not carry the impeccable dev-livereload block in index.html source", () => {
    for (const marker of devScriptMarkers) {
      expect(indexHtmlSource, `index.html must not contain ${marker}`).not.toContain(
        marker,
      );
    }
  });

  it(
    "produces a dist/index.html free of dev-livereload markers",
    async () => {
      await build({
        root: webRoot,
        build: {
          outDir: buildOutDir,
        },
        logLevel: "silent",
      });

      const distIndexHtml = readFileSync(join(buildOutDir, "index.html"), "utf8");
      for (const marker of devScriptMarkers) {
        expect(distIndexHtml, `dist/index.html must not contain ${marker}`).not.toContain(
          marker,
        );
      }
    },
    120_000,
  );
});
