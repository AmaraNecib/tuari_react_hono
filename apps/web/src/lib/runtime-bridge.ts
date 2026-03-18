export type RuntimeConfig = {
  apiBaseUrl: string;
  appClientKey: string;
};

export type RuntimeStatus = {
  checkedAt: string;
  environment: "desktop" | "browser";
  endpoint: string;
  health: "connected" | "preview" | "degraded";
  config: RuntimeConfig | null;
  error: string | null;
};

const BROWSER_PREVIEW_ENDPOINT = "Browser preview shell";
const DESKTOP_BRIDGE_ENDPOINT = "Tauri sidecar bridge";
const RUNTIME_UNAVAILABLE_PATTERNS = [
  /__TAURI_INTERNALS__/i,
  /window\.__TAURI/i,
  /tauri invoke bridge is not available/i,
  /tauri ipc.*not available/i,
  /invoke bridge.*not available/i,
  /cannot read properties of undefined.*invoke/i,
  /unsupported in a web browser/i,
];

function getCheckedAt(now?: () => string) {
  return now ? now() : new Date().toISOString();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load runtime diagnostics.";
}

function isRuntimeUnavailable(error: unknown) {
  const message = getErrorMessage(error);
  return RUNTIME_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(message));
}

async function getInvoke() {
  const tauriCore = await import("@tauri-apps/api/core");

  if (typeof tauriCore.invoke !== "function") {
    throw new Error("Tauri invoke bridge is not available.");
  }

  return tauriCore.invoke;
}

export async function getRuntimeStatus(options?: { now?: () => string }): Promise<RuntimeStatus> {
  const checkedAt = getCheckedAt(options?.now);

  let invoke: typeof import("@tauri-apps/api/core").invoke;

  try {
    invoke = await getInvoke();
  } catch (error) {
    if (isRuntimeUnavailable(error)) {
      return {
        checkedAt,
        environment: "browser",
        endpoint: BROWSER_PREVIEW_ENDPOINT,
        health: "preview",
        config: null,
        error: null,
      };
    }

    return {
      checkedAt,
      environment: "desktop",
      endpoint: DESKTOP_BRIDGE_ENDPOINT,
      health: "degraded",
      config: null,
      error: getErrorMessage(error),
    };
  }

  try {
    const config = await invoke<RuntimeConfig>("get_runtime_config");

    return {
      checkedAt,
      environment: "desktop",
      endpoint: config.apiBaseUrl,
      health: "connected",
      config,
      error: null,
    };
  } catch (error) {
    if (isRuntimeUnavailable(error)) {
      return {
        checkedAt,
        environment: "browser",
        endpoint: BROWSER_PREVIEW_ENDPOINT,
        health: "preview",
        config: null,
        error: null,
      };
    }

    return {
      checkedAt,
      environment: "desktop",
      endpoint: DESKTOP_BRIDGE_ENDPOINT,
      health: "degraded",
      config: null,
      error: getErrorMessage(error),
    };
  }
}
