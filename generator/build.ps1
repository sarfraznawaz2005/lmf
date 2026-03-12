$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "Building LMF Generator (production)..."
Write-Host ""

& bun run build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Build complete! Output in: $ScriptDir\build"
    Write-Host "Executable: $ScriptDir\build\dev-win-x64\LMFGenerator-dev\bin\launcher.exe"
} else {
    Write-Host "Build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
