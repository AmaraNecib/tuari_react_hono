## Desktop settings ride the config file the shell already forwards (💡 Design Principle)

The desktop shell clears the sidecar environment and forwards only an allowlist;
`APP_BACKUPS_ROOT` was not on it, so a desktop backup-folder setting had no way
through. Adding each setting to the shell's forward list makes Rust the
bottleneck. The shell already sets `TUARI_CONFIG_FILE=<tuari>/config.json`, and
`createAppConfig` merges that file (env wins) — so a user-editable setting
belongs in `configFileSchema` + `mergeConfigIntoEnv` and reaches the next
sidecar start with **no Rust change**. The forgetting risk is forgetting to
forward a *new* env var; the config-file path side-steps the whole class.

**Always**: before adding a variable to the desktop shell's forward list, check
whether the setting can ride `config.json`. Write it through
`infrastructure/config/config-file-writer.ts` (atomic read-modify-write,
preserves unrelated fields, rejects a merged config the loader would reject) —
never copy that write protocol into a second persister.

