import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin, IndexHtmlTransformContext } from "vite";
import { defineConfig } from "vite";

/**
 * Preload the primary Arabic body font woff2 into the BUILT index.html.
 *
 * Issue #281: preloading must be discoverable by the HTML preload scanner,
 * which only sees the raw HTML before any JS runs. Injecting the `<link>` at
 * runtime (main.tsx) defeats that — the font fetch would start only after the
 * entry bundle downloads and evaluates. This hook emits the same hashed asset
 * the CSS `@font-face` uses (same file -> same content hash -> same URL), so
 * the preloaded resource is exactly the one the browser fetches for rendering.
 */
function preloadArabicFont(): Plugin {
  return {
    name: "html-preload-arabic-font",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html: string, ctx: IndexHtmlTransformContext) {
        const bundle = ctx.bundle;
        if (!bundle) {
          return undefined;
        }
        const font = Object.values(bundle).find(
          (chunk): chunk is Extract<typeof chunk, { type: "asset" }> =>
            chunk.type === "asset" &&
            /ibm-plex-sans-arabic-arabic-400-normal.*\.woff2$/.test(chunk.fileName),
        );
        if (!font) {
          return undefined;
        }
        return [
          {
            tag: "link",
            attrs: {
              rel: "preload",
              as: "font",
              type: "font/woff2",
              crossorigin: "anonymous",
              href: `/${font.fileName}`,
            },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadArabicFont()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Home-view chunk is now split per-section (issue #286); keep the
    // warning ceiling above the remaining shared app chunks.
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        // Stable vendor chunks for long-term caching (issue #286). Vendor
        // filenames only change when the underlying dependency does.
        // Match on the node_modules package root so groups stay precise
        // (e.g. @base-ui/react / react-i18next are not swallowed by the
        // generic react match, which would create circular chunk imports).
        manualChunks(id: string) {
          const normalized = id.split("\\").join("/")
          const marker = "/node_modules/"
          const markerIndex = normalized.lastIndexOf(marker)
          if (markerIndex === -1) {
            return undefined
          }
          const packageRoot = normalized.slice(markerIndex + marker.length).split("/")[0] as string
          if (packageRoot === "react" || packageRoot === "react-dom" || packageRoot === "scheduler") {
            return "vendor-react"
          }
          if (packageRoot.startsWith("@tanstack")) {
            return "vendor-tanstack"
          }
          if (packageRoot === "i18next" || packageRoot === "react-i18next") {
            return "vendor-i18next"
          }
          if (packageRoot === "zod") {
            return "vendor-zod"
          }
          if (packageRoot === "fuse.js") {
            return "vendor-fuse"
          }
          if (packageRoot.startsWith("@orpc")) {
            return "vendor-orpc"
          }
          if (packageRoot === "better-auth") {
            return "vendor-auth"
          }
          // Stable UI libraries (headless primitives + icon set) — cached
          // long-term and kept out of the home-view app chunk.
          if (
            packageRoot.startsWith("@base-ui")
            || packageRoot.startsWith("@floating-ui")
            || packageRoot.startsWith("@radix-ui")
            || packageRoot === "lucide-react"
            || packageRoot === "cmdk"
            || packageRoot === "sonner"
            || packageRoot === "vaul"
            || packageRoot === "next-themes"
            || packageRoot === "react-day-picker"
            || packageRoot === "date-fns"
            || packageRoot === "input-otp"
          ) {
            return "vendor-ui"
          }
          return undefined
        },
      },
    },
  },
});
