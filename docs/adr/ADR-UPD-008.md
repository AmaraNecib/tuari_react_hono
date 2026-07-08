# ADR-UPD-008 — Enterprise Networking: Environment Variables for Proxy Configuration

**Status:** Accepted  
**Date:** 2026-07-08

### Decision

Use the standard proxy environment variables (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`) for all HTTP client traffic from the Updater Engine and the API. No application-specific proxy configuration UI or config file is introduced.

The proxy environment variables are **inherited from the system environment** at process startup. The application does not read proxy configuration from any other source (config files, registry, or UI).

When the application starts a sidecar process, the proxy environment variables **must be sanitized** before being passed to the sidecar. Specifically:
- `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` are the only proxy variables forwarded.
- Credentials embedded in the proxy URL (e.g., `http://user:pass@proxy:8080`) must be stripped before passing to the sidecar unless the sidecar explicitly requires proxy credentials.
- Values containing sensitive information (e.g., API tokens, internal network paths) in any variable must not be logged.
- `127.0.0.1` and `localhost` must be appended to `NO_PROXY` to ensure local API requests are never proxied.

### Rationale

- Standard practice: `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` are universally recognized by all major HTTP client libraries (Rust `reqwest`, Node.js `undici`, `curl`, etc.). No application code is needed to interpret them.
- Zero configuration for enterprise users: Active Directory, Group Policy, and system proxy settings already set these environment variables. The application picks them up automatically.
- The alternative — an application-specific proxy configuration file — would duplicate what the operating system and enterprise management tools already provide.
- The alternative — a UI for proxy settings — increases development and maintenance effort for a setting that is typically managed centrally in enterprise environments.
- Proxy credentials embedded in URLs must be sanitized before forwarding to the sidecar because the sidecar may log its environment for debugging, potentially exposing credentials. The main application can strip the credentials and, if needed, configure the proxy via a more secure mechanism (e.g., a proxy authentication token injected into the sidecar request headers).

### Consequences

- All HTTP requests from the Updater Engine (download update package, fetch metadata) and the API (update metadata queries) must use HTTP clients that respect the standard proxy variables. Rust `reqwest` does this by default. Node.js `fetch` (undici) does not; the API must explicitly configure its HTTP client to respect proxy env vars.
- The sidecar lifecycle management code must sanitize the environment block before spawning the sidecar process.
- A validation step must be added to startup: verify that both `HTTP_PROXY` and `HTTPS_PROXY` have a valid scheme (one of `http://` or `https://`). Reject values with no scheme or an unsupported scheme. Note that `HTTPS_PROXY` may use `http://` — the proxy itself is contacted via HTTP and HTTPS traffic is tunnelled through it via `CONNECT`.
- Enterprise users who need proxy authentication must configure it at the system level (e.g., `HTTPS_PROXY=http://user:pass@proxy:8080`). Credential stripping applies only when forwarding to the sidecar, not to the main process.
- The `NO_PROXY` variable must be respected: the application must not bypass `NO_PROXY` entries, even for internal services like the local API on `127.0.0.1`.
- The application **must hardcode `127.0.0.1` and `localhost` in the proxy bypass list**, regardless of the `NO_PROXY` environment variable. This is critical because:
  - The post-update smoke test contacts `http://127.0.0.1:4318/health` and would incorrectly route through the corporate proxy if bypass is missing.
  - The local API sidecar is always on `127.0.0.1` and must never be proxied.
  - Enterprise environments often set `HTTP_PROXY` globally without a corresponding `NO_PROXY`, causing local requests to fail.
- Documentation must clearly state: "Tuari respects the standard `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` environment variables. Configure your proxy at the system or user environment level."

### References

- **Architecture:** `docs/update-architecture.md` §15 (Update Provider Abstraction), §27 (ADR Index)
- **ADR-RCA-001:** Rust Core Architecture
