## better-auth dedupe: per-package resolution keeps two physical copies (🟡 Minor)

The API resolved `better-auth@1.6.20` while the web app resolved `1.6.2`
(vulnerable line). Two physical copies in `node_modules/.pnpm/` because each
workspace package declares its own specifier. Confirm divergence with
`pnpm --filter <pkg> why better-auth` and by listing
`node_modules/.pnpm/better-auth@*`; fix = align the web specifier to the
patched line (`^1.6.20`), dedupe the lockfile, and handle the `tar ≤7.5.18`
(sqlcipher toolchain, resolves to deprecated `tar@4.4.19`) via a root
`pnpm.overrides` entry.

**Always**: for security-version dedupes, check every importer's specifier:
`^1.6.2` and `^1.6.20` look compatible but resolve to different lines and
silently keep the vulnerable copy alive in the lockfile.


