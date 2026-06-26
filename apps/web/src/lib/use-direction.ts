/**
 * Hook that returns the current document direction ("rtl" | "ltr").
 * Reads from <html dir="..."> so it automatically responds to locale changes.
 */
export function useDirection(): "rtl" | "ltr" {
  if (typeof document === "undefined") return "rtl"
  return (document.documentElement.dir as "rtl" | "ltr") || "rtl"
}
