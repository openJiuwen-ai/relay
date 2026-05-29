param(
    [string]$ProjectRoot,
    [string]$ManifestPath,
    [string]$PythonExe,
    [string[]]$Group = @(),
    [switch]$ForceReinstall,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WheelhouseDefaultProjectRoot {
    $candidate = Join-Path $PSScriptRoot ".."
    return [System.IO.Path]::GetFullPath($candidate)
}

function Resolve-WheelhouseManifestPath {
    param(
        [string]$ResolvedProjectRoot,
        [string]$RequestedPath
    )

    if ($RequestedPath) {
        return [System.IO.Path]::GetFullPath($RequestedPath)
    }

    $candidates = @(
        (Join-Path $ResolvedProjectRoot "installer-seed\python-wheelhouse-manifest.json"),
        (Join-Path $ResolvedProjectRoot "packaging\windows\python-wheelhouse-manifest.json"),
        (Join-Path $ResolvedProjectRoot "dist\windows-python-wheelhouse\python-wheelhouse-manifest.json")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return [System.IO.Path]::GetFullPath($candidate)
        }
    }

    throw "python wheelhouse manifest not found; pass -ManifestPath explicitly"
}

function Resolve-WheelhousePythonExe {
    param(
        [string]$ResolvedProjectRoot,
        [string]$RequestedPath
    )

    if ($RequestedPath) {
        return [System.IO.Path]::GetFullPath($RequestedPath)
    }

    $candidate = Join-Path $ResolvedProjectRoot "tools\python\python.exe"
    if (-not (Test-Path $candidate)) {
        throw "python.exe not found; pass -PythonExe explicitly"
    }
    return [System.IO.Path]::GetFullPath($candidate)
}

function ConvertTo-WheelhouseArray {
    param($Value)

    if ($null -eq $Value) {
        return @()
    }
    if ($Value -is [System.Array]) {
        return @($Value)
    }
    return @($Value)
}

function Get-WheelhouseSelectedGroups {
    param(
        $Manifest,
        [string[]]$RequestedGroups
    )

    $groups = ConvertTo-WheelhouseArray $Manifest.groups
    if ($groups.Count -eq 0) {
        throw "wheelhouse manifest contains no groups"
    }

    if (-not $RequestedGroups -or $RequestedGroups.Count -eq 0) {
        return $groups
    }

    $selected = @()
    foreach ($groupId in $RequestedGroups) {
        $match = $groups | Where-Object { "$($_.id)" -eq $groupId } | Select-Object -First 1
        if (-not $match) {
            throw "wheelhouse group not found in manifest: $groupId"
        }
        $selected += $match
    }
    return $selected
}

function Invoke-WheelhouseInstallGroup {
    param(
        [string]$PythonExePath,
        [string]$ManifestDir,
        $Group,
        [switch]$ForceReinstall,
        [switch]$DryRun
    )

    $wheelSubdir = "$($Group.wheelSubdir)"
    if (-not $wheelSubdir) {
        throw "wheelhouse group $($Group.id) missing wheelSubdir"
    }

    $wheelDir = [System.IO.Path]::GetFullPath((Join-Path $ManifestDir $wheelSubdir))
    if (-not (Test-Path $wheelDir)) {
        throw "wheelhouse directory not found for group $($Group.id): $wheelDir"
    }

    $wheelFiles = ConvertTo-WheelhouseArray $Group.wheelFiles
    if ($wheelFiles.Count -eq 0) {
        throw "wheelhouse group $($Group.id) has no wheel files"
    }

    $wheelPaths = @()
    foreach ($wheelFile in $wheelFiles) {
        $wheelPath = Join-Path $wheelDir "$wheelFile"
        if (-not (Test-Path $wheelPath)) {
            throw "wheel file missing for group $($Group.id): $wheelPath"
        }
        $wheelPaths += [System.IO.Path]::GetFullPath($wheelPath)
    }

    $requirementsFile = [System.IO.Path]::GetTempFileName()
    try {
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($requirementsFile, ($wheelPaths -join [Environment]::NewLine), $utf8NoBom)

        $pipArgs = @(
            "-m", "pip", "install",
            "--no-index",
            "--find-links", $wheelDir,
            "--no-warn-script-location"
        )
        if ($ForceReinstall) {
            $pipArgs += "--force-reinstall"
        }
        $pipArgs += @("-r", $requirementsFile)

        Write-Host "[wheelhouse] installing group $($Group.id) from $wheelDir"
        if ($DryRun) {
            Write-Host "[wheelhouse] dry-run: $PythonExePath $($pipArgs -join ' ')"
            return
        }

        & $PythonExePath @pipArgs
        if ($LASTEXITCODE -ne 0) {
            throw "pip install failed for group $($Group.id)"
        }
    } finally {
        Remove-Item $requirementsFile -Force -ErrorAction SilentlyContinue
    }
}

$resolvedProjectRoot = if ($ProjectRoot) {
    [System.IO.Path]::GetFullPath($ProjectRoot)
} else {
    Resolve-WheelhouseDefaultProjectRoot
}

$resolvedManifestPath = Resolve-WheelhouseManifestPath -ResolvedProjectRoot $resolvedProjectRoot -RequestedPath $ManifestPath
$resolvedPythonExe = Resolve-WheelhousePythonExe -ResolvedProjectRoot $resolvedProjectRoot -RequestedPath $PythonExe

if (-not (Test-Path $resolvedManifestPath)) {
    throw "wheelhouse manifest not found: $resolvedManifestPath"
}
if (-not (Test-Path $resolvedPythonExe)) {
    throw "python.exe not found: $resolvedPythonExe"
}

$manifestRaw = Get-Content -Path $resolvedManifestPath -Raw -Encoding UTF8
$manifest = $manifestRaw | ConvertFrom-Json -Depth 100
$manifestDir = Split-Path -Parent $resolvedManifestPath
$selectedGroups = Get-WheelhouseSelectedGroups -Manifest $manifest -RequestedGroups $Group

foreach ($selectedGroup in $selectedGroups) {
    Invoke-WheelhouseInstallGroup `
        -PythonExePath $resolvedPythonExe `
        -ManifestDir $manifestDir `
        -Group $selectedGroup `
        -ForceReinstall:$ForceReinstall `
        -DryRun:$DryRun
}

Write-Host "[wheelhouse] install complete"
