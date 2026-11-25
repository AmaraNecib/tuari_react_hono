import { resolve } from "node:path";
import { restoreStandaloneSnapshot } from "./restore-standalone-snapshot";

const [snapshot, destination, ...extra] = process.argv.slice(2);
if (!snapshot || !destination || extra.length) {
  console.error("Usage: tsx src/modules/backup/restore-standalone-snapshot.cli.ts <snapshot-directory> <new-disposable-directory>");
  process.exitCode = 1;
} else {
  try {
    const restored = await restoreStandaloneSnapshot(resolve(snapshot), resolve(destination), process.env.APP_DB_KEY ?? "");
    console.log(`Standalone restore verified: ${restored.verified} referenced files. Database: ${restored.databasePath}`);
  } catch (error) {
    console.error("Restore is incomplete. Do not use the destination. Original snapshot was not modified.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
