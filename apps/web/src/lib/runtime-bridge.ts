type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export type RuntimeConfig = {
  apiBaseUrl: string;
  appClientKey: string;
  projectDir: string;
  authDbPath: string;
  appDbPath: string;
  serverLogPath: string;
};

export type RuntimeStatus = {
  checkedAt: string;
  environment: "desktop" | "browser";
  endpoint: string;
  health: "connected" | "preview" | "degraded";
  config: RuntimeConfig | null;
  serverLog: string;
  error: string | null;
};

function getCheckedAt(now?: () => string) {
  return now ? now() : new Date().toISOString();
}

function getTauriWindow() {
  if (typeof window === "undefined") {
    return null;
  }

  return window as TauriWindow;
}

export function hasTauriRuntime() {
  return Boolean(getTauriWindow()?.__TAURI_INTERNALS__);
}

export async function getRuntimeStatus(options?: { now?: () => string }): Promise<RuntimeStatus> {
  const checkedAt = getCheckedAt(options?.now);

  if (!hasTauriRuntime()) {
    return {
      checkedAt,
      environment: "browser",
      endpoint: "Browser preview shell",
      health: "preview",
      config: null,
      serverLog: "",
      error: null,
    };
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const [config, serverLog] = await Promise.all([
      invoke<RuntimeConfig>("get_runtime_config"),
      invoke<string>("get_server_log"),
    ]);

    return {
      checkedAt,
      environment: "desktop",
      endpoint: config.apiBaseUrl,
      health: "connected",
      config,
      serverLog: serverLog.trim(),
      error: null,
    };
  } catch (error) {
    return {
      checkedAt,
      environment: "desktop",
      endpoint: "Tauri sidecar bridge",
      health: "degraded",
      config: null,
      serverLog: "",
      error: error instanceof Error ? error.message : "Unable to load runtime diagnostics.",
    };
  }
}
