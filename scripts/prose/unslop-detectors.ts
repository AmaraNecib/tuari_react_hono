/**
 * Pure detection rules for the repo's prose gate (unslop, mechanically).
 *
 * These are meant to be cheap and deterministic so CI can enforce the worst
 * AI tells without an LLM. They intentionally are NOT a blanket style lint:
 * the repo keeps deliberate vocabulary (seam, tripwire, composition root,
 * depth/leverage/locality), so those words are never treated as tells here.
 *
 * Tiers:
 *  - error: automatic CI gate. Any hit fails `pnpm check:unslop`.
 *  - warn:  advisory. Printed for review, never fails the gate.
 */

export interface Finding {
  file: string
  line: number
  tier: "error" | "warn"
  rule: string
  snippet: string
}

/** Filler / padded phrases that carry no information. Case-insensitive. */
export const FILLER_PATTERNS: Array<{ rule: string; re: RegExp; note?: string }> = [
  { rule: "filler:Additionally", re: /(?:^|[.!?\s])(Additionally[,]?)/gm, note: "say 'and' or start the sentence" },
  { rule: "filler:It is important to note", re: /It is important to note/gi, note: "delete" },
  { rule: "filler:In order to", re: /In order to/gi, note: "use 'to'" },
  { rule: "filler:Due to the fact that", re: /Due to the fact that/gi, note: "use 'because'" },
  { rule: "filler:not just .*but", re: /not just\b[^.\n]{0,60}\bbut/gi, note: "state the point directly" },
  { rule: "filler:seamlessly", re: /\bseamlessly\b/gi, note: "cut or say how" },
  { rule: "filler:groundbreaking", re: /\bgroundbreaking\b/gi, note: "say what changed" },
  { rule: "filler:testament to", re: /\btestament to\b/gi, note: "say what happened" },
  // verb usage only: "underscores the…", not the branch/symbol noun
  { rule: "filler:underscore", re: /\bunderscores?\b(?=\s+(?:the|that|how|a|this))\s+/gi, note: "say the result" },
  { rule: "filler:It's worth noting", re: /It's worth noting|it is worth noting/gi, note: "delete" },
]

/** Sycophantic / chatbot artifacts. Case-insensitive. */
export const SYCOPHANCY_PATTERNS: Array<{ rule: string; re: RegExp }> = [
  { rule: "bot:Great question", re: /Great question!?/gi },
  { rule: "bot:You're absolutely right", re: /You.?re absolutely right/gi },
  { rule: "bot:Absolute correctness", re: /Absolutely, great|Perfect, great/gi },
  { rule: "bot:Found the smoking gun", re: /Found the smoking gun/gi },
  { rule: "bot:I hope this helps", re: /I hope this helps!?/gi },
]

/** Warn-only heuristics (advisory, not part of the error gate). */
export const WARN_PATTERNS: Array<{ rule: string; re: RegExp; note?: string }> = [
  { rule: "warn:em-dash", re: /—/g, note: "prefer period or comma; em dash is an AI tell" },
  { rule: "warn:chained-em-dash", re: /—[^—\n]{0,80}—/, note: "two dashes in one clause" },
  {
    rule: "warn:inline-bold-label",
    // a bold label followed by a colon at the start of a line
    re: /^\s*[-*]?\s*\*\*[^*:]{1,40}:\*\*/m,
    note: "convert to prose unless the label adds new info",
  },
]

/** Detect error-tier filler / sycophancy on a single line. */
export function detectErrorTells(line: string): Array<{ rule: string; note?: string }> {
  const hits: Array<{ rule: string; note?: string }> = []
  for (const p of FILLER_PATTERNS) {
    p.re.lastIndex = 0 // global flags advance lastIndex; reset so lines don't hide later matches
    if (p.re.test(line)) hits.push({ rule: p.rule, note: p.note })
  }
  for (const p of SYCOPHANCY_PATTERNS) {
    p.re.lastIndex = 0
    if (p.re.test(line)) hits.push({ rule: p.rule })
  }
  return hits
}

/** Detect warn-tier tells (counts / advisory) on a single line. */
export function detectWarnTells(line: string): Array<{ rule: string; count: number; note?: string }> {
  const hits: Array<{ rule: string; count: number; note?: string }> = []
  for (const p of WARN_PATTERNS) {
    const matches = line.match(p.re)
    if (matches && matches.length > 0) {
      hits.push({ rule: p.rule, count: matches.length, note: p.note })
    }
  }
  return hits
}

function stripCode(text: string): string {
  // blank out fenced code blocks and inline code spans so prose rules never fire on code
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/\S/g, " "))
    .replace(/`[^`]*`/g, (m) => m.replace(/\S/g, " "))
}

/**
 * Scan a whole file's text and return every finding with line numbers.
 * Returns the full list; the caller decides fail-on-error.
 */
export function scanText(text: string, file: string): Finding[] {
  const findings: Finding[] = []
  const prose = stripCode(text)
  const lines = prose.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    for (const hit of detectErrorTells(line)) {
      findings.push({ file, line: i + 1, tier: "error", rule: hit.rule, snippet: line.trim().slice(0, 120) })
    }
    for (const hit of detectWarnTells(line)) {
      findings.push({
        file,
        line: i + 1,
        tier: "warn",
        rule: hit.count > 1 ? `${hit.rule}(${hit.count}x)` : hit.rule,
        snippet: line.trim().slice(0, 120),
      })
    }
  }
  return findings
}
