# Instala e liga o ID MOTION (Windows). Uso: powershell -ExecutionPolicy Bypass -File setup.ps1
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "Instale o Node 22: https://nodejs.org"; exit 1 }
node scripts/setup.mjs @args
