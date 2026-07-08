#!/usr/bin/env bash
# sign-update-integration.sh — End-to-end integration test
#
# Tests that a manifest signed with the Node.js CLI can be verified
# by the Rust verify_package_signature() function.
#
# Usage: bash tests/sign-update-integration.sh
# Requires: Node.js, Rust toolchain

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== M6.1 Integration Test: CLI Sign + Rust Verify ==="
echo ""

# Step 1: Run Node.js unit tests
echo "--- Step 1: Node.js unit tests ---"
node --test "$PROJECT_ROOT/tests/sign-update.test.mjs"
echo ""

# Step 2: Run Rust cross-language integration test
# The test is #[ignore]'d because it requires Node.js in PATH.
# Pass --include-ignored to run it explicitly.
echo "--- Step 2: Rust cross-language integration test (--include-ignored) ---"
cd "$PROJECT_ROOT"
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  -- cli_signed_manifest_rust_verification --include-ignored 2>&1 | grep -E "(test |running|result|ok|FAILED)"
echo ""

echo "=== Integration Test Complete ==="
