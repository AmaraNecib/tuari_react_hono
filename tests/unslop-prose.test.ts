import { test } from "node:test"
import assert from "node:assert/strict"

import { detectErrorTells, detectWarnTells, scanText } from "../scripts/prose/unslop-detectors.ts"

test("detectErrorTells flags filler phrases", () => {
  assert.ok(detectErrorTells("Additionally, the write path is fast.").some((h) => h.rule === "filler:Additionally"))
  assert.ok(detectErrorTells("It is important to note that we retry.").some((h) => h.rule === "filler:It is important to note"))
  assert.ok(detectErrorTells("In order to ship, we test.").some((h) => h.rule === "filler:In order to"))
  assert.ok(detectErrorTells("not just fast but safe").some((h) => h.rule === "filler:not just .*but"))
})

test("detectErrorTells flags sycophancy", () => {
  assert.ok(detectErrorTells("Great question! Let me look.").some((h) => h.rule === "bot:Great question"))
  assert.ok(detectErrorTells("You're absolutely right.").some((h) => h.rule === "bot:You're absolutely right"))
})

test("detectErrorTells leaves plain prose and intentional vocab untouched", () => {
  assert.deepEqual(detectErrorTells("The seam carries leverage; the tripwire guards coverage."), [])
  assert.deepEqual(detectErrorTells("A plain sentence without tells."), [])
})

test("detectWarnTells counts em dashes and flags chains", () => {
  const single = detectWarnTells("pick a seam — and test it")
  assert.ok(single.some((h) => h.rule === "warn:em-dash"))
  const chained = detectWarnTells("one — two — three")
  assert.ok(chained.some((h) => h.rule === "warn:chained-em-dash"))
})

test("detectWarnTells flags inline bold-label headers", () => {
  assert.ok(
    detectWarnTells("- **Performance:** Performance improved a lot.").some(
      (h) => h.rule === "warn:inline-bold-label",
    ),
  )
})

test("detectErrorTells does not drop later matches across lines (global regex lastIndex)", () => {
  // both lines must be flagged; without lastIndex reset the second was skipped
  const a = detectErrorTells("Additionally, this is padded.")
  const b = detectErrorTells("Additionally, this is padded too.")
  assert.ok(a.some((h) => h.rule === "filler:Additionally"))
  assert.ok(b.some((h) => h.rule === "filler:Additionally"))
})

test("scanText reports line numbers and tiers", () => {
  const text = "fine line\nAdditionally, this is padded.\nAlso — chained — dashes here."
  const findings = scanText(text, "doc.md")
  assert.ok(findings.some((f) => f.tier === "error" && f.line === 2))
  assert.ok(findings.some((f) => f.tier === "warn" && f.line === 3))
})
