#!/usr/bin/env node
/**
 * Strip redundant inline fallbacks: `t("key", "exact-resource-value")` →
 * `t("key")` when the fallback string is byte-identical to the resource value
 * (pure no-op at runtime — the resource always wins when the key exists).
 *
 * Byte-preserving: uses AST positions to remove only the `, "fallback"` span.
 * Run from repo root: node scripts/strip-redundant-i18n-fallbacks.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)))
const resourcesPath = join(rootDir, "apps/web/src/i18n/resources/ar.ts")
const scanDir = join(rootDir, "apps/web/src")
const ignoreDirs = new Set(["i18n"])

function parseResources() {
  const source = readFileSync(resourcesPath, "utf8")
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText
  const assignIndex = transpiled.lastIndexOf("exports.ar = ")
  const body = transpiled.slice(assignIndex).replace(/^exports\.ar = /, "").replace(/\s*;\s*$/, "")
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${body});`)().translation
}

function getPath(obj, dottedKey) {
  let node = obj
  for (const part of dottedKey.split(".")) {
    if (node === null || typeof node !== "object" || !(part in node)) return undefined
    node = node[part]
  }
  return node
}

function isTCall(callee) {
  if (ts.isIdentifier(callee) && callee.text === "t") return true
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === "t" && ts.isIdentifier(callee.expression) && callee.expression.text === "i18n") return true
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

function collectTsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (ignoreDirs.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collectTsFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const dryRun = process.argv.includes("--dry-run")

function main() {
  const resource = parseResources()
  let filesChanged = 0
  let callsStripped = 0

  for (const file of collectTsFiles(scanDir)) {
    const sourceText = readFileSync(file, "utf8")
    const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const removals = []

    const visit = (node) => {
      if (ts.isCallExpression(node) && isTCall(node.expression)) {
        const args = node.arguments
        if (args.length === 2) {
          const [keyArg, fallbackArg] = args
          const key = ts.isStringLiteral(keyArg) || ts.isNoSubstitutionTemplateLiteral(keyArg) ? keyArg.text : null
          if (key && ts.isStringLiteral(fallbackArg)) {
            const resourceValue = getPath(resource, key)
            if (typeof resourceValue === "string" && resourceValue === fallbackArg.text) {
              // Remove the span `, "fallback"` — verify it contains only the comma + whitespace + literal
              const between = sourceText.slice(keyArg.end, fallbackArg.end)
              if (/^\s*,\s*$/.test(sourceText.slice(keyArg.end, fallbackArg.getStart(sourceFile)))) {
                removals.push({ start: keyArg.end, end: fallbackArg.end })
              } else {
                console.log(`skip (non-trivial between-args text): ${relative(rootDir, file)}`)
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)

    if (removals.length === 0) continue

    // Apply removals right-to-left so positions stay valid
    let next = sourceText
    for (const { start, end } of removals.sort((a, b) => b.start - a.start)) {
      next = next.slice(0, start) + next.slice(end)
    }
    filesChanged++
    callsStripped += removals.length
    if (dryRun) {
      console.log(`${relative(rootDir, file)}: would strip ${removals.length} fallback(s)`)
    } else {
      writeFileSync(file, next)
    }
  }

  console.log(dryRun ? `[dry-run] ${filesChanged} files, ${callsStripped} redundant fallbacks` : `stripped ${callsStripped} redundant fallbacks across ${filesChanged} files`)
}

main()
