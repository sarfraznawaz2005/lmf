$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host ""
Write-Host "=== LMF Generator Build ==="
Write-Host ""

# Prompt for build environment
Write-Host "Build type:"
Write-Host "  [1] dev    - Fast build, no minification (default)"
Write-Host "  [2] stable - Optimized production build"
Write-Host ""
$envChoice = Read-Host "Choose build type [1/2] (default: 1)"

$buildEnv = "dev"
if ($envChoice -eq "2") {
    $buildEnv = "stable"
}

Write-Host ""
Write-Host "Building LMF Generator (--env=$buildEnv)..."
Write-Host ""

& bunx electrobun build "--env=$buildEnv"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Build complete!"
    if ($buildEnv -eq "stable") {
        Write-Host "Output: $ScriptDir\build\stable-win-x64\"
        Write-Host ""
        Write-Host "Note: To distribute without SmartScreen warnings, sign the executable"
        Write-Host "with an EV code signing certificate using signtool.exe."
    } else {
        Write-Host "Output: $ScriptDir\build\dev-win-x64\LMFGenerator-dev\bin\launcher.exe"
    }
} else {
    Write-Host "Build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
