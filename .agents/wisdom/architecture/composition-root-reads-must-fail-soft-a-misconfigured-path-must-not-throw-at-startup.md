## Composition-root reads must fail soft: a misconfigured path must not throw at startup (🟠 Major)

On #430 the daily-backup service seeded its status by listing the backups root
from `createAppDependencies`. The guard was `existsSync`, so a root that existed
as a *file* (any non-directory) made `readdirSync` throw ENOTDIR during
dependency construction: the API could not start. That is exactly the
"never block startup" property the feature is required to have, and the service's
own failure path already caught everything inside `runDueBackup` — the gap was a
read that runs *before* any try/catch, at composition time.

**Always**: probe a path an operator can misconfigure with a non-throwing
`isDirectory()` (stat inside try/catch, false on error), not `existsSync` +
`readdirSync`. Construction-time reads run before the app can report anything, so
a throw there is a startup outage; let the misconfiguration surface later as a
non-fatal run failure. And when a required field is added to a config schema,
grep the hand-built `appConfigSchema.parse` / `AppConfig` fixtures — the full
suite caught one that the typecheck could not.

