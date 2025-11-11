# Run server locally with .env loaded
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/dev.ps1

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path) | Out-Null
Set-Location ..

# Ensure .env exists
if (-not (Test-Path .env)) {
  Write-Error ".env missing. Copy .env.example to .env and adjust values."
}

# Start server directly via node to avoid npm policy issues
node src/index.js
