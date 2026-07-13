# Start the full Network Evidence stack with Docker Desktop.
# Usage:  .\scripts\up.ps1        (add -Detach to run in the background)
param([switch]$Detach)

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    $composeArgs = @("compose", "up", "--build")
    if ($Detach) { $composeArgs += "-d" }
    docker @composeArgs
    if ($Detach) {
        Write-Host "Stack started. Open http://localhost:8080" -ForegroundColor Green
    }
}
finally {
    Pop-Location
}
