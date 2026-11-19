import { spawn as nodeSpawn } from "node:child_process";

/** Run the complete proof CLI in an owned process so its native addons unload before publication. */
export function runPortableProofProcess(scriptPath, { runtimeDir, nodeExe }, { spawnProcess = nodeSpawn } = {}) {
  const args = [scriptPath, "--runtime", runtimeDir, "--node", nodeExe];
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(process.execPath, args, { stdio: "inherit", shell: false });
    } catch (error) {
      reject(new Error(`Could not start portable encryption proof: ${error.message}`, { cause: error }));
      return;
    }

    let settled = false;
    const fail = (message, cause) => {
      if (settled) return;
      settled = true;
      reject(new Error(message, cause ? { cause } : undefined));
    };
    child.once("error", (error) => fail(`Could not start portable encryption proof: ${error.message}`, error));
    child.once("close", (status, signal) => {
      if (settled) return;
      if (signal !== null) {
        fail(`Portable encryption proof process ${child.pid ?? "(unknown pid)"} closed on signal ${signal}.`);
      } else if (status !== 0) {
        fail(`Portable encryption proof process ${child.pid ?? "(unknown pid)"} exited with status ${status}.`);
      } else {
        settled = true;
        resolve({ pid: child.pid, status });
      }
    });
  });
}
