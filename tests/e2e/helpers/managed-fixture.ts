import { randomUUID } from "node:crypto"
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

export function fixtureRepositoryRoot(): string {
  const cwd = process.cwd()
  return realpathSync(existsSync(join(cwd, "apps/api/package.json")) ? cwd : resolve(cwd, "../.."))
}

function fixturePath(path: string, root: string): string {
  const directory = join(realpathSync(root), "apps/api/data")
  mkdirSync(directory, { recursive: true })
  const absolute = resolve(path)
  if (realpathSync(directory) !== directory || dirname(absolute) !== directory || !/^tuari\.phase1\.integration\.[\w.-]+\.sqlite$/.test(basename(absolute))) {
    throw new Error("Database is outside the managed fixture boundary")
  }
  return absolute
}

/** Reserve a new database before the API starts; never adopt an existing file. */
export function prepareManagedFixture(path: string, root: string, inheritedToken?: string): string {
  const absolute = fixturePath(path, root)
  if (inheritedToken) {
    assertManagedFixture(absolute, inheritedToken, root)
    return inheritedToken
  }
  const token = randomUUID()
  const descriptor = openSync(absolute, "wx")
  closeSync(descriptor)
  const identity = statSync(absolute)
  writeFileSync(`${absolute}.e2e-owner.json`, JSON.stringify({ version: 1, path: absolute, token, dev: identity.dev, ino: identity.ino }), { flag: "wx" })
  return token
}

/** Match this run's token, canonical path and original file identity before any fixture write. */
export function assertManagedFixture(path: string, token: string | undefined, root = fixtureRepositoryRoot()): void {
  const absolute = fixturePath(path, root)
  if (!token || realpathSync(absolute) !== absolute) throw new Error("Managed fixture ownership is unavailable")
  const marker = JSON.parse(readFileSync(`${absolute}.e2e-owner.json`, "utf8")) as Record<string, unknown>
  const identity = statSync(absolute)
  if (marker.version !== 1 || marker.path !== absolute || marker.token !== token || marker.dev !== identity.dev || marker.ino !== identity.ino) {
    throw new Error("Managed fixture ownership does not match this run")
  }
}
