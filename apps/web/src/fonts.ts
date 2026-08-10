/**
 * Self-hosted font preload (issue #281).
 *
 * The primary Arabic body font (IBM Plex Sans Arabic, arabic subset) renders the
 * first-paint text of this RTL app. Preload its woff2 so the first text paint does
 * not wait on the font-swap fetch. vite resolves the import to the same hashed
 * asset the CSS @font-face uses (same file -> same content hash -> same URL), so
 * the preloaded resource is exactly the one the browser fetches for rendering.
 */
import ibmPlexSansArabic400 from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2"

export function preloadFonts(): void {
  const link = document.createElement("link")
  link.rel = "preload"
  link.as = "font"
  link.type = "font/woff2"
  link.crossOrigin = "anonymous"
  link.href = ibmPlexSansArabic400
  document.head.appendChild(link)
}
