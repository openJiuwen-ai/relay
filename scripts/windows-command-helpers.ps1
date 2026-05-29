function Get-ToolCommandCandidates {
    param([string]$Name)
    $candidates = @()
    if ($env:APPDATA) {
        $candidates += @((Join-Path $env:APPDATA "npm\$Name.cmd"), (Join-Path $env:APPDATA "npm\$Name.ps1"), (Join-Path $env:APPDATA "npm\$Name"))
    }
    $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
    if ($npmCommand) {
        $npmPath = if ($npmCommand.Path) { $npmCommand.Path } else { $npmCommand.Source }
        try {
            $npmPrefix = @(& $npmPath prefix -g 2>$null) | Select-Object -Last 1
            if ($npmPrefix) {
                $candidates += @((Join-Path $npmPrefix "$Name.cmd"), (Join-Path $npmPrefix "$Name.ps1"), (Join-Path $npmPrefix $Name))
            }
        } catch {}
    }
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) {
        $nodePath = if ($nodeCommand.Path) { $nodeCommand.Path } else { $nodeCommand.Source }
        if ($nodePath) {
            $nodeDir = Split-Path -Parent $nodePath
            $candidates += @((Join-Path $nodeDir "$Name.cmd"), (Join-Path $nodeDir "$Name.ps1"), (Join-Path $nodeDir $Name))
        }
    }
    return @($candidates | Where-Object { $_ } | Select-Object -Unique)
}

function Test-CommandPathExcluded {
    param([string]$Candidate)
    if (-not $Candidate) {
        return $true
    }
    $normalized = $Candidate.Replace('/', '\').ToLowerInvariant()
    return $normalized.Contains('\microsoft\windowsapps\')
}

function Test-CommandPathUsable {
    param([string]$Candidate)
    if (Test-CommandPathExcluded -Candidate $Candidate) {
        return $false
    }
    try {
        & $Candidate "--version" 1>$null 2>$null
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) { return $true }
        return $exitCode -eq 0
    } catch {
        return $false
    }
}

function Resolve-ToolCommand {
    param([string]$Name)
    foreach ($candidate in (Get-ToolCommandCandidates -Name $Name)) {
        if (Test-Path $candidate) {
            if (Test-CommandPathUsable -Candidate $candidate) {
                Add-ProcessPathPrefix -Directory (Split-Path -Parent $candidate)
                return $candidate
            }
        }
    }
    $toolCommand = Get-Command $Name -ErrorAction SilentlyContinue
    $resolvedPath = $null
    if ($toolCommand -and $toolCommand.Path) {
        $resolvedPath = $toolCommand.Path
    } elseif ($toolCommand -and $toolCommand.Source) {
        $resolvedPath = $toolCommand.Source
    }
    if ($resolvedPath -and (Test-CommandPathUsable -Candidate $resolvedPath)) {
        Add-ProcessPathPrefix -Directory (Split-Path -Parent $resolvedPath)
        return $resolvedPath
    }
    return $null
}

function Resolve-BundledNodeCommand {
    param([string]$ProjectRoot)
    if (-not $ProjectRoot) { return $null }
    $bundledNode = Join-Path $ProjectRoot "tools\node\node.exe"
    if (-not (Test-Path $bundledNode)) {
        return $null
    }
    Add-ProcessPathPrefix -Directory (Split-Path -Parent $bundledNode)
    return $bundledNode
}

function Test-OfficeClawBundledRelease {
    param([string]$ProjectRoot)
    if (-not $ProjectRoot) { return $false }
    return (Test-Path (Join-Path $ProjectRoot ".office-claw-release.json")) -and
        (Test-Path (Join-Path $ProjectRoot "tools\node\node.exe"))
}

function Merge-ToolPathSegments {
    param([string[]]$PathValues)

    $seen = @{}
    $segments = New-Object System.Collections.Generic.List[string]
    foreach ($pathValue in $PathValues) {
        if (-not $pathValue) {
            continue
        }
        foreach ($segment in ($pathValue -split ";")) {
            $candidate = $segment.Trim()
            if (-not $candidate) {
                continue
            }
            $normalized = $candidate.TrimEnd('\').ToLowerInvariant()
            if ($seen.ContainsKey($normalized)) {
                continue
            }
            $seen[$normalized] = $true
            $segments.Add($candidate)
        }
    }
    return @($segments)
}

function Sync-ToolPath {
    $processPath = $env:Path
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $segments = Merge-ToolPathSegments -PathValues @($processPath, $machinePath, $userPath)
    if ($segments.Count -gt 0) {
        $env:Path = ($segments -join ";")
    }
}

function Resolve-ToolCommandWithRetry {
    param([string]$Name, [int]$Attempts = 1, [int]$DelayMs = 500)
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        Sync-ToolPath
        $toolCommand = Resolve-ToolCommand -Name $Name
        if ($toolCommand) { return $toolCommand }
        if ($attempt -lt ($Attempts - 1)) {
            Start-Sleep -Milliseconds $DelayMs
        }
    }
    return $null
}

function Write-ToolResolutionDiagnostics {
    param([string]$Name)
    Write-Warn "$Name resolver candidates:"
    foreach ($candidate in (Get-ToolCommandCandidates -Name $Name)) {
        $status = if (Test-Path $candidate) { "exists" } else { "missing" }
        Write-Warn "  [$status] $candidate"
    }
}

function Invoke-ToolCommand {
    param([string]$Name, [string[]]$CommandArgs)
    $toolCommand = Resolve-ToolCommand -Name $Name
    if (-not $toolCommand) { throw "$Name command not found" }
    & $toolCommand @CommandArgs
}
