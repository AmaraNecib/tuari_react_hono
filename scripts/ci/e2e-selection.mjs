// Decide which checks a diff needs.
//
// This file is the single source of truth for "what does this diff touch?".
// Two questions share one map and one glob matcher:
//
//   selectSpecs  — which Playwright specs can the diff reach?
//                  full     : run the whole suite (critical path, empty diff,
//                             or a path the map does not know)
//                  affected : run the mapped specs
//                  skip     : nothing in the diff can reach a browser
//   selectAreas  — the pre-push decision: whether test:api / test:web run, plus
//                  the e2e scope above.
//
// FAIL CLOSED is the whole safety argument: a path nobody wired in is a cost
// (the full suite), never a coverage hole. No model and no human judges the
// diff — the diff is an input and the map is a checked-in artifact.
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..");
export const MAP_PATH = join(REPO_ROOT, "tests", "e2e-selection.map.json");

// `**`, `*` and `?` only. Deliberately not a glob library: the patterns are
// hand-written and a dependency-free matcher is the one that cannot change
// behaviour under a lockfile bump.
export function globToRegExp(pattern) {
  const out = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000") // `**/` -> zero or more directories
    .replace(/\*\*/g, "\u0001") // `**`  -> anything, slashes included
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\u0001/g, ".*");
  return new RegExp(`^${out}$`);
}

export function loadMap(path = MAP_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// `$comment` entries let the JSON explain itself without becoming patterns.
const toRegExps = (list = []) =>
  list.filter((p) => !p.startsWith("$comment")).map(globToRegExp);

export function selectSpecs(changed, map = loadMap()) {
  const full = toRegExps(map.always_full);
  const skip = toRegExps(map.skip_e2e);
  const features = map.features.map((f) => ({
    match: toRegExps(f.match),
    specs: f.specs,
  }));
  const always = (map.always_specs ?? []).filter((s) => !s.startsWith("$comment"));

  const files = changed.map((f) => f.trim()).filter(Boolean);
  if (files.length === 0) {
    return {
      mode: "full",
      specs: [],
      reason: "empty diff — cannot prove the change is inert",
    };
  }

  const picked = new Set();

  for (const file of files) {
    // 1. Critical path wins over everything, and is checked first so a
    //    skip_e2e pattern can never swallow a shared module.
    if (full.some((re) => re.test(file))) {
      return { mode: "full", specs: [], reason: `critical path: ${file}` };
    }

    // 2. A feature rule beats a skip rule: apps/web/src/features/** must not
    //    be skipped just because some broad inert pattern matched it first.
    const hit = features.find((f) => f.match.some((re) => re.test(file)));
    if (hit) {
      for (const spec of hit.specs) picked.add(spec);
      continue;
    }

    // 3. Explicitly inert.
    if (skip.some((re) => re.test(file))) continue;

    // 4. Unknown path: fail closed. An unmaintained map degrades to expensive,
    //    never to unguarded.
    return { mode: "full", specs: [], reason: `unmapped path: ${file}` };
  }

  // A skip-only diff stays a skip even though always_specs is non-empty:
  // always_specs join a run only once the diff has proven browser reach.
  if (picked.size === 0) {
    return {
      mode: "skip",
      specs: [],
      reason: "no browser-reachable path changed",
    };
  }

  const specs = [...new Set([...picked, ...always])].sort();
  return {
    mode: "affected",
    specs,
    reason: `${specs.length} spec(s) mapped from ${files.length} file(s)`,
  };
}

// Root/workspace manifests and lockfile changes force both unit suites: a
// dependency bump or a shared config edit can move either side.
const AREA_ROOT = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig*.json",
  "apps/*/package.json",
  "packages/*/package.json",
];
const API_AREA = ["apps/api/**", "packages/contracts/**", ...AREA_ROOT];
const WEB_AREA = ["apps/web/**", "packages/contracts/**", ...AREA_ROOT];

export function selectAreas(changed, map = loadMap()) {
  const files = changed.map((f) => f.trim()).filter(Boolean);
  const matchesAny = (globs) => {
    const res = toRegExps(globs);
    return files.some((f) => res.some((re) => re.test(f)));
  };

  const e2e = selectSpecs(files, map);
  return {
    // Any `full` e2e scope is also an unknown/critical/empty diff, so the
    // pre-push gate runs in full rather than guessing which suites matter.
    gate: e2e.mode === "full" ? "full" : "scoped",
    api: matchesAny(API_AREA) ? "1" : "0",
    web: matchesAny(WEB_AREA) ? "1" : "0",
    e2e_mode: e2e.mode,
    e2e_specs: e2e.specs.map((s) => `tests/e2e/${s}`),
    reason: e2e.reason,
  };
}

export function readChanged(argv, readStdin = () => readFileSync(0, "utf8")) {
  const idx = argv.indexOf("--files");
  const raw = idx >= 0 ? readFileSync(argv[idx + 1], "utf8") : readStdin();
  return raw.split(/\r?\n/);
}

function main(argv) {
  const modeIdx = argv.indexOf("--mode");
  const mode = modeIdx >= 0 ? argv[modeIdx + 1] : "e2e";
  const mapIdx = argv.indexOf("--map");
  const map = mapIdx >= 0 ? loadMap(argv[mapIdx + 1]) : loadMap();
  const changed = readChanged(argv);

  const lines = [];
  if (mode === "areas") {
    const scope = selectAreas(changed, map);
    lines.push(
      `gate=${scope.gate}`,
      `api=${scope.api}`,
      `web=${scope.web}`,
      `e2e_mode=${scope.e2e_mode}`,
      `e2e_specs=${scope.e2e_specs.join(" ")}`,
      `reason=${scope.reason}`,
    );
  } else {
    const scope = selectSpecs(changed, map);
    const specs =
      scope.mode === "affected" ? scope.specs.map((s) => `tests/e2e/${s}`) : [];
    lines.push(
      `mode=${scope.mode}`,
      `specs=${specs.join(" ")}`,
      `reason=${scope.reason}`,
    );
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

const invokedDirectly = () => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (invokedDirectly()) main(process.argv.slice(2));
