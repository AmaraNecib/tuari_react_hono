# Validate workflow assets for multi-agent delivery
# Run this locally before pushing or in CI after Phase 1

$ErrorActionPreference = "Stop"
$ErrorCount = 0

Write-Host "🔍 Validating workflow assets..." -ForegroundColor Cyan
Write-Host ""

# Check required files exist
Write-Host "✓ Checking required files..." -ForegroundColor Green
$RequiredFiles = @(
  "plans/tuari-multi-agent-delivery-plan.md",
  "plans/007-phase-1-3-feature-delivery.md",
  ".claude/branch-verification-checklist.md",
  ".github/pull_request_template.md",
  "docs/BRANCH_STRATEGY.md"
)

foreach ($file in $RequiredFiles) {
  if (Test-Path $file) {
    Write-Host "  ✓ Found: $file" -ForegroundColor Green
  } else {
    Write-Host "  ❌ Missing: $file" -ForegroundColor Red
    $ErrorCount++
  }
}

# Check branch naming in git history (sample check)
Write-Host "✓ Checking git branches..." -ForegroundColor Green
$branches = git branch -a 2>$null | Select-String -Pattern "^\*|main|master|agent/phase|integration/phase|hotfix/" -NotMatch | Select-String -Pattern "^\s+" -NotMatch

if ($branches) {
  Write-Host "  ⚠️  Non-standard branches found (may need renaming):" -ForegroundColor Yellow
  foreach ($branch in $branches) {
    Write-Host "    $branch" -ForegroundColor Yellow
  }
}

# Check PR template structure
Write-Host "✓ Checking PR template..." -ForegroundColor Green
$prTemplate = Get-Content ".github/pull_request_template.md" -Raw
if ($prTemplate -match "Scope Statement" -and `
    $prTemplate -match "Affected Surfaces" -and `
    $prTemplate -match "Test Coverage") {
  Write-Host "  ✓ PR template has required sections" -ForegroundColor Green
} else {
  Write-Host "  ❌ PR template missing required sections" -ForegroundColor Red
  $ErrorCount++
}

# Check branch strategy docs
Write-Host "✓ Checking branch strategy documentation..." -ForegroundColor Green
$branchStrategy = Get-Content "docs/BRANCH_STRATEGY.md" -Raw
if ($branchStrategy -match "Phase 0" -and `
    $branchStrategy -match "Phase 5" -and `
    $branchStrategy -match "Branch Naming Rules") {
  Write-Host "  ✓ Branch strategy docs complete" -ForegroundColor Green
} else {
  Write-Host "  ❌ Branch strategy docs incomplete" -ForegroundColor Red
  $ErrorCount++
}

# Summary
Write-Host ""
if ($ErrorCount -eq 0) {
  Write-Host "✅ All workflow assets validated successfully" -ForegroundColor Green
  exit 0
} else {
  Write-Host "❌ Found $ErrorCount validation error(s)" -ForegroundColor Red
  exit 1
}
