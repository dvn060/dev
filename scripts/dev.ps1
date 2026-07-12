# Development mode: backend with auto-reload + Vite dev server with HMR.
# Requires: Python 3.12+, uv (https://docs.astral.sh/uv/), Node 20+.
# Batfish (optional): docker compose up batfish -d
#
# Usage:  .\scripts\dev.ps1

$root = Split-Path -Parent $PSScriptRoot

# Backend
Push-Location (Join-Path $root "apps/api")
if (-not (Test-Path ".venv")) {
    uv venv --python 3.12 .venv
}
uv sync --extra batfish
$api = Start-Process -PassThru -NoNewWindow uv -ArgumentList `
    "run", "uvicorn", "app.main:app", "--reload", "--port", "8000"
Pop-Location

# Frontend
Push-Location (Join-Path $root "apps/web")
if (-not (Test-Path "node_modules")) {
    npm install
}
try {
    npm run dev   # http://localhost:5173 (proxies /api to :8000)
}
finally {
    Pop-Location
    if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id }
}
