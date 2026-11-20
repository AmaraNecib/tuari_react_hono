# Default exact startup

The normal API entry (`apps/api/src/index.ts`) now composes `createFreshExactAppDependencies`. The API package build and desktop sidecar both bundle that same entry, so both select the same root. The selected root validates SQLite metadata and the fresh exact schema; incompatible or unsupported databases fail startup rather than falling back to the retired numeric composition root.

This change does not migrate, rename, delete, or convert existing database files. It does not remove legacy services, alter schemas/contracts, or mount new reports/navigation. Existing server config, auth, license, bootstrap, backup, health, and shutdown wiring remains in place.

Verification required: exercise fresh plain and keyed startup, authenticated HTTP, reopen, incompatible-file refusal without mutation, plus focused config/license/bootstrap/health/backup/shutdown coverage. Packaging source inspection confirms shared entry only; it is not installed desktop execution proof. CI-final remains pending.
