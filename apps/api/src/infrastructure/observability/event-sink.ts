import { appendFileSync, closeSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, statSync, truncateSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export type LocalEvent = {
  timestamp?: string;
  severity: "debug" | "info" | "warn" | "error";
  source: string;
  message: string;
  attributes?: Record<string, unknown>;
  lifecycle?: boolean;
};
export interface EventSink {
  emit(event: LocalEvent): void;
  flush(): void;
  readonly degraded: boolean;
}
type Captured = LocalEvent & { timestamp: string };
type Options = { ringSize?: number; chunkBytes?: number; totalBytes?: number; retentionDays?: number; now?: () => Date; prefix?: string };
type Duplicate = { path: string; offset: number; count: number; instant: number; marker: string };

export function localTimestamp(date = new Date()): string {
  const offset = -date.getTimezoneOffset();
  const shifted = new Date(date.getTime() + offset * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.toISOString().slice(0, -1)}${offset >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

/** A single process owns each prefix. Count updates never change a record's byte length. */
export class LocalEventSink implements EventSink {
  degraded = false;
  private readonly ring: Captured[] = [];
  private readonly duplicates = new Map<string, Duplicate>();
  private readonly prefix: string;
  private readonly chunks = new Map<string, number>();
  constructor(private readonly root: string, private readonly options: Options = {}) {
    this.prefix = options.prefix ?? "app";
    if (!/^[a-z-]+$/.test(this.prefix)) throw new Error("Invalid log prefix");
    this.safe(() => { mkdirSync(root, { recursive: true }); this.cleanup(); });
  }
  private safe(action: () => void): void {
    try { action(); } catch {
      this.degraded = true;
      try { console.error("Local logging degraded"); } catch { /* Console may be unavailable too. */ }
    }
  }
  emit(event: LocalEvent): void {
    this.safe(() => {
      const timestamp = event.timestamp ?? localTimestamp(this.options.now?.());
      if (!/^\d{4}-\d{2}-\d{2}T.*[+-]\d{2}:\d{2}$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) throw new Error("Invalid event timestamp");
      const captured = { ...event, timestamp };
      if (!event.lifecycle && (event.severity === "debug" || event.severity === "info")) {
        this.ring.push(captured);
        if (this.ring.length > (this.options.ringSize ?? 1000)) this.ring.shift();
        return;
      }
      if (event.severity === "error") this.flush();
      const instant = Date.parse(timestamp);
      for (const [key, duplicate] of this.duplicates) {
        if (instant - duplicate.instant >= 60_000 || instant < duplicate.instant) this.duplicates.delete(key);
      }
      const a = event.attributes;
      const signature = JSON.stringify([timestamp.slice(0, 10), event.source, event.message, a?.error, a?.method, a?.path, a?.status, a?.errorCode, a?.errorMessage, a?.encodeFailed]);
      const duplicate = event.severity === "error" ? this.duplicates.get(signature) : undefined;
      if (!duplicate || !this.updateDuplicate(duplicate)) {
        const record = this.write(captured);
        if (event.severity === "error") {
          if (this.duplicates.size >= 1000) this.duplicates.delete(this.duplicates.keys().next().value!);
          this.duplicates.set(signature, { ...record, count: 1, instant });
        }
      }
      this.cleanup();
    });
  }
  private updateDuplicate(duplicate: Duplicate): boolean {
    let fd: number;
    try { fd = openSync(duplicate.path, "r+"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
    try {
      const marker = Buffer.alloc(Buffer.byteLength(duplicate.marker));
      if (readSync(fd, marker, 0, marker.length, duplicate.offset + 12) !== marker.length || marker.toString() !== duplicate.marker) return false;
      duplicate.count++;
      writeSync(fd, String(duplicate.count).padStart(12), duplicate.offset, "utf8");
      return true;
    } finally { closeSync(fd); }
  }
  private write(event: Captured): { path: string; offset: number; marker: string } {
    const dir = join(this.root, event.timestamp.slice(0, 10));
    mkdirSync(dir, { recursive: true });
    if (lstatSync(dir).isSymbolicLink()) throw new Error("Log directory is a link");
    const payload = JSON.stringify({ ...event, schemaVersion: 1 });
    const marker = ',"recordId":' + JSON.stringify(randomUUID()) + ',';
    const line = '{"count":' + String(1).padStart(12) + marker + payload.slice(1) + "\n";
    const bytesToWrite = Buffer.byteLength(line);
    if (bytesToWrite > (this.options.totalBytes ?? 200 * 1024 * 1024)) throw new Error("Event exceeds log capacity");
    this.cleanup(bytesToWrite);
    let index = this.chunks.get(dir) ?? readdirSync(dir).reduce((max, name) => {
      const match = new RegExp(`^${this.prefix}(?:\\.(\\d+))?\\.log$`).exec(name);
      return match ? Math.max(max, Number(match[1] ?? 0)) : max;
    }, 0);
    let path: string;
    let size: number;
    for (;;) {
      path = join(dir, `${this.prefix}${index ? `.${index}` : ""}.log`);
      let exists = false;
      try { const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Invalid log file"); exists = true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      size = exists ? statSync(path).size : 0;
      if (size && exists) {
        const fd = openSync(path, "r");
        try {
          const tail = Buffer.alloc(4096);
          let end = size;
          while (end > 0) {
            const start = Math.max(0, end - tail.length);
            const length = readSync(fd, tail, 0, end - start, start);
            const newline = tail.subarray(0, length).lastIndexOf(10);
            if (newline >= 0) { size = start + newline + 1; break; }
            end = start;
            if (end === 0) size = 0;
          }
        } finally { closeSync(fd); }
        if (size !== statSync(path).size) truncateSync(path, size);
      }
      if (!size || size + Buffer.byteLength(line) <= (this.options.chunkBytes ?? 5 * 1024 * 1024)) break;
      index++;
    }
    appendFileSync(path, line);
    this.chunks.set(dir, index);
    return { path, offset: size + 9, marker };
  }
  private cleanup(reservedBytes = 0): void {
    const now = this.options.now?.() ?? new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    cutoff.setDate(cutoff.getDate() - (this.options.retentionDays ?? 30) + 1);
    const files: { path: string; size: number; day: string; mtime: number }[] = [];
    for (const day of readdirSync(this.root, { withFileTypes: true })) {
      if (!day.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(day.name)) continue;
      for (const file of readdirSync(join(this.root, day.name), { withFileTypes: true })) {
        if (!file.isFile() || !new RegExp(`^${this.prefix}(?:\\.(\\d+))?\\.log$`).test(file.name)) continue;
        const path = join(this.root, day.name, file.name);
        const stat = statSync(path);
        files.push({ path, size: stat.size, day: day.name, mtime: stat.mtimeMs });
      }
    }
    files.sort((a, b) => a.day.localeCompare(b.day) || a.mtime - b.mtime);
    let total = files.reduce((sum, file) => sum + file.size, 0);
    for (const file of files) {
      if (file.day < localTimestamp(cutoff).slice(0, 10) || total + reservedBytes > (this.options.totalBytes ?? 200 * 1024 * 1024)) {
        unlinkSync(file.path); total -= file.size;
        for (const [key, duplicate] of this.duplicates) if (duplicate.path === file.path) this.duplicates.delete(key);
      }
    }
  }
  flush(): void {
    for (const event of this.ring.splice(0)) this.safe(() => { this.write(event); });
    this.safe(() => this.cleanup());
  }
}
