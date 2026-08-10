#!/usr/bin/env node
/**
 * i18n key drift checker for @tuari/web.
 *
 * Scans every t() call in apps/web/src and verifies the literal key exists in
 * apps/web/src/i18n/resources/ar.ts (single "translation" namespace).
 *
 * Exit codes:
 *   0 – no missing keys (fallback-only gaps and dynamic keys are warnings)
 *   1 – at least one literal key is missing WITHOUT a fallback arg
 *        (i18next returns the key itself → raw key rendered in the UI)
 *   2 – usage error / cannot parse resources
 *
 * Usage:
 *   node scripts/check-i18n-keys.mjs [--report] [--json] [--allow-dynamic <pattern>]
 *
 *   --report   print the full missing/warn lists (default: concise summary)
 *   --json     print machine-readable JSON to stdout
 *   --allow-dynamic <pattern>   regex of dynamic/template keys treated as reviewed
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)))
const resourcesPath = join(rootDir, "apps/web/src/i18n/resources/ar.ts")
const scanDir = join(rootDir, "apps/web/src")
const ignoreDirs = new Set(["i18n"])

// ── 1. Parse resources ──────────────────────────────────────────────────────
function parseResources(filePath) {
  const source = readFileSync(filePath, "utf8")
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
    },
  }).outputText

  const assignIndex = transpiled.lastIndexOf("exports.ar = ")
  if (assignIndex === -1) {
    throw new Error("ar.ts transpiled output has no exports.ar assignment")
  }
  const body = transpiled
    .slice(assignIndex)
    .replace(/^exports\.ar = /, "")
    .replace(/\s*;\s*$/, "")

  // eslint-disable-next-line no-new-func
  const ar = Function(`"use strict"; return (${body});`)()
  if (!ar || typeof ar !== "object" || !("translation" in ar)) {
    throw new Error(`ar.ts did not parse into { translation: ... }`)
  }
  return ar.translation
}

function hasKey(resource, dottedKey) {
  let node = resource
  for (const part of dottedKey.split(".")) {
    if (node === null || typeof node !== "object" || !(part in node)) {
      return false
    }
    node = node[part]
  }
  return true
}

// ── 2. Scan t() call sites ──────────────────────────────────────────────────
const dynamicKeyPatterns = new Set()
function collectDynamicPatterns(argv) {
  const flagIndex = argv.indexOf("--allow-dynamic")
  if (flagIndex !== -1 && argv[flagIndex + 1]) {
    dynamicKeyPatterns.add(argv[flagIndex + 1])
  }
}

function isTCall(callee) {
  if (ts.isIdentifier(callee) && callee.text === "t") {
    return true
  }
  if (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "t" &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "i18n"
  ) {
    return true
  }
  // useTranslation().t(...)
  if (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "t" &&
    ts.isCallExpression(callee.expression) &&
    ts.isIdentifier(callee.expression.expression) &&
    callee.expression.expression.text === "useTranslation"
  ) {
    return true
  }
  return false
}

/** Extract a literal key from the first arg; null when dynamic. */
function extractKey(arg) {
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    return arg.text
  }
  if (ts.isTemplateExpression(arg)) {
    // t(`literal.${x}.more`) — only constant if every span is a literal
    const head = arg.head.text
    const tail = arg.templateSpans.every((span) => ts.isLiteralExpression(span.expression))
      ? arg.templateSpans.map((span) => span.literal.text).join("")
      : null
    if (tail !== null) {
      return head + tail
    }
  }
  return null
}

function walkSourceFile(sourceFile, results) {
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (isTCall(callee)) {
        const firstArg = node.arguments[0]
        if (!firstArg) {
          return
        }
        const key = extractKey(firstArg)
        const secondArg = node.arguments[1]
        const hasTextFallback =
          secondArg !== undefined &&
          (ts.isStringLiteral(secondArg) ||
            ts.isTemplateLiteral(secondArg) ||
            ts.isNoSubstitutionTemplateLiteral(secondArg))
        const fallback =
          secondArg &&
          (ts.isStringLiteral(secondArg) || ts.isNoSubstitutionTemplateLiteral(secondArg))
            ? secondArg.text
            : null
        const sourcePos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        const location = `${relative(rootDir, sourceFile.fileName)}:${sourcePos.line + 1}`
        results.push({ key, hasFallback: hasTextFallback, fallback, location, source: firstArg.getText(sourceFile) })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

function collectTsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (ignoreDirs.has(entry)) {
      continue
    }
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      collectTsFiles(full, out)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

// ── 3. Report ───────────────────────────────────────────────────────────────
function summarize(calls, resource) {
  const missing = [] // literal key missing, no fallback → hard fail
  const fallbackGaps = [] // literal key missing but fallback provided → warn
  const redundantFallbacks = [] // key exists AND inline fallback duplicates the resource → warn
  const dynamic = [] // key not statically resolvable → manual review
  const present = new Map()

  for (const call of calls) {
    if (call.key === null) {
      dynamic.push(call)
      continue
    }
    const keyExists = hasKey(resource, call.key)
    if (keyExists) {
      present.set(call.key, (present.get(call.key) ?? 0) + 1)
      if (call.fallback !== null && call.fallback === getPath(resource, call.key)) {
        redundantFallbacks.push(call)
      }
      continue
    }
    if (dynamicKeyPatterns.size > 0 && [...dynamicKeyPatterns].some((p) => new RegExp(p).test(call.key))) {
      present.set(call.key, (present.get(call.key) ?? 0) + 1)
      continue
    }
    if (call.hasFallback) {
      fallbackGaps.push(call)
    } else {
      missing.push(call)
    }
  }

  return { missing, fallbackGaps, redundantFallbacks, dynamic, present }
}

function getPath(obj, dottedKey) {
  let node = obj
  for (const part of dottedKey.split(".")) {
    if (node === null || typeof node !== "object" || !(part in node)) {
      return undefined
    }
    node = node[part]
  }
  return node
}

function main() {
  const argv = process.argv.slice(2)
  collectDynamicPatterns(argv)
  const wantReport = argv.includes("--report")
  const wantJson = argv.includes("--json")

  let resource
  try {
    resource = parseResources(resourcesPath)
  } catch (error) {
    console.error(`check-i18n-keys: cannot parse resources: ${error.message}`)
    process.exit(2)
  }

  const calls = []
  for (const file of collectTsFiles(scanDir)) {
    const sourceText = readFileSync(file, "utf8")
    const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    walkSourceFile(sourceFile, calls)
  }

  const { missing, fallbackGaps, redundantFallbacks, dynamic, present } = summarize(calls, resource)

  if (wantJson) {
    console.log(
      JSON.stringify(
        {
          totalCalls: calls.length,
          presentKeys: present.size,
          missing: missing.map((c) => ({ key: c.key, location: c.location })),
          fallbackGaps: fallbackGaps.map((c) => ({ key: c.key, fallback: c.fallback, location: c.location })),
          redundantFallbacks: redundantFallbacks.map((c) => ({ key: c.key, location: c.location })),
          dynamic: dynamic.map((c) => ({ key: c.source, location: c.location })),
        },
        null,
        2,
      ),
    )
  } else {
    console.log(`i18n key check — ${calls.length} t() calls, ${present.size} distinct present keys`)
    console.log(`  missing (no fallback → renders raw key): ${missing.length}`)
    console.log(`  fallback-only gaps (warn): ${fallbackGaps.length}`)
    console.log(`  redundant fallbacks (key exists, warn): ${redundantFallbacks.length}`)
    console.log(`  dynamic keys (manual review): ${dynamic.length}`)

    if (wantReport) {
      const byPrefix = (list) => {
        const groups = new Map()
        for (const c of list) {
          const prefix = c.key.split(".").slice(0, -1).join(".") || "(root)"
          if (!groups.has(prefix)) groups.set(prefix, [])
          groups.get(prefix).push(c)
        }
        return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      }
      for (const [prefix, items] of byPrefix(missing)) {
        console.log(`\n[missing] ${prefix}`)
        for (const c of items) {
          console.log(`  ${c.key}  ← ${c.location}`)
        }
      }
      if (fallbackGaps.length > 0) {
        console.log("\n[fallback-only gaps]")
        for (const c of fallbackGaps) {
          console.log(`  ${c.key}  ← ${c.location}`)
        }
      }
      if (dynamic.length > 0) {
        console.log("\n[dynamic — manual review]")
        for (const c of dynamic) {
          console.log(`  ${c.source}  ← ${c.location}`)
        }
      }
    }
  }

  process.exit(missing.length > 0 ? 1 : 0)
}

main()
