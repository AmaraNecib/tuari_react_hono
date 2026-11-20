import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseConnection } from "./infrastructure/database/factory";
import { ensureFreshExactApplicationSchema } from "./infrastructure/database/fresh-exact-schema";

const require = createRequire(import.meta.url);
const children: ChildProcess[] = [];
const origin = "http://localhost:3000";
afterEach(async () => { for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, "exit"); } });
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(done => server.close(() => done()));
  return port;
}
function workspace() { return mkdtempSync(join(tmpdir(), "tuari-normal-startup-")); }
async function launch(directory: string, key = "", adapter = "sqlite") {
  const port = await freePort();
  const databasePath = join(directory, "application.sqlite");
  // Exercise config-file loading as the desktop does. Explicit env values
  // isolate the child from developer configuration and credentials.
  const configFile = join(directory, "config.json");
  writeFileSync(configFile, JSON.stringify({ db_key: key }));
  const child = spawn(process.env.TUARI_STARTUP_NODE ?? process.execPath, process.env.TUARI_STARTUP_BUNDLE
    ? [process.env.TUARI_STARTUP_BUNDLE]
    : ["--import", pathToFileURL(require.resolve("tsx")).href, resolve("src/index.ts")], {
    cwd: resolve("."), env: { ...process.env, NODE_ENV: "development", TUARI_CONFIG_FILE: configFile,
      APP_DB_PATH: databasePath, AUTH_DB_PATH: databasePath, DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}`,
      APP_DB_KEY: key, APP_BACKUPS_ROOT: join(directory, "backups"), DB_ADAPTER: adapter,
      BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", BOOTSTRAP_SETUP_KEY: "",
      API_PORT: String(port), API_HOST: "127.0.0.1", WEB_PORT: "3000", TUARI_LICENSE_STATUS: "trial" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let output = "";
  child.stdout!.on("data", data => { output += String(data); });
  child.stderr!.on("data", data => { output += String(data); });
  const exit = once(child, "exit");
  return { child, exit, databasePath, base: `http://127.0.0.1:${port}`, output: () => output };
}
type Running = Awaited<ReturnType<typeof launch>>;
async function ready(run: Running) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline && run.child.exitCode === null) {
    try { const response = await fetch(run.base + "/health"); if (response.ok) { expect(await response.json()).toEqual({ status: "ok" }); return; } } catch { /* Server has not bound yet. */ }
    await new Promise(done => setTimeout(done, 50));
  }
  throw new Error(`Normal entry did not become ready: ${run.output()}`);
}
async function stop(run: Running) {
  run.child.kill("SIGTERM");
  await run.exit;
}
async function rpc(run: Running, path: string, input: unknown = null, token = "") {
  const response = await fetch(run.base + "/rpc/" + path, { method: "POST", headers: { origin, "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ json: input }) });
  return { status: response.status, body: await response.json() as { json: Record<string, unknown> } };
}

describe("normal API entry", { timeout: 60_000 }, () => {
  it.each(["", "normal-key-558"])("boots empty file, authenticates HTTP and reopens exact state (%s)", async key => {
    const directory = workspace();
    writeFileSync(join(directory, "application.sqlite"), "");
    let run = await launch(directory, key);
    await ready(run);
    expect((await rpc(run, "authSetupStatus")).body.json).toMatchObject({ hasUsers: false });
    const bootstrap = await rpc(run, "authBootstrap", { name: "Normal owner", phone: "0612345678", password: "password123" });
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.body.json).toMatchObject({ success: true });
    const login = await fetch(run.base + "/api/auth/sign-in/phone-number", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ phoneNumber: "0612345678", password: "password123" }) });
    expect(login.status).toBe(200);
    const { token } = await login.json() as { token: string };
    expect(token).toBeTruthy();
    expect((await rpc(run, "financial/metadata")).status).toBe(401);
    const metadata = await rpc(run, "financial/metadata", null, token);
    expect(metadata.status).toBe(200);
    expect(metadata.body.json).toHaveProperty("roles");
    // This exact-only response cannot be served by the legacy root.
    const report = await rpc(run, "financial/reports/generate", { type: "DEBT" }, token);
    expect(report.status).toBe(200);
    expect(report.body.json).toMatchObject({ summary: { totalOutstandingDzd: "0.00" } });
    expect((await rpc(run, "reportsGenerate", { type: "DEBT" }, token)).status).toBe(503);
    await expect.poll(async () => (await rpc(run, "backupStatus", null, token)).body.json.lastBackupPath, { timeout: 15_000 }).toEqual(expect.any(String));
    const backup = await rpc(run, "backupStatus", null, token);
    expect(backup.status).toBe(200);
    expect(backup.body.json).toMatchObject({ backupsRootPath: join(directory, "backups"), lastFailure: null });
    expect(backup.body.json.lastBackupPath).toEqual(expect.any(String));
    expect(existsSync(backup.body.json.lastBackupPath as string)).toBe(true);
    const snapshot = createDatabaseConnection(join(backup.body.json.lastBackupPath as string, "tuari.sqlite"), key);
    expect(snapshot.prepare("SELECT count(*) AS n FROM exact_money_schema").get()).toEqual({ n: 5 });
    snapshot.close();
    await stop(run);
    const db = createDatabaseConnection(run.databasePath, key);
    expect(db.prepare("SELECT slice FROM exact_money_schema ORDER BY slice").all()).toEqual([
      { slice: "debt" }, { slice: "expenses" }, { slice: "inventory" }, { slice: "invoice" }, { slice: "workforce" },
    ]);
    db.close();
    run = await launch(directory, key);
    await ready(run);
    expect((await rpc(run, "authSetupStatus")).body.json).toMatchObject({ hasUsers: true });
    expect((await rpc(run, "financial/metadata", null, token)).status).toBe(200);
    await stop(run);
  });

  it.each(["legacy", "partial", "tampered"])("refuses %s without changing database bytes", async kind => {
    const directory = workspace();
    const path = join(directory, "application.sqlite");
    const db = createDatabaseConnection(path, "");
    if (kind === "tampered") { await ensureFreshExactApplicationSchema(db); db.exec("DROP TRIGGER debt_entry_currency_insert"); }
    else db.exec(kind === "legacy" ? "CREATE TABLE debt_account(id TEXT PRIMARY KEY,current_balance REAL); INSERT INTO debt_account VALUES ('preserved',1.25)" : "CREATE TABLE exact_money_schema(slice TEXT,version INTEGER)");
    db.close();
    const before = readFileSync(path);
    const run = await launch(directory);
    expect((await run.exit)[0]).toBe(1);
    expect(run.output()).toContain("Failed to start API");
    expect(run.output()).toContain("Unsupported financial schema");
    expect(readFileSync(path)).toEqual(before);
  });

  it("refuses unsupported DB_ADAPTER explicitly before creating a database", async () => {
    const run = await launch(workspace(), "", "postgres");
    expect((await run.exit)[0]).toBe(1);
    expect(run.output()).toContain("DB_ADAPTER must be one of");
    expect(existsSync(run.databasePath)).toBe(false);
  });
});
