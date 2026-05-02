# Desktop Auth Boundary

## Current native command surface

The desktop runtime keeps bearer tokens in native Rust state / secure storage and does not expose a token getter to renderer code.

Renderer-safe commands in `apps/desktop/src-tauri/src/lib.rs`:

- `desktop_sign_in`: performs credential sign-in natively and persists the resulting token without returning it to the renderer.
- `desktop_sign_out`: clears native token state and server session state.
- `desktop_change_password`: performs password rotation natively and updates stored token state when the API returns a replacement token.
- `desktop_api_request`: performs authenticated API/RPC requests natively. Renderer-provided `authorization`, `cookie`, `host`, `origin`, and `content-length` headers are rejected.

## Request bridge scope

`desktop_api_request` is intentionally limited to Tuari sidecar API paths. It must not be widened to arbitrary localhost or filesystem access. Browser mode continues to use the normal HTTP/oRPC transport.

## Compatibility rule

Future desktop auth work must preserve this invariant: renderer code may request authenticated operations, but must not receive or persist raw bearer tokens.
