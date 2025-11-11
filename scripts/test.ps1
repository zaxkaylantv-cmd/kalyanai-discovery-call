# Run Jest tests without npm script
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\test.ps1

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path) | Out-Null
Set-Location ..

node .\node_modules\jest\bin\jest.js --runInBand
