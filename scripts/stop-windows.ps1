<#
.SYNOPSIS
  OfficeClaw - Windows Stop Script

.DESCRIPTION
  Stops OfficeClaw services (API, Frontend, Redis) by port.

.EXAMPLE
  .\scripts\stop-windows.ps1
#>

$ErrorActionPreference = "Continue"

function Write-Ok   { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "  [!!] $msg" -ForegroundColor Yellow }

$ScriptPath = if ($PSCommandPath) { $PSCommandPath } elseif ($MyInvocation.MyCommand.Path) { $MyInvocation.MyCommand.Path } else { $null }
$ScriptDir = if ($ScriptPath) { Split-Path -Parent $ScriptPath } else { $null }
if ($ScriptDir) {
    . (Join-Path $ScriptDir "install-windows-helpers.ps1")
}
$ProjectRoot = if ($ScriptDir) { Split-Path -Parent $ScriptDir } else { $null }
$RunDir = if ($ProjectRoot) { Join-Path $ProjectRoot ".office-claw/run/windows" } else { $null }
$RuntimeStateFile = if ($RunDir) { Join-Path $RunDir "runtime-state.json" } else { $null }
$runtimeState = Read-WindowsRuntimeStateFile -StateFile $RuntimeStateFile

Write-Host "OfficeClaw - Stopping services" -ForegroundColor Cyan
Write-Host "============================="

# Load .env for port config
$envFile = Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) ".env"
$ApiPort = 3004
$WebPort = 3003
$RedisPort = 6399

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split "=", 2
            if ($parts.Count -eq 2) {
                $key = $parts[0].Trim()
                $val = $parts[1].Trim().Trim('"').Trim("'")
                switch ($key) {
                    "API_SERVER_PORT" { $ApiPort = [int]$val }
                    "FRONTEND_PORT"   { $WebPort = [int]$val }
                    "REDIS_PORT"      { $RedisPort = [int]$val }
                }
            }
        }
    }
}

if ($runtimeState) {
    if ($runtimeState.ApiPort) {
        $ApiPort = [int]$runtimeState.ApiPort
    }
    if ($runtimeState.WebPort) {
        $WebPort = [int]$runtimeState.WebPort
    }
    if ($runtimeState.RedisPort) {
        $RedisPort = [int]$runtimeState.RedisPort
    }
}

$configuredRedisUrl = if ($runtimeState -and $runtimeState.RedisUrl) {
    [string]$runtimeState.RedisUrl
} else {
    Get-InstallerEnvValueFromFile -EnvFile $envFile -Key "REDIS_URL"
}
$redisStartedByLauncher = [bool]($runtimeState -and $runtimeState.RedisStartedByLauncher)
if (-not $configuredRedisUrl -and $env:REDIS_URL) {
    $configuredRedisUrl = $env:REDIS_URL.Trim()
}
# Restore Redis auth from Credential Manager (runtime-state stores redacted URL)
$redisAuthFromCM = [bool]($runtimeState -and $runtimeState.RedisAuthFromCredentialManager)
if ($redisAuthFromCM) {
    try {
        $storedPassword = Read-OfficeClawCredential -Path "redis/password"
        if ($storedPassword) {
            $escapedPwd = [System.Uri]::EscapeDataString($storedPassword)
            $configuredRedisUrl = "redis://:${escapedPwd}@localhost:${RedisPort}"
        }
    } catch {
        Write-Warn "Cannot read Redis password from Credential Manager: $_"
    }
}

function Get-ManagedProcessId {
    param([string]$ManagedPidFile)
    if (-not $ManagedPidFile -or -not (Test-Path $ManagedPidFile)) {
        return $null
    }
    try {
        return [int](Get-Content $ManagedPidFile -TotalCount 1).Trim()
    } catch {
        return $null
    }
}

function Get-ProcessCommandLine {
    param([int]$ProcessId)
    try {
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
        return $processInfo.CommandLine
    } catch {
        return $null
    }
}

function Test-OfficeClawOwnedProcess {
    param([int]$ProcessId, [string]$OfficeClawProjectRoot)
    if (-not $OfficeClawProjectRoot) {
        return $false
    }
    $commandLine = Get-ProcessCommandLine -ProcessId $ProcessId
    if (-not $commandLine) {
        return $false
    }
    $normalizedRoot = $OfficeClawProjectRoot.TrimEnd('\', '/') + '\'
    return (Test-CommandLineContainsLiteral -CommandLine $commandLine -Needle $normalizedRoot) -or
        (Test-CommandLineContainsLiteral -CommandLine $commandLine -Needle ($OfficeClawProjectRoot + '"')) -or
        (Test-CommandLineContainsLiteral -CommandLine $commandLine -Needle ($OfficeClawProjectRoot + "'"))
}

function Stop-PortProcess {
    param([int]$Port, [string]$Name, [string]$PidFile, [string]$ProjectRoot)
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        $managedPid = Get-ManagedProcessId -ManagedPidFile $PidFile
        $stopped = $false
        foreach ($conn in $connections) {
            $isManagedPid = $managedPid -and ($conn.OwningProcess -eq $managedPid)
            $isOfficeClawOwned = $isManagedPid -or (Test-OfficeClawOwnedProcess -ProcessId $conn.OwningProcess -OfficeClawProjectRoot $ProjectRoot)
            if (-not $isOfficeClawOwned) {
                Write-Warn "Skipping non-OfficeClaw $Name listener on port $Port (PID $($conn.OwningProcess))"
                continue
            }
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
            $stopped = $true
        }
        if ($stopped) {
            Remove-Item $PidFile -ErrorAction SilentlyContinue
            Write-Ok "Stopped $Name (port $Port)"
        } else {
            Write-Warn "$Name (port $Port) - no OfficeClaw-owned listener found"
        }
    } else {
        Write-Warn "$Name (port $Port) - not running"
    }
}

$ApiPidFile = if ($runtimeState -and $runtimeState.ApiPidFile) {
    [string]$runtimeState.ApiPidFile
} elseif ($RunDir) {
    Join-Path $RunDir "api-$ApiPort.pid"
} else {
    $null
}
$WebPidFile = if ($runtimeState -and $runtimeState.WebPidFile) {
    [string]$runtimeState.WebPidFile
} elseif ($RunDir) {
    Join-Path $RunDir "web-$WebPort.pid"
} else {
    $null
}

Stop-PortProcess -Port $ApiPort -Name "API Server" -PidFile $ApiPidFile -ProjectRoot $ProjectRoot
Stop-PortProcess -Port $WebPort -Name "Frontend" -PidFile $WebPidFile -ProjectRoot $ProjectRoot

# Stop Redis if running on our port
$redisCommands = $null
$redisLayout = if ($ProjectRoot) { Resolve-PortableRedisLayout -ProjectRoot $ProjectRoot } else { $null }
$redisPidFile = if ($runtimeState -and $runtimeState.RedisPidFile) {
    [string]$runtimeState.RedisPidFile
} elseif ($redisLayout) {
    Join-Path $redisLayout.Data "redis-$RedisPort.pid"
} else {
    $null
}
if ($ProjectRoot) {
    $redisCommands = Resolve-PortableRedisBinaries -ProjectRoot $ProjectRoot
}
if (-not $redisCommands) {
    $redisCommands = Resolve-GlobalRedisBinaries
}

if ($configuredRedisUrl -and -not (Test-LocalRedisUrl -RedisUrl $configuredRedisUrl -RedisPort $RedisPort)) {
    Write-Warn "Skipping local Redis shutdown because REDIS_URL points to an external host"
} else {
    try {
        if (-not $redisCommands -or -not $redisCommands.CliPath) {
            throw "redis-cli unavailable"
        }
        $redisConnections = Get-NetTCPConnection -LocalPort $RedisPort -State Listen -ErrorAction SilentlyContinue
        if (-not $redisConnections) {
            Write-Warn "Redis (port $RedisPort) - not running"
        } else {
            $managedRedisPid = Get-ManagedProcessId -ManagedPidFile $redisPidFile
            $ownedRedisConnections = @()
            if ($redisStartedByLauncher) {
                $ownedRedisConnections = @($redisConnections)
            }
            foreach ($conn in $redisConnections) {
                if ($redisStartedByLauncher) {
                    break
                }
                $isManagedPid = $managedRedisPid -and ($conn.OwningProcess -eq $managedRedisPid)
                $isOfficeClawOwned = $isManagedPid -or (Test-OfficeClawOwnedProcess -ProcessId $conn.OwningProcess -OfficeClawProjectRoot $ProjectRoot)
                if (-not $isOfficeClawOwned) {
                    Write-Warn "Skipping non-OfficeClaw Redis listener on port $RedisPort (PID $($conn.OwningProcess))"
                    continue
                }
                $ownedRedisConnections += $conn
            }
            if ($ownedRedisConnections.Count -eq 0) {
                Write-Warn "Redis (port $RedisPort) - no OfficeClaw-owned listener found"
            } else {
                $redisCli = $redisCommands.CliPath
                $redisAuthArgs = Get-RedisAuthArgs -RedisUrl $configuredRedisUrl
                $redisPing = & { $ErrorActionPreference = 'SilentlyContinue'; & $redisCli -p $RedisPort @redisAuthArgs ping 2>$null }
                if ($redisPing -eq "PONG") {
                    & { $ErrorActionPreference = 'SilentlyContinue'; & $redisCli -p $RedisPort @redisAuthArgs shutdown save 2>$null }
                    Write-Ok "Redis stopped (port $RedisPort)"
                } elseif ($redisStartedByLauncher -and $managedRedisPid) {
                    Stop-Process -Id $managedRedisPid -Force -ErrorAction SilentlyContinue
                    Write-Warn "Redis required forced termination (port $RedisPort)"
                } else {
                    Write-Warn "Redis (port $RedisPort) - not running"
                }
            }
        }
    } catch {
        Write-Warn "Redis (port $RedisPort) - not running"
    }
}

# Stop orphaned Python processes spawned by OfficeClaw (relayclaw sidecar, ACP agent-teams, etc.)
if ($ProjectRoot) {
    try {
        $pythonProcesses = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" -ErrorAction SilentlyContinue
        $stoppedPython = $false
        foreach ($proc in $pythonProcesses) {
            if (-not $proc.CommandLine) { continue }
            $cmdLine = $proc.CommandLine
            $isOfficeClawPython = (
                (Test-CommandLineContainsLiteral -CommandLine $cmdLine -Needle $ProjectRoot) -or
                (Test-CommandLineContainsLiteral -CommandLine $cmdLine -Needle "tools\python\python.exe") -or
                (Test-CommandLineContainsLiteral -CommandLine $cmdLine -Needle "tools/python/python.exe") -or
                (Test-CommandLineContainsLiteral -CommandLine $cmdLine -Needle "vendor\jiuwenclaw") -or
                (Test-CommandLineContainsLiteral -CommandLine $cmdLine -Needle "vendor/jiuwenclaw")
            )
            if (-not $isOfficeClawPython) { continue }
            if (-not (Test-OfficeClawOwnedProcess -ProcessId $proc.ProcessId -OfficeClawProjectRoot $ProjectRoot)) {
                # Command line matched a OfficeClaw-like pattern but process is not owned by this project
                Write-Warn "Skipping non-OfficeClaw Python process (PID $($proc.ProcessId))"
                continue
            }
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            $stoppedPython = $true
        }
        if ($stoppedPython) {
            Write-Ok "Stopped orphaned Python processes"
        }
    } catch {
        # Best-effort cleanup - do not block shutdown
    }
}

Remove-Item $ApiPidFile -ErrorAction SilentlyContinue
Remove-Item $WebPidFile -ErrorAction SilentlyContinue
Remove-Item $redisPidFile -ErrorAction SilentlyContinue
Remove-WindowsRuntimeStateFile -StateFile $RuntimeStateFile

Write-Host "`nAll services stopped." -ForegroundColor Green

