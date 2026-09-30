// @vitest-environment node
//
// The theme-contrast fixes live in raw CSS, which no jsdom test can evaluate:
// vitest has no style pipeline, jsdom does not paint `::selection`, and the
// native `<select>` popup belongs to the platform. These hygiene tests read the
// stylesheet source and pin the tokens, so reverting to a hard-coded colour or
// re-adding the `<option>` override fails here.

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const webRoot = resolve(__dirname, "../..")
const srcRoot = resolve(webRoot, "src")
const stylesCss = readFileSync(resolve(srcRoot, "styles.css"), "utf8")

describe("theme contrast hygiene", () => {
  it("mixes ::selection toward the theme surface, never a hard-coded white", () => {
    const selectionRule = stylesCss.match(/::selection\s*\{[^}]*\}/)?.[0] ?? ""
    // Positive control: the rule exists at all.
    expect(selectionRule).not.toBe("")
    expect(selectionRule).toContain("color-mix(in oklab, var(--primary) 24%, var(--surface))")
    // A literal `white` is light in both themes, so dark mode got a near-white
    // highlight under light --foreground text (the invisible-selection bug).
    expect(stylesCss).not.toMatch(/color-mix\([^)]*\bwhite\b/)
  })

  it("leaves the native select popup to the platform and pins color-scheme per theme", () => {
    expect(stylesCss).toMatch(/select\s*\{[^}]*color-scheme:\s*light/)
    expect(stylesCss).toMatch(/\.dark\s+select\s*\{[^}]*color-scheme:\s*dark/)
    // Styling <option> overrides the OS highlight's own text colour, which is
    // what made a hovered dark-mode option unreadable.
    expect(stylesCss).not.toMatch(/select\s+option\s*\{/)
  })

  it("keeps the placeholder token pair on a single shared definition", () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) {
          continue
        }
        const source = readFileSync(full, "utf8")
        // `data-placeholder:` is Base UI's trigger state and a different rule,
        // so only count the bare `placeholder:` utility.
        if (/(?<!data-)placeholder:text-muted-foreground\/80/.test(source)) {
          offenders.push(relative(srcRoot, full).split("\\").join("/"))
        }
      }
    }
    walk(srcRoot)
    expect(offenders).toEqual(["components/ui/form-controls.tsx"])
  })
})
