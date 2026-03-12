$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "Starting LMF Generator (development mode)..."
Write-Host ""

& bun run dev

Write-Host "LMF Generator closed."
