#!/bin/bash

# Validate workflow assets for multi-agent delivery
# Run this locally before pushing or in CI after Phase 1

set -e

echo "🔍 Validating workflow assets..."

ERRORS=0

# Check required files exist
echo "✓ Checking required files..."
REQUIRED_FILES=(
  "plans/tuari-multi-agent-delivery-plan.md"
  "plans/007-phase-1-3-feature-delivery.md"
  ".claude/branch-verification-checklist.md"
  ".github/pull_request_template.md"
  "docs/BRANCH_STRATEGY.md"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "  ❌ Missing: $file"
    ERRORS=$((ERRORS + 1))
  else
    echo "  ✓ Found: $file"
  fi
done

# Check branch naming in git history (sample check)
echo "✓ Checking git branches..."
INVALID_BRANCHES=$(git branch -a | grep -vE "^\*|main|master|agent/phase|integration/phase|hotfix/" || true)
if [ ! -z "$INVALID_BRANCHES" ]; then
  echo "  ⚠️  Non-standard branches found (may need renaming):"
  echo "$INVALID_BRANCHES" | sed 's/^/    /'
fi

# Check PR template structure
echo "✓ Checking PR template..."
if grep -q "Scope Statement" .github/pull_request_template.md && \
   grep -q "Affected Surfaces" .github/pull_request_template.md && \
   grep -q "Test Coverage" .github/pull_request_template.md; then
  echo "  ✓ PR template has required sections"
else
  echo "  ❌ PR template missing required sections"
  ERRORS=$((ERRORS + 1))
fi

# Check branch strategy docs
echo "✓ Checking branch strategy documentation..."
if grep -q "Phase 0" docs/BRANCH_STRATEGY.md && \
   grep -q "Phase 5" docs/BRANCH_STRATEGY.md && \
   grep -q "Branch Naming Rules" docs/BRANCH_STRATEGY.md; then
  echo "  ✓ Branch strategy docs complete"
else
  echo "  ❌ Branch strategy docs incomplete"
  ERRORS=$((ERRORS + 1))
fi

# Summary
echo ""
if [ $ERRORS -eq 0 ]; then
  echo "✅ All workflow assets validated successfully"
  exit 0
else
  echo "❌ Found $ERRORS validation error(s)"
  exit 1
fi
