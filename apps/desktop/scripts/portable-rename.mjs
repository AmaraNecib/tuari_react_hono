import { rename } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const RETRYABLE_RENAME_ERRORS = new Set(["EACCES", "EBUSY", "EPERM"]);
const RETRY_DELAYS_MS = [100, 250, 500];

export async function renamePortableCandidate(source, destination, {
  move = rename,
  log = console.log,
  pause = delay,
} = {}) {
  const maxAttempts = RETRY_DELAYS_MS.length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await move(source, destination);
      return;
    } catch (error) {
      const detail = `${error?.code ?? "unknown"}: ${error instanceof Error ? error.message : String(error)}`;
      const retryDelay = RETRY_DELAYS_MS[attempt - 1];
      if (!RETRYABLE_RENAME_ERRORS.has(error?.code) || retryDelay === undefined) {
        log(`[portable-rename] attempt ${attempt}/${maxAttempts} failed without retry (${detail})`);
        throw error;
      }
      log(`[portable-rename] attempt ${attempt}/${maxAttempts} failed (${detail}); retrying in ${retryDelay}ms`);
      await pause(retryDelay);
    }
  }
}
