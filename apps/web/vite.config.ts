import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
            || packageRoot === "sonner"
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
