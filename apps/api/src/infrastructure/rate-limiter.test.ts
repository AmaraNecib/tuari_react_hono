import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SlidingWindowRateLimiter, resolveClientIp } from "./rate-limiter";

describe("SlidingWindowRateLimiter", () => {
  let limiter: SlidingWindowRateLimiter;

  beforeEach(() => {
    limiter = new SlidingWindowRateLimiter(5, 100); // 5 requests per 100ms
  });

  afterEach(() => {
    limiter.stopCleanup();
  });

  describe("allow", () => {
    it("allows requests within limit", () => {
      const key = "user:1";

      for (let i = 0; i < 5; i++) {
        expect(limiter.allow(key)).toBe(true);
      }
    });

    it("rejects requests exceeding limit", () => {
      const key = "user:1";

      for (let i = 0; i < 5; i++) {
        limiter.allow(key);
      }

      expect(limiter.allow(key)).toBe(false);
    });

    it("resets limit after window expires", async () => {
      const key = "user:1";

      // Use up the limit
      for (let i = 0; i < 5; i++) {
        limiter.allow(key);
      }

      expect(limiter.allow(key)).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 110));

      // Should allow new requests
      expect(limiter.allow(key)).toBe(true);
    });

    it("tracks separate keys independently", () => {
      const key1 = "user:1";
      const key2 = "user:2";

      for (let i = 0; i < 5; i++) {
        limiter.allow(key1);
      }

      // Key1 should be exhausted
      expect(limiter.allow(key1)).toBe(false);

      // Key2 should still have allowance
      expect(limiter.allow(key2)).toBe(true);
    });
  });

  describe("cleanup", () => {
    it("removes expired entries", async () => {
      const key = "user:1";

      limiter.startCleanup();

      // Create an entry
      limiter.allow(key);

      // Wait for it to expire and cleanup to run
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Allow should work on the same key (entry was cleaned up)
      expect(limiter.allow(key)).toBe(true);
    });
  });
});

describe("resolveClientIp", () => {
  it("uses x-forwarded-for when trustProxyHeaders is true", () => {
    const ip = resolveClientIp({
      forwardedFor: "192.168.1.1, 10.0.0.1",
      trustProxyHeaders: true,
    });

    expect(ip).toBe("192.168.1.1");
  });

  it("extracts first IP from x-forwarded-for list", () => {
    const ip = resolveClientIp({
      forwardedFor: "192.168.1.1, 10.0.0.1, 172.16.0.1",
      trustProxyHeaders: true,
    });

    expect(ip).toBe("192.168.1.1");
  });

  it("uses x-real-ip as fallback when trustProxyHeaders is true", () => {
    const ip = resolveClientIp({
      realIp: "203.0.113.1",
      trustProxyHeaders: true,
    });

    expect(ip).toBe("203.0.113.1");
  });

  it("uses remoteAddress when trustProxyHeaders is false", () => {
    const ip = resolveClientIp({
      forwardedFor: "192.168.1.1",
      realIp: "203.0.113.1",
      remoteAddress: "192.0.2.1",
      trustProxyHeaders: false,
    });

    expect(ip).toBe("192.0.2.1");
  });

  it("defaults to 'unknown' when no IP available", () => {
    const ip = resolveClientIp({});

    expect(ip).toBe("unknown");
  });

  it("trims whitespace from real-ip", () => {
    const ip = resolveClientIp({
      realIp: "  203.0.113.1  ",
      trustProxyHeaders: true,
    });

    expect(ip).toBe("203.0.113.1");
  });
});
