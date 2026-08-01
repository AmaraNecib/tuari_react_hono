/**
 * Shared URL normalization/validation helpers for application config.
 *
 * Used by both the Zod-based config factory (`config/index.ts`) and the
 * legacy env module (`infrastructure/config/env.ts`) so host/URL checks
 * live in one place.
 */

const isLoopbackAddress = (hostname: string) => {
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.slice(1).every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
};

/** True for hostnames that are local (loopback /8, dev bind-all, tauri). */
export const isLocalHostname = (hostname: string) =>
  hostname === "localhost" ||
  hostname === "0.0.0.0" ||
  hostname === "[::1]" ||
  hostname === "::1" ||
  hostname === "tauri.localhost" ||
  isLoopbackAddress(hostname);

export const normalizeOrigin = (value: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error("Origin value cannot be empty");

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Invalid origin URL: ${value}`);
  }

  if (!parsed.protocol || !parsed.host) {
    throw new Error(`Invalid origin URL: ${value}`);
  }

  return `${parsed.protocol}//${parsed.host}`;
};

export const normalizeOriginList = (values: readonly string[]) => [
  ...new Set(values.map(normalizeOrigin)),
];

export const normalizeBaseUrl = (value: string) => {
  const trimmedValue = value.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmedValue);
  } catch {
    throw new Error(`Invalid BETTER_AUTH_URL: ${value}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(
      `BETTER_AUTH_URL must use http or https, received "${parsed.protocol}"`,
    );
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      "BETTER_AUTH_URL must not include credentials, query parameters, or fragments",
    );
  }

  if (!isLocalHostname(parsed.hostname) && parsed.protocol !== "https:") {
    throw new Error("BETTER_AUTH_URL must use https for non-local hosts");
  }

  return parsed.toString().replace(/\/+$/, "");
};
