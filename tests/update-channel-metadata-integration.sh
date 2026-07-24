#!/usr/bin/env bash
# update-channel-metadata-integration.sh — Integration test for release channel metadata
#
# Tests that:
# 1. updates.json can be generated for all three channels
# 2. Channel promotion (nightly -> beta -> stable) works by merging
#
# Usage: bash tests/update-channel-metadata-integration.sh
# Requires: Node.js

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== M6.3 Integration Test: Release Channel Metadata ==="
echo ""

# Create a temporary directory using node for cross-platform path handling.
# Normalize backslashes to forward slashes for cross-shell compatibility.
TEST_DIR=$(node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-int-'));
console.log(tmp.replace(/\\\\/g, '/'));
")
trap 'rm -rf "$TEST_DIR"' EXIT

echo "Test dir: $TEST_DIR"

# Helper: read a dotted-path field from a JSON file via the _json-helper.mjs
# script. Avoids inline `node -e` arg-index ambiguity.
read_json_field() {
  node "$SCRIPT_DIR/_json-helper.mjs" "$1" "$2"
}

echo "--- Step 1: Generate nightly updates.json ---"
node "$PROJECT_ROOT/scripts/update-channel-metadata.mjs" \
  --channel nightly \
  --version "0.6.0-nightly.20260708" \
  --min-version "0.1.0" \
  --url "https://github.com/AmaraNecib/tuari_react_hono/releases/nightly/download/update-0.6.0-nightly.update" \
  --release-date "2026-07-08T00:00:00Z" \
  --changelog "https://github.com/AmaraNecib/tuari_react_hono/releases/nightly" \
  --output "$TEST_DIR/updates.json"
echo "  ✅ Nightly generated"

# Validate nightly
NIGHTLY_VER=$(read_json_field "$TEST_DIR/updates.json" "channels.nightly.latestVersion")
if [ "$NIGHTLY_VER" != "0.6.0-nightly.20260708" ]; then
  echo "  ❌ Nightly version mismatch: $NIGHTLY_VER"
  exit 1
fi
echo "  ✅ Nightly version correct: $NIGHTLY_VER"

echo ""
echo "--- Step 2: Promote nightly to beta (merge) ---"
node "$PROJECT_ROOT/scripts/update-channel-metadata.mjs" \
  --channel beta \
  --version "0.6.0-nightly.20260708" \
  --min-version "0.1.0" \
  --url "https://github.com/AmaraNecib/tuari_react_hono/releases/beta/download/update-0.6.0-nightly.update" \
  --release-date "2026-07-08T00:00:00Z" \
  --changelog "https://github.com/AmaraNecib/tuari_react_hono/releases/beta" \
  --merge "$TEST_DIR/updates.json" \
  --output "$TEST_DIR/updates.json"
echo "  ✅ Beta merged"

# Validate both channels exist (exit 0 = found; anything else is an error)
CHANNEL_COUNT=$(read_json_field "$TEST_DIR/updates.json" "channels" | node -e "
const j = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log(Object.keys(j).length);
")
if [ "$CHANNEL_COUNT" -ne 2 ]; then
  echo "  ❌ Expected 2 channels, got $CHANNEL_COUNT"
  exit 1
fi
echo "  ✅ Both nightly and beta channels present ($CHANNEL_COUNT channels)"

# Validate nightly was preserved
NIGHTLY_URL=$(read_json_field "$TEST_DIR/updates.json" "channels.nightly.updateUrl")
if [[ "$NIGHTLY_URL" != *"releases/nightly/"* ]]; then
  echo "  ❌ Nightly URL was corrupted during merge"
  exit 1
fi
echo "  ✅ Nightly channel preserved during promotion to beta"

echo ""
echo "--- Step 3: Promote beta to stable (merge) ---"
node "$PROJECT_ROOT/scripts/update-channel-metadata.mjs" \
  --channel stable \
  --version "0.6.0-nightly.20260708" \
  --min-version "0.1.0" \
  --url "https://github.com/AmaraNecib/tuari_react_hono/releases/download/v0.6.0-nightly.20260708/update-0.6.0-nightly.update" \
  --release-date "2026-07-08T00:00:00Z" \
  --changelog "https://github.com/AmaraNecib/tuari_react_hono/releases/tag/v0.6.0" \
  --merge "$TEST_DIR/updates.json" \
  --output "$TEST_DIR/updates.json"
echo "  ✅ Stable merged"

# Validate all three channels exist
CHANNEL_COUNT=$(read_json_field "$TEST_DIR/updates.json" "channels" | node -e "
const j = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log(Object.keys(j).length);
")
if [ "$CHANNEL_COUNT" -ne 3 ]; then
  echo "  ❌ Expected 3 channels, got $CHANNEL_COUNT"
  exit 1
fi
echo "  ✅ All three channels present ($CHANNEL_COUNT channels)"

echo ""
echo "--- Step 4: Verify promotion chain didn't corrupt data ---"
# All three should have the same version (promoted build ID is preserved)
for CH in nightly beta stable; do
  VER=$(read_json_field "$TEST_DIR/updates.json" "channels.$CH.latestVersion")
  if [ "$VER" != "0.6.0-nightly.20260708" ]; then
    echo "  ❌ Channel $CH has wrong version: $VER"
    exit 1
  fi
done
echo "  ✅ All channels reference the same build version"
echo "  ✅ Channel promotion works without re-signing (metadata update only)"
echo ""
echo "=== Integration Test Complete ==="
