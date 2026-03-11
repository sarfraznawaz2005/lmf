$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "Starting LMF Viewer..."
& bun run start
Write-Host "LMF Viewer closed."
