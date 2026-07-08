import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAppVersion } from "./version";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, "..", "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const apiPkgVersion: string = pkg.version ?? "0.0.0";

const OLD_ENV = process.env;

beforeEach(() => {
  process.env = { ...OLD_ENV };
});

afterEach(() => {
  process.env = OLD_ENV;
});

describe("readAppVersion", () => {
  it("returns TUARI_APP_VERSION when set", () => {
    process.env.TUARI_APP_VERSION = "2.0.0";
    expect(readAppVersion()).toBe("2.0.0");
  });

  it("returns TUARI_APP_VERSION even when called repeatedly", () => {
    process.env.TUARI_APP_VERSION = "3.0.0";
    expect(readAppVersion()).toBe("3.0.0");
    expect(readAppVersion()).toBe("3.0.0");
    expect(readAppVersion()).toBe("3.0.0");
  });

  it("falls back to cached package.json version when env var is not set", () => {
    delete process.env.TUARI_APP_VERSION;
    // Derived from API's package.json so tests stay in sync after version bumps
    expect(readAppVersion()).toBe(apiPkgVersion);
  });

  it("treats empty string env var as unset and falls back", () => {
    process.env.TUARI_APP_VERSION = "";
    // Empty string is falsy, so readAppVersion should fall back
    expect(readAppVersion()).toBe(apiPkgVersion);
  });
});
