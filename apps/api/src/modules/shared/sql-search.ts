/**
 * Escape a user search term for use in a SQL `LIKE` pattern.
 *
 * Escapes the wildcards (`%`, `_`) and the `\` escape char itself so a term
 * matches literally instead of being interpreted as a pattern. SQLite's `LIKE`
 * has no default escape char, so every caller must pair this with
 * `ESCAPE '\'` (a single backslash in the emitted SQL).
 *
 * Shared so the employee search and the item-definition search cannot drift in
 * how they escape a term.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
