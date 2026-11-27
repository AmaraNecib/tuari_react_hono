import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.doUnmock("node:fs")
  vi.resetModules()
  vi.unstubAllEnvs()
})

describe("readAppVersion package fallback", () => {
  it("returns 0.0.0 when package metadata has no usable version", async () => {
    vi.resetModules()
    vi.stubEnv("TUARI_APP_VERSION", undefined)
    vi.doMock("node:fs", () => ({
      readFileSync: () => '{"version":""}',
    }))

    const { readAppVersion } = await import("./version")

    expect(readAppVersion()).toBe("0.0.0")
  })

  it("returns 0.0.0 when packaged metadata cannot be read", async () => {
    vi.resetModules()
    vi.stubEnv("TUARI_APP_VERSION", undefined)
    vi.doMock("node:fs", () => ({
      readFileSync: () => { throw new Error("Package metadata is absent") },
    }))

    const { readAppVersion } = await import("./version")

    expect(readAppVersion()).toBe("0.0.0")
  })
})
