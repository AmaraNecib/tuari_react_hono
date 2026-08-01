import { describe, expect, it } from "vitest";

import { isLocalHostname, normalizeBaseUrl } from "./url";

describe("isLocalHostname", () => {
  it.each([
    "localhost",
    "127.0.0.1",
    "127.0.0.2", // loopback /8, not just .1
    "127.255.255.254",
    "127.0.0.0", // loopback /8 network address
    "127.0.0.255", // loopback /8 broadcast address
    "127.000.000.001", // leading-zero octets normalize to 0
    "0.0.0.0",
    "::1",
    "[::1]",
    "tauri.localhost",
  ])("accepts %s as local", (hostname) => {
    expect(isLocalHostname(hostname)).toBe(true);
  });

  it.each([
    "10.0.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "example.com",
    "127.999.1.1", // invalid octet (not URL-parseable either)
    "127.0.0.256", // octet above 255
    "127.1", // not a full IPv4
    "127.0.0.", // trailing dot
  ])("rejects %s as non-local", (hostname) => {
    expect(isLocalHostname(hostname)).toBe(false);
  });
});

describe("normalizeBaseUrl", () => {
  it("accepts http for any loopback /8 address", () => {
    expect(normalizeBaseUrl("http://127.0.0.2:4318")).toBe("http://127.0.0.2:4318");
  });

  it("canonicalizes shorthand IPv4 to a loopback hostname before the local check", () => {
    // new URL() canonicalizes 127.1 → 127.0.0.1, so it passes the loopback check.
    expect(normalizeBaseUrl("http://127.1:4318")).toBe("http://127.0.0.1:4318");
  });

  it("still requires https for non-local hosts", () => {
    expect(() => normalizeBaseUrl("http://api.example.com")).toThrow(
      "BETTER_AUTH_URL must use https for non-local hosts",
    );
  });

  it("still accepts https for non-local hosts", () => {
    expect(normalizeBaseUrl("https://api.example.com")).toBe("https://api.example.com");
  });

  it("normalizes uppercase schemes", () => {
    expect(normalizeBaseUrl("HTTPS://API.EXAMPLE.COM///")).toBe("https://api.example.com");
  });

  it("rejects empty and whitespace-only values", () => {
    expect(() => normalizeBaseUrl("")).toThrow("Invalid BETTER_AUTH_URL");
    expect(() => normalizeBaseUrl("   ")).toThrow("Invalid BETTER_AUTH_URL");
  });
});
