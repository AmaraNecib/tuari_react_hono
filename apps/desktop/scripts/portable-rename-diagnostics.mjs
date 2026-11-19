import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./portable-rename-diagnostics.ps1", import.meta.url));
const desktopRoot = path.resolve(path.dirname(scriptPath), "..");
const repositoryRoot = path.resolve(desktopRoot, "../..");
const diagnosticFile = "portable-rename-failure.json";

function nativeBindings(candidate) {
  const runtimeModules = path.join(candidate, "bin", "api-runtime", "node_modules");
  const bindingPaths = [
    path.join(runtimeModules, "better-sqlite3-multiple-ciphers", "build", "Release"),
    path.join(runtimeModules, "better-sqlite3", "build", "Release"),
  ];
  const selectedPrebuild = path.join(runtimeModules, "better-sqlite3-multiple-ciphers", "prebuilds", "win32-x64.node");
  const bindings = existsSync(selectedPrebuild) ? [selectedPrebuild] : [];
  for (const directory of bindingPaths) {
    if (!existsSync(directory)) continue;
    try {
      for (const name of readdirSync(directory).filter(name => name.endsWith(".node")).slice(0, 4)) {
        bindings.push(path.join(directory, name));
      }
    } catch {
      // The probe reports missing paths; it does not scan beyond these known directories.
    }
  }
  return bindings.slice(0, 8);
}

function resourcePaths(candidate) {
  return [
    candidate,
    path.join(candidate, "Tuari.exe"),
    path.join(candidate, "bin", "node.exe"),
    ...nativeBindings(candidate),
  ];
}

function runProbe(candidate, final, resources, probeOwners = false) {
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", scriptPath,
    "-Candidate", candidate,
    "-Final", final,
    "-ResourcesBase64", Buffer.from(resources.join("\n"), "utf8").toString("base64"),
  ];
  if (probeOwners) args.push("-ProbeOwners");
  const result = spawnSync("powershell.exe", args, {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`PowerShell diagnostics exited ${result.status}: ${result.stderr.trim()}`);
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(`PowerShell diagnostics returned invalid JSON: ${error.message}`);
  }
}

export function createPortableRenameDiagnostics(candidate, final, { directory = process.env.TUARI_PORTABLE_DIAGNOSTICS_DIR } = {}) {
  if (!directory) return undefined;
  if (!path.isAbsolute(directory)) {
    try { console.error("[portable-rename-diagnostics] disabled: TUARI_PORTABLE_DIAGNOSTICS_DIR must be an absolute path"); } catch {}
    return undefined;
  }
  let currentFinal = final;
  const resources = resourcePaths(candidate);
  const errors = [];
  const capture = stage => {
    try {
      return runProbe(candidate, currentFinal, resources);
    } catch (error) {
      errors.push({ stage, message: error.message });
      return { timestampUtc: new Date().toISOString(), paths: [], resources: [], probeError: error.message };
    }
  };
  return {
    beforeProof: capture("before-proof"),
    updateFinal(destination) {
      currentFinal = destination;
    },
    beforeRename() {
      this.afterProofBeforeRename = capture("after-proof-before-rename");
    },
    recordFailure(error) {
      const failedAtUtc = new Date().toISOString();
      let sourceSha = null;
      let sourceShaError = null;
      try {
        const git = spawnSync("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], {
          encoding: "utf8", timeout: 5_000, windowsHide: true, shell: false,
        });
        if (git.status === 0) sourceSha = git.stdout.trim();
        else sourceShaError = `git rev-parse exited ${git.status}: ${git.stderr.trim()}`;
      } catch (shaError) {
        sourceShaError = shaError.message;
      }
      let restartManager;
      try {
        restartManager = runProbe(candidate, currentFinal, resources, true);
      } catch (probeError) {
        restartManager = { timestampUtc: new Date().toISOString(), restartManager: { status: "unavailable", errors: [probeError.message], owners: [] } };
      }
      const report = {
        schemaVersion: 1,
        event: "portable-candidate-rename-failed",
        failedAtUtc,
        process: { pid: process.pid, sourceSha, sourceShaError },
        source: candidate,
        destination: currentFinal,
        nativeError: {
          name: error?.name ?? null,
          message: error?.message ?? String(error),
          code: error?.code ?? null,
          errno: error?.errno ?? null,
          syscall: error?.syscall ?? null,
          path: error?.path ?? null,
          dest: error?.dest ?? null,
        },
        beforeProof: this.beforeProof,
        afterProofBeforeRename: this.afterProofBeforeRename ?? null,
        immediateFailureSnapshot: restartManager,
        diagnosticErrors: errors,
      };
      try {
        mkdirSync(directory, { recursive: true });
        const reportPath = path.join(directory, diagnosticFile);
        writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
        return reportPath;
      } catch (writeError) {
        errors.push({ stage: "write-report", message: writeError.message });
        return undefined;
      }
    },
  };
}

export function reportPortableRenameDiagnosticFailure(error, diagnostics, log = console.error) {
  if (!diagnostics) return;
  const safeLog = message => {
    try { log(message); } catch {}
  };
  try {
    const reportPath = diagnostics.recordFailure(error);
    if (reportPath) safeLog(`[portable-rename-diagnostics] evidence=${reportPath}`);
    else safeLog(`[portable-rename-diagnostics] evidence unavailable; primary rename error preserved`);
  } catch (diagnosticError) {
    safeLog(`[portable-rename-diagnostics] probe failed: ${diagnosticError.message}; primary rename error preserved`);
  }
}
