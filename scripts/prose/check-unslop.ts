/**
 * check:unslop — mechanical AI-tell gate for the repo's prose.
 *
 * Scans markdown under .agents/skills, .agents/wisdom, and docs for the
 * strongest auto-detectable tells and fails CI on the error tier:
 *   - filler phrases (Additionally, It is important to note, ...)
 *   - sycophantic / chatbot artifacts
 * The warn tier (em-dash chains, inline bold-label headers) is advisory.
 *
 * Deliberate repo vocabulary (seam, tripwire, composition root,
 * depth/leverage/locality) is never flagged.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { scanText, type Finding } from "./unslop-detectors.ts"

const ROOT = process.cwd()
/** Directories scanned, relative to ROOT. External references dirs are excluded. */
const SCAN_DIRS = [".agents/skills", ".agents/wisdom", "docs"]
const EXCLUDE_DIR_NODES = new Set([
  "node_modules",
  ".git",
  "references",
  // These skills necessarily quote the tells they teach — excluded from the
  // auto gate, reviewed by hand.
  "teach",
  "improve-codebase-architecture",
  "unslop",
])
const EXCLUDE_FILES = new Set(["descriptions.md"])

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIR_NODES.has(entry.name)) continue
      yield* walk(join(dir, entry.name))
    } else if (entry.isFile() && entry.name.endsWith(".md") && !EXCLUDE_FILES.has(entry.name)) {
      yield join(dir, entry.name)
    }
  }
}

function main(): void {
  let files = 0
  let errors = 0
  let warns = 0
  const all: Finding[] = []

  for (const scanDir of SCAN_DIRS) {
    const abs = join(ROOT, scanDir)
    if (!statSync(abs, { throwIfNoEntry: false })) continue
    for (const file of walk(abs)) {
      files++
      const text = readFileSync(file, "utf8")
      const findings = scanText(text, relative(ROOT, file))
      all.push(...findings)
    }
  }

  const errFindings = all.filter((f) => f.tier === "error")
  const warnFindings = all.filter((f) => f.tier === "warn")

  console.log(`\nunslop prose gate: ${files} markdown files scanned\n`)

  if (errFindings.length > 0) {
    console.log(`ERROR tier (${errFindings.length}) — fixes required:`)
    for (const f of errFindings) {
      console.log(`  ${f.file}:${f.line}  [${f.rule}]  ${f.snippet}`)
    }
    errors = errFindings.length
  } else {
    console.log("ERROR tier: clean (no filler / sycophancy tells found)")
  }

  if (warnFindings.length > 0) {
    console.log(`\nWARN tier (${warnFindings.length}) — advisory, review for real tells:`)
    // summarize by rule; list per-file counts
    const byFile = new Map<string, Map<string, number>>()
    for (const f of warnFindings) {
      if (!byFile.has(f.file)) byFile.set(f.file, new Map())
      const m = byFile.get(f.file)!
      m.set(f.rule.split("(")[0], (m.get(f.rule.split("(")[0]) ?? 0) + 1)
    }
    for (const [file, rules] of byFile) {
      console.log(`  ${file}: ${[...rules.entries()].map(([r, n]) => `${r}=${n}`).join(", ")}`)
    }
    warns = warnFindings.length
  }

  console.log(`\nTotal: ${warnFindings.length} warn / ${errors} error`)
  if (errors > 0) {
    console.error(`\n[check:unslop] ${errors} error-tier tell(s). Fix before shipping.`)
    process.exitCode = 1
  } else {
    console.log("[check:unslop] PASS")
  }
}

main()
