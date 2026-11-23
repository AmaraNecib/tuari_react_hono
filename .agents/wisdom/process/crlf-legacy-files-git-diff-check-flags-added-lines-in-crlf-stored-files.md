## CRLF legacy files: `git diff --check` flags added lines in CRLF-stored files (🟢 Minor)

A few files in this repo are committed CRLF (verified byte-level: base blob
100% CRLF — e.g. schema-definitions.ts, company.types.ts,
company.repository-mappers.ts, company.test-helpers.ts, contracts/index.test.ts,
debts-mvp-web.test.tsx). Adding lines to them with LF trips
`git diff --check` ("trailing whitespace", i.e. the CR). Neither `.husky/pre-push`
nor CI runs `--check`, so it's noise — but keep the file's own EOL convention
(append CRLF in CRLF files) so whole-file diffs stay small and the whistles
stay quiet. Normalize with a byte-safe pass (`readFileSync` → replace
`/\r?\n/g` with `\r\n`), never sed.

