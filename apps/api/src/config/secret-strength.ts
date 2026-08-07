import { createHash, timingSafeEqual } from "node:crypto";

/** Minimum length for the Better Auth signing secret. */
export const BETTER_AUTH_SECRET_MIN_LENGTH = 32;
/** Minimum length for the bootstrap setup key (production only). */
export const BOOTSTRAP_SETUP_KEY_MIN_LENGTH = 20;
/**
 * Minimum estimated Shannon entropy per character (bits). Uniform hex —
 * the shape the desktop shell generates — sits exactly at 4.0 bpc; human
 * phrases and the shipped placeholder values sit below it.
 */
export const MIN_SECRET_ENTROPY_BITS_PER_CHAR = 4;

/**
 * Placeholders that shipped in dev env files. Rejected by the entropy gate
 * anyway; listed explicitly so a padded variant cannot slip through.
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
 * placeholder, and its estimated per-character entropy clears the floor.
 */
export function isStrongSecret(secret: string, minLength: number): boolean {
  if (secret.length < minLength) return false;
  if (KNOWN_PLACEHOLDER_SECRETS.has(secret)) return false;
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
