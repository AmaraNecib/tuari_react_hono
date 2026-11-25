import Database from "better-sqlite3";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { restoreStandaloneSnapshot } from "./restore-standalone-snapshot";

it("rejects same-size attachment bytes whose recorded digest differs", async () => {
  const root = await mkdtemp(join(tmpdir(),"629-hash-mismatch-"));
  const db = new Database(join(root,"tuari.sqlite"));
  db.exec("CREATE TABLE expense_attachment(relative_path TEXT,byte_size INTEGER,sha256 TEXT)");
  const bytes = Buffer.from("tampered");
  db.prepare("INSERT INTO expense_attachment VALUES (?,?,?)").run("receipt.pdf",bytes.length,createHash("sha256").update("original").digest("hex"));
  db.close();
  await mkdir(join(root,"attachments"));
  await writeFile(join(root,"attachments/receipt.pdf"),bytes);
  await expect(restoreStandaloneSnapshot(root,join(root,"restored"))).rejects.toThrow(/hash mismatch/i);
});

it.each([false,true])("checks recorded legacy size without a digest, sha column=%s", async hasDigest => {
  const root = await mkdtemp(join(tmpdir(),"625-legacy-size-"));
  const db = new Database(join(root,"tuari.sqlite"));
  db.exec(`CREATE TABLE inventory_invoice_attachment(relative_path TEXT,byte_size INTEGER${hasDigest ? ",sha256 TEXT" : ""})`);
  db.prepare("INSERT INTO inventory_invoice_attachment(relative_path,byte_size) VALUES (?,?)").run("receipt.pdf",8);
  db.close();
  await mkdir(join(root,"attachments"));
  await writeFile(join(root,"attachments/receipt.pdf"),"original");
  expect(await restoreStandaloneSnapshot(root,join(root,"intact"))).toMatchObject({verified:1});
  for(const [label,content] of [["empty",""],["truncated","orig"]]) {
    await writeFile(join(root,"attachments/receipt.pdf"),content!);
    await expect(restoreStandaloneSnapshot(root,join(root,label!))).rejects.toThrow(/size mismatch/i);
  }
});
