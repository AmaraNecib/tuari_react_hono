import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const configPath = new URL("../src-tauri/tauri.conf.json", import.meta.url);

test("desktop dev command serves the Tauri devUrl without changing the web default", async () => {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const devUrl = new URL(config.build.devUrl);
  const command = config.build.beforeDevCommand;

  assert.equal(devUrl.port, "1420");
  assert.match(command, /^pnpm --filter @tuari\/web dev --port 1420$/);
  assert.equal(command.includes("WEB_PORT"), false);
});
