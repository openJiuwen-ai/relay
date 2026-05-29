param(
    [string]$InstallRoot,
    [string]$WheelhouseRoot,
    [string[]]$Group = @("shared-runtime"),
    [switch]$ForceReinstall = $true,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-ManualInstallRoot {
    param([string]$RequestedPath)

    if ($RequestedPath) {
        return [System.IO.Path]::GetFullPath($RequestedPath)
    }

    $candidate = Join-Path $PSScriptRoot ".."
    return [System.IO.Path]::GetFullPath($candidate)
}

function Resolve-ManualWheelhouseRoot {
    param(
        [string]$InstallRootPath,
        [string]$RequestedPath
    )

    if ($RequestedPath) {
        return [System.IO.Path]::GetFullPath($RequestedPath)
    }

    $candidates = @(
        (Join-Path $InstallRootPath "installer-seed"),
        (Join-Path $InstallRootPath "dist\windows-python-wheelhouse"),
        (Join-Path ([System.IO.Path]::GetDirectoryName($InstallRootPath)) "dist\windows-python-wheelhouse")
    )

    foreach ($candidate in $candidates) {
        $manifestCandidate = Join-Path $candidate "python-wheelhouse-manifest.json"
        if (Test-Path $manifestCandidate) {
            return [System.IO.Path]::GetFullPath($candidate)
        }
    }

    throw "wheelhouse root not found; pass -WheelhouseRoot explicitly"
}

$resolvedInstallRoot = Resolve-ManualInstallRoot -RequestedPath $InstallRoot
$resolvedWheelhouseRoot = Resolve-ManualWheelhouseRoot -InstallRootPath $resolvedInstallRoot -RequestedPath $WheelhouseRoot
$pythonExe = Join-Path $resolvedInstallRoot "tools\python\python.exe"
$manifestPath = Join-Path $resolvedWheelhouseRoot "python-wheelhouse-manifest.json"
$delegateScript = Join-Path $PSScriptRoot "install-python-wheelhouse.ps1"

if (-not (Test-Path $pythonExe)) {
    throw "bundled python not found: $pythonExe"
}
if (-not (Test-Path $manifestPath)) {
    throw "wheelhouse manifest not found: $manifestPath"
}
if (-not (Test-Path $delegateScript)) {
    throw "delegate install script not found: $delegateScript"
}

Write-Host "[wheelhouse] install root: $resolvedInstallRoot"
Write-Host "[wheelhouse] wheelhouse root: $resolvedWheelhouseRoot"
Write-Host "[wheelhouse] python: $pythonExe"
Write-Host "[wheelhouse] groups: $($Group -join ', ')"

& $delegateScript `
    -ProjectRoot $resolvedInstallRoot `
    -ManifestPath $manifestPath `
    -PythonExe $pythonExe `
    -Group $Group `
    -ForceReinstall:$ForceReinstall `
    -DryRun:$DryRun

if ($LASTEXITCODE -ne 0) {
    throw "manual wheelhouse install failed"
}
