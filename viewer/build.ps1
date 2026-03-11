$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "Building LMF Viewer (production)..."
& bun run build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Build complete! Output in: $ScriptDir\build"
} else {
    Write-Host "Build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
