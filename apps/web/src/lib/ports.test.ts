import { describe, it, expect } from "vitest"

import {
  apiBaseUrl,
  normalizePort,
  resolveWebServer,
  webBaseUrl,
} from "./ports"

describe("normalizePort", () => {
  it("keeps a canonical port", () => {
    expect(normalizePort("3000", "3000")).toBe("3000")
    expect(normalizePort("4318", "4318")).toBe("4318")
  })

  it("normalizes non-canonical but numerically valid ports", () => {
    expect(normalizePort("+3000", "3000")).toBe("3000")
    expect(normalizePort("1e3", "3000")).toBe("1000")
    expect(normalizePort(" 4318 ", "3000")).toBe("4318")
  })

  it("falls back on an invalid port", () => {
    expect(normalizePort("abc", "3000")).toBe("3000")
    expect(normalizePort("99999", "3000")).toBe("3000")
    expect(normalizePort("0", "3000")).toBe("3000")
    expect(normalizePort("-1", "3000")).toBe("3000")
    expect(normalizePort("", "3000")).toBe("3000")
    expect(normalizePort(undefined, "3000")).toBe("3000")
  })
})

describe("resolveWebServer", () => {
  it("uses the default loopback URL when PLAYWRIGHT_BASE_URL is unset", () => {
    const r = resolveWebServer({ WEB_PORT: undefined, PLAYWRIGHT_BASE_URL: undefined })
    expect(r.url).toBe("http://127.0.0.1:3000")
    expect(r.port).toBe("3000")
    expect(r.startOwn).toBe(true)
  })

  it("aligns the local server port to a loopback override so we never poll a different port than we start", () => {
    const r = resolveWebServer({ WEB_PORT: "3000", PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3002" })
    expect(r.url).toBe("http://127.0.0.1:3002")
    expect(r.port).toBe("3002")
    expect(r.startOwn).toBe(true)
  })

  it("does not start a local web server for a non-loopback override — it waits for the external host", () => {
    const r = resolveWebServer({ WEB_PORT: "3000", PLAYWRIGHT_BASE_URL: "http://example.com:8080" })
    expect(r.url).toBe("http://example.com:8080")
    expect(r.startOwn).toBe(false)
  })

  it("surfaces an IPv6 loopback override at the bound IPv4 address instead of polling ::1", () => {
    // Vite binds 127.0.0.1 only; polling http://[::1]:3002 would timeout.
    const r = resolveWebServer({ WEB_PORT: "3000", PLAYWRIGHT_BASE_URL: "http://[::1]:3002" })
    expect(r.url).toBe("http://127.0.0.1:3002")
    expect(r.port).toBe("3002")
    expect(r.startOwn).toBe(true)
  })

  it("normalizes a localhost http override to the bound IPv4 address (Origin == listener)", () => {
    const r = resolveWebServer({ WEB_PORT: "3000", PLAYWRIGHT_BASE_URL: "http://localhost:3002" })
    expect(r.url).toBe("http://127.0.0.1:3002")
    expect(r.port).toBe("3002")
    expect(r.startOwn).toBe(true)
  })

  it("preserves an HTTPS loopback override and does NOT self-manage an HTTP downgrade", () => {
    // Our dev server is HTTP-only; an explicit https endpoint must be honored
    // as an externally managed server, never silently downgraded to http.
    const r = resolveWebServer({ WEB_PORT: "3000", PLAYWRIGHT_BASE_URL: "https://localhost:3002" })
    expect(r.url).toBe("https://localhost:3002")
    expect(r.startOwn).toBe(false)
  })

  it("falls back to the default URL for a loopback override without a port", () => {
    const r = resolveWebServer({ WEB_PORT: "3000", PLAYWRIGHT_BASE_URL: "http://127.0.0.1" })
    expect(r.url).toBe("http://127.0.0.1:3000")
    expect(r.port).toBe("3000")
    expect(r.startOwn).toBe(true)
  })

  it("falls back to defaults for an invalid base url", () => {
    const r = resolveWebServer({ WEB_PORT: "3001", PLAYWRIGHT_BASE_URL: "not a url" })
    expect(r.url).toBe("http://127.0.0.1:3001")
    expect(r.port).toBe("3001")
    expect(r.startOwn).toBe(true)
  })
})

describe("apiBaseUrl", () => {
  it("derives the loopback API URL from API_PORT", () => {
    expect(apiBaseUrl({ API_PORT: "14318" })).toBe("http://127.0.0.1:14318")
  })

  it("defaults to 4318 and normalizes raw values", () => {
    expect(apiBaseUrl({ API_PORT: undefined })).toBe("http://127.0.0.1:4318")
    expect(apiBaseUrl({ API_PORT: "1e3" })).toBe("http://127.0.0.1:1000")
  })
})

describe("webBaseUrl", () => {
  it("lets PLAYWRIGHT_BASE_URL win", () => {
    expect(
      webBaseUrl({ WEB_PORT: "3001", PLAYWRIGHT_BASE_URL: "http://127.0.0.1:4000" }),
    ).toBe("http://127.0.0.1:4000")
  })

  it("mirrors resolveWebServer for a localhost override (Origin == baseURL == allowlist[0])", () => {
    expect(
      webBaseUrl({ WEB_PORT: "3001", PLAYWRIGHT_BASE_URL: "http://localhost:4000" }),
    ).toBe("http://127.0.0.1:4000")
    expect(webBaseUrl({ WEB_PORT: "3001", PLAYWRIGHT_BASE_URL: "https://localhost:4000" })).toBe(
      "https://localhost:4000",
    )
  })

  it("derives from WEB_PORT and normalizes raw values otherwise", () => {
    expect(webBaseUrl({ WEB_PORT: "+3001", PLAYWRIGHT_BASE_URL: undefined })).toBe(
      "http://127.0.0.1:3001",
    )
    expect(webBaseUrl({ WEB_PORT: undefined, PLAYWRIGHT_BASE_URL: undefined })).toBe(
      "http://127.0.0.1:3000",
    )
  })
})
