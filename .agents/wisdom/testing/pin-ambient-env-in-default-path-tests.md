## Pin ambient env in default-path tests (🟡 Minor)

A test asserting the *default* config path (`createAppConfig()` with no source)
reads the real `process.env`: `DB_ADAPTER`, `TUARI_CONFIG_FILE`, `NODE_ENV`
pollution from the shell can flip the result. Use `vi.stubEnv(...)` + `afterEach(vi.unstubAllEnvs)`.

