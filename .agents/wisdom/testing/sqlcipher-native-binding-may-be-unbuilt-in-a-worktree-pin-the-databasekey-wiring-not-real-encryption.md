## Exercise encryption with the shipped prebuilds (Major)

`better-sqlite3-multiple-ciphers@13.0.3` ships native binaries in
`prebuilds/<platform>-<arch>.node`, including Windows x64. A frozen install
provides them without compiling. Its loader also distinguishes Linux musl.
Do not add it to `onlyBuiltDependencies` or run a rebuild to find the addon.

**Always**: use real keyed factory and snapshot tests on supported hosts.
Do not strip a configured key to make an encryption test pass. Wiring-only
mocks are not encryption evidence. Configure `cipher='sqlcipher'`, then
`legacy=4`, then the key on every connection. `cipher_compatibility=4` is
ignored by this driver. Configuration readback and self-roundtrips do not prove
interoperability; the independent upstream SQLCipher 4 fixture test does prove
known-file reading. Packaging must load the copied prebuild, not just find it.

Seen in: #501; retained in #504.
