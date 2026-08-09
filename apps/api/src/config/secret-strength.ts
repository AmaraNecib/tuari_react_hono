import { createHash, timingSafeEqual } from "node:crypto";

/** Minimum length for the Better Auth signing secret. */
export const BETTER_AUTH_SECRET_MIN_LENGTH = 32;
/** Minimum length for the bootstrap setup key (production only). */
export const BOOTSTRAP_SETUP_KEY_MIN_LENGTH = 20;
/**
 * Minimum estimated Shannon entropy per character (bits).
 *
 * Deliberately far below the 4.0 bits/char theoretical maximum for hex:
 * the empirical entropy of a FINITE random sample is systematically lower
 * than the alphabet's maximum (e.g. a 20-char `openssl rand -hex 10` key
 * averages ~3.46 bits/char), so a gate near 4.0 would intermittently
 * reject the app's own generated secrets (verified: P(<2.0) is 0 over
 * 500k samples at every documented length 20–96). The gate's job is to
 * reject degenerate distributions (single repeated chars, tiny alphabets),
 * not to certify randomness — length + the placeholder blocklist carry the
 * rest of the strength requirement.
 */
export const MIN_SECRET_ENTROPY_BITS_PER_CHAR = 2;

/** Minimum distinct characters — rejects `aaaabbbbcccc…`-style patterns. */
export const MIN_SECRET_DISTINCT_CHARS = 8;

/**
 * Placeholders that shipped in dev env files. Human-readable phrases sit
 * below the 4.0 bits/char hex maximum but ABOVE the 2.0 degeneracy floor,
 * so the blocklist — not the entropy gate — is what rejects them.
 */
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  "tuari-dev-secret-at-least-32-characters",
  "replace-with-a-32-plus-char-secret",
]);

/**
 * Estimate the Shannon entropy (bits per character) of a secret over its
 * observed alphabet. A standard heuristic for "does this look randomly
 * generated" without knowing the true generation process.
 */
export function estimateSecretEntropyBits(secret: string): number {
  if (secret.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const char of secret) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / secret.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

/**
 * A secret is strong when it meets the minimum length, is not a known shipped
 * placeholder, and its character distribution is not degenerate (at least
 * `MIN_SECRET_DISTINCT_CHARS` distinct characters AND estimated per-character
 * entropy above the floor). The entropy floor is calibrated against random
 * hex so generated secrets (the documented generation paths) always pass.
 */
export function isStrongSecret(secret: string, minLength: number): boolean {
  if (secret.length < minLength) return false;
  if (KNOWN_PLACEHOLDER_SECRETS.has(secret)) return false;
  if (new Set(secret).size < MIN_SECRET_DISTINCT_CHARS) return false;
  return estimateSecretEntropyBits(secret) >= MIN_SECRET_ENTROPY_BITS_PER_CHAR;
}

/**
 * Constant-time string comparison.
 *
 * Both inputs are hashed with SHA-256 first so the digests always have equal
 * length (a `timingSafeEqual` requirement) and no length information leaks
 * through early exits.
 */
export function safeSecretEquals(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}
