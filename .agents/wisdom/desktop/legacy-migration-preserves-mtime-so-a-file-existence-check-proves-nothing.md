## Legacy migration preserves mtime, so a file-existence check proves nothing (🟠 Major)

`ensure_runtime_files` migrates an allowlisted legacy database from
`Documents/Tuari` (or `%PUBLIC%\Documents\Tuari`) into the data dir with
`std::fs::copy`, which preserves the source timestamp. A "the app created the
database" assertion that only tests for the file passes on a migrated copy that
is months old, so the smoke test can go green while the sidecar never ran.

**Always**: when proving an app created state, compare the file mtime against the
run start, not just existence. Same rule for any check that a crashed process
could satisfy through a repair or migration path.
