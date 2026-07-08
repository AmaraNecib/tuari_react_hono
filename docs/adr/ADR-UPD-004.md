# ADR-UPD-004 — Release Pipeline: GitHub Actions with Environments for Approval Gates

**Status:** Accepted  
**Date:** 2026-07-08

### Decision

Use **GitHub Actions** as the CI/CD platform with **GitHub Environments** providing manual approval gates for production releases. The pipeline builds, signs, and publishes artifacts to release channels using environment-specific secrets.

### Key Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| CI platform | GitHub Actions | Zero additional infrastructure; the project already uses GitHub for source control and issue tracking |
| Approval gates | GitHub Environments (`beta`, `stable`) | Built-in manual approval workflow before production deployment |
| Signing | Dev key in CI variables; production key in air-gapped environment | Dev key enables automated nightly builds; production key requires human authorization |
| Artifact storage | GitHub Release (stable) + workflow artifacts (nightly/beta) | Avoids external artifact storage costs |
| Channel management | Tag-based triggers (`v*` = stable, `v*-beta*` = beta) plus schedule trigger (nightly) | Clear separation between channel promotions |

### Rationale

- GitHub Environments provide native deployment protection rules: required reviewers, wait timers, and environment-specific secrets. This satisfies the signing ceremony requirement without external tooling.
- Environment-specific secrets ensure the production signing key is only accessible during approved `stable` releases, never during development builds or PR workflows.
- The alternative — a dedicated CI/CD service (Jenkins, Buildkite, GitLab CI) — introduces a second infrastructure surface to maintain, secure, and integrate with GitHub.
- The alternative — self-hosted runners with hardware security modules (HSMs) — is premature for the current scale but can be introduced later when the production key is promoted to HSM-backed signing.
- GitHub Actions minutes cost is acceptable at the current scale (~3-5 release builds per milestone).
- Production signing key as a GitHub secret (in the `stable` environment) is adequate until HSM-backed signing is justified by release volume or compliance requirements.

### Consequences

- A GitHub Actions workflow must be created for each release channel (nightly, beta, stable), with appropriate trigger conditions and environment bindings.
- The production signing key must be a manually provisioned GitHub secret in the `stable` environment, never exposed in logs or workflow artifacts.
- The beta channel must use the same secrets as stable but with a `-preview.N` version suffix and a pending approval gate.
- All release workflows must produce, sign, and upload: installer, portable package, update package, update metadata (`updates.json`), and changelog.
- The CI workflow must verify that release builds are triggered only from allowed branches (`develop`, `release/*`, `main`).
- Promotion of an artifact between channels (e.g., beta → stable) does not require re-signing if the same key was used. If the key differs, re-signing is required.
- A release checklist or release-notes step must be included in the workflow to ensure changelog completeness before publishing.

### References

- **Architecture:** `docs/update-architecture.md` §8 (Build Pipeline), §9 (Release Pipeline), §11 (Release Channels), §12 (Artifact Responsibilities)
- **ADR-RCA-001:** Rust Core Architecture
