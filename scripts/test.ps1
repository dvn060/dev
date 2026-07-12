# Run the full validation suite (what CI would run).
# Usage:  .\scripts\test.ps1

$root = Split-Path -Parent $PSScriptRoot
$failed = $false

Write-Host "== Backend: pytest, ruff, mypy ==" -ForegroundColor Cyan
Push-Location (Join-Path $root "apps/api")
uv sync --extra batfish | Out-Null
uv run pytest -q;            if ($LASTEXITCODE -ne 0) { $failed = $true }
uv run ruff check app tests; if ($LASTEXITCODE -ne 0) { $failed = $true }
uv run mypy app;             if ($LASTEXITCODE -ne 0) { $failed = $true }
Pop-Location

Write-Host "== Frontend: vitest, tsc, eslint, build ==" -ForegroundColor Cyan
Push-Location (Join-Path $root "apps/web")
npm run test;      if ($LASTEXITCODE -ne 0) { $failed = $true }
npm run typecheck; if ($LASTEXITCODE -ne 0) { $failed = $true }
npm run lint;      if ($LASTEXITCODE -ne 0) { $failed = $true }
npm run build;     if ($LASTEXITCODE -ne 0) { $failed = $true }
Pop-Location

if ($failed) {
    Write-Host "FAILED" -ForegroundColor Red
    exit 1
}
Write-Host "All checks passed." -ForegroundColor Green
