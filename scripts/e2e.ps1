# Browser end-to-end smoke test (Playwright).
# Starts a throwaway backend, runs the e2e suite (which starts Vite itself),
# then cleans up.
# Usage:  .\scripts\e2e.ps1

$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $env:TEMP ("ne-e2e-" + [guid]::NewGuid().ToString("n"))

Push-Location (Join-Path $root "apps/api")
$env:NE_DATA_DIR = $dataDir
$env:NE_JOBS_SYNC = "true"
$env:NE_BATFISH_ENABLED = "false"
$api = Start-Process -PassThru -NoNewWindow uv -ArgumentList `
    "run", "uvicorn", "app.main:app", "--port", "8000", "--log-level", "warning"
Pop-Location

try {
    Start-Sleep -Seconds 3
    Push-Location (Join-Path $root "apps/web")
    npx playwright install chromium
    npm run e2e
    $code = $LASTEXITCODE
    Pop-Location
    exit $code
}
finally {
    if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id }
    Remove-Item -Recurse -Force $dataDir -ErrorAction SilentlyContinue
}
