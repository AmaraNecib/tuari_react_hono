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

beforeAll(
  () => {
    // `vite build` resolves `@tuari/contracts` (workspace:* dependency) against
    // its built `dist/` entry. CI and the pre-push hook build it first, but a
    // fresh worktree has an empty dist — make the test self-sufficient instead
    // of order-dependent (no-op when the entry already exists).
    const contractsEntry = resolve(repoRoot, "packages/contracts/dist/index.js");
    if (!existsSync(contractsEntry)) {
      execSync("pnpm --filter @tuari/contracts build", { cwd: repoRoot, stdio: "inherit" });
    }
  },
  // A cold `@tuari/contracts` build takes ~12s; vitest's default hook timeout
  // is 10s and would kill the first run on a fresh worktree.
  120_000,
);

afterAll(() => {
  rmSync(buildOutDir, { recursive: true, force: true });
});

describe("web prod-HTML hygiene (#282)", () => {
  it("does not carry the impeccable dev-livereload block in index.html source", () => {
    const lower = indexHtmlSource.toLowerCase();
    for (const marker of devScriptMarkers) {
      expect(lower, `index.html must not contain ${marker}`).not.toContain(marker);
    }
    // Positive control: the real app entry survived (absence-only assertions
    // would pass vacuously on a truncated/emptied file).
    expect(indexHtmlSource).toContain('<script type="module" src="/src/main.tsx">');
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
      const lower = distIndexHtml.toLowerCase();
      for (const marker of devScriptMarkers) {
        expect(lower, `dist/index.html must not contain ${marker}`).not.toContain(marker);
      }
      // Positive control: the build actually emitted the app shell — the root
      // div and a hashed entry script — so the absence assertions cannot pass
      // on an empty or failed build.
      expect(distIndexHtml).toContain('<div id="root"></div>');
      expect(distIndexHtml).toMatch(/<script[^>]*type="module"[^>]*src="\/assets\/index-[^"]+\.js"/);

      // Issue #281: the primary Arabic body font must be preloaded as a
      // STATIC link in the served HTML (discoverable by the HTML preload
      // scanner before any JS runs), not injected at runtime from main.tsx.
      const preloadMatch = distIndexHtml.match(
        /<link rel="preload" as="font" type="font\/woff2" crossorigin="anonymous" href="(\/assets\/[^"]*ibm-plex-sans-arabic-arabic-400-normal[^"]*\.woff2)"/,
      );
      const preloadHref = preloadMatch?.[1];
      expect(preloadHref, "dist/index.html must preload the Arabic body font").toBeDefined();
      // The preloaded URL must be exactly the hashed file the built CSS
      // @font-face fetches — a stale/unrelated woff2 would defeat the preload.
      const cssHref = distIndexHtml.match(/href="(\/assets\/index-[^"]+\.css)"/)?.[1];
      expect(cssHref, "dist/index.html must reference a hashed CSS asset").toBeDefined();
      const distCss = readFileSync(join(buildOutDir, cssHref!.replace(/^\//, "")), "utf8");
      // The CSS @font-face references the file by bare filename; compare the
      // preloaded URL's basename so a re-hash anywhere breaks the pin.
      const preloadFile = preloadHref!.split("/").pop()!;
      expect(distCss).toContain(preloadFile);
    },
    120_000,
  );
});
