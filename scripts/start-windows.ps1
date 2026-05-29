<#
.SYNOPSIS
  OfficeClaw - Windows Startup Script

.DESCRIPTION
  Starts API server and Frontend (Vite static + server.cjs when packaged, otherwise vite preview / vite dev) with .env loading.
  Optionally starts Redis if available.
  Default: production mode (packages/web/server.cjs when present, otherwise vite preview).
  Use -Dev for hot reload (vite dev).

.EXAMPLE
  .\scripts\start-windows.ps1              # production mode (default)
  .\scripts\start-windows.ps1 -Quick       # skip rebuild
  .\scripts\start-windows.ps1 -Memory      # skip Redis, use in-memory storage
  .\scripts\start-windows.ps1 -Dev         # development mode (vite dev, hot reload)
  .\scripts\start-windows.ps1 -Debug       # enable debug-level logging (writes to data/logs/api/)
#>

param(
    [switch]$Quick,
    [switch]$Memory,
    [switch]$Dev,
    [switch]$Debug
)

$ErrorActionPreference = "Stop"

# -- Encoding (ensure UTF-8 output for CJK text) ------------
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# -- Helpers -------------------------------------------------
function Write-Step  { param([string]$msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$msg) Write-Host "  [ERR] $msg" -ForegroundColor Red }

$script:RedisCliProbeTimeoutMs = 3000
$script:RedisStartupReadyTimeoutSeconds = 15

function Invoke-RedisCliCommand {
    param(
        [string]$RedisCliPath,
        [int]$Port,
        [object[]]$AuthArgs = @(),
        [string[]]$CommandArgs = @("ping"),
        [int]$TimeoutMs = $script:RedisCliProbeTimeoutMs
    )

    $redisCliArgs = @("-h", "127.0.0.1", "-p", "$Port", "-t", "0.25") + @($AuthArgs) + @($CommandArgs)
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo.FileName = $RedisCliPath
    $process.StartInfo.Arguments = (($redisCliArgs | ForEach-Object { Quote-WindowsProcessArgument -Value "$_" }) -join " ")
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true

    try {
        if (-not $process.Start()) {
            return [pscustomobject]@{
                Output = ""
                Error = "redis-cli process did not start"
                ExitCode = $null
                TimedOut = $false
                Failed = $true
            }
        }

        if (-not $process.WaitForExit($TimeoutMs)) {
            try {
                $process.Kill()
                [void]$process.WaitForExit(1000)
            } catch {}
            return [pscustomobject]@{
                Output = ""
                Error = "redis-cli timed out after ${TimeoutMs}ms"
                ExitCode = $null
                TimedOut = $true
                Failed = $true
            }
        }

        $stdout = $process.StandardOutput.ReadToEnd().Trim()
        $stderr = $process.StandardError.ReadToEnd().Trim()
        return [pscustomobject]@{
            Output = $stdout
            Error = $stderr
            ExitCode = $process.ExitCode
            TimedOut = $false
            Failed = $false
        }
    } catch {
        return [pscustomobject]@{
            Output = ""
            Error = "$_"
            ExitCode = $null
            TimedOut = $false
            Failed = $true
        }
    } finally {
        $process.Dispose()
    }
}

function Wait-RedisPing {
    param(
        [string]$RedisCliPath,
        [int]$Port,
        [object[]]$AuthArgs = @(),
        [int]$TimeoutSeconds = $script:RedisStartupReadyTimeoutSeconds,
        [int]$IntervalMilliseconds = 100
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $ping = Invoke-RedisCliCommand -RedisCliPath $RedisCliPath -Port $Port -AuthArgs $AuthArgs -CommandArgs @("ping") -TimeoutMs 1000
        if ($ping.Output -eq "PONG") {
            return $true
        }
        Start-Sleep -Milliseconds $IntervalMilliseconds
    }

    return $false
}

function Invoke-RedisPingOnce {
    param(
        [string]$RedisCliPath,
        [int]$Port,
        [object[]]$AuthArgs = @()
    )

    $ping = Invoke-RedisCliCommand -RedisCliPath $RedisCliPath -Port $Port -AuthArgs $AuthArgs -CommandArgs @("ping") -TimeoutMs $script:RedisCliProbeTimeoutMs
    if ($ping.Output) {
        return $ping.Output
    }
    if ($ping.TimedOut) {
        return "__REDIS_CLI_TIMEOUT__"
    }
    return ""
}

function Get-RedisPingFailureDetail {
    param(
        [string]$RedisCliPath,
        [int]$Port,
        [object[]]$AuthArgs = @()
    )

    $ping = Invoke-RedisCliCommand -RedisCliPath $RedisCliPath -Port $Port -AuthArgs $AuthArgs -CommandArgs @("ping") -TimeoutMs $script:RedisCliProbeTimeoutMs
    $text = (@($ping.Output, $ping.Error) | Where-Object { $_ }) -join " "
    if (-not $text) {
        $text = "<empty>"
    }

    if ($ping.TimedOut) {
        return "redis-cli ping timed out after ${script:RedisCliProbeTimeoutMs}ms output=$text"
    }
    return "redis-cli ping exit=$($ping.ExitCode) output=$text"
}

function Write-RedisLogTail {
    param(
        [string]$RedisLogFile,
        [int]$LineCount = 80
    )

    if (-not $RedisLogFile -or -not (Test-Path $RedisLogFile)) {
        Write-Warn "Redis log tail unavailable: log file was not created"
        return
    }

    Write-Warn "Redis log tail from ${RedisLogFile}:"
    try {
        Get-Content -Path $RedisLogFile -Tail $LineCount -Encoding UTF8 | ForEach-Object {
            Write-Warn "Redis log: $_"
        }
    } catch {
        Write-Warn "Redis log tail unavailable: $($_.Exception.Message)"
    }
}

function ConvertTo-RedisRespCommand {
    param([string[]]$Parts)

    $builder = [System.Text.StringBuilder]::new()
    [void]$builder.Append("*$($Parts.Count)`r`n")
    foreach ($part in $Parts) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($part)
        [void]$builder.Append("`$$($bytes.Length)`r`n")
        [void]$builder.Append($part)
        [void]$builder.Append("`r`n")
    }

    return [System.Text.Encoding]::UTF8.GetBytes($builder.ToString())
}

function Read-RedisRespLine {
    param([System.IO.Stream]$Stream)

    $buffer = [System.Collections.Generic.List[byte]]::new()
    $byteBuffer = New-Object byte[] 1
    while ($buffer.Count -lt 8192) {
        $read = $Stream.Read($byteBuffer, 0, 1)
        if ($read -le 0) {
            break
        }
        [void]$buffer.Add($byteBuffer[0])
        if ($byteBuffer[0] -eq 10) {
            break
        }
    }

    if ($buffer.Count -eq 0) {
        return ""
    }

    return ([System.Text.Encoding]::UTF8.GetString($buffer.ToArray())).TrimEnd("`r", "`n")
}

function Invoke-RedisRespCommand {
    param(
        [System.IO.Stream]$Stream,
        [string[]]$Parts
    )

    $payload = ConvertTo-RedisRespCommand -Parts $Parts
    $Stream.Write($payload, 0, $payload.Length)
    $Stream.Flush()
    return Read-RedisRespLine -Stream $Stream
}

function New-ExternalRedisTlsStream {
    param(
        [Parameter(Mandatory)][System.IO.Stream]$Stream,
        [Parameter(Mandatory)][string]$TargetHost,
        [int]$TimeoutMs = 5000
    )

    $sslStream = [System.Net.Security.SslStream]::new($Stream, $false)
    $sslStream.ReadTimeout = $TimeoutMs
    $sslStream.WriteTimeout = $TimeoutMs
    $sslProtocols = [System.Security.Authentication.SslProtocols]::Tls12
    $sslStream.AuthenticateAsClient($TargetHost, $null, $sslProtocols, $true)
    if (-not $sslStream.IsEncrypted -or -not $sslStream.IsAuthenticated) {
        throw "TLS handshake did not produce an authenticated encrypted channel"
    }
    return $sslStream
}

function Get-ExternalRedisPreflightError {
    param(
        [string]$RedisUrl,
        [int]$TimeoutMs = 5000
    )

    $safeRedisUrl = Get-RedactedRedisUrl -RedisUrl $RedisUrl
    $uri = $null
    if (-not [System.Uri]::TryCreate($RedisUrl, [System.UriKind]::Absolute, [ref]$uri)) {
        return "External Redis preflight failed: invalid REDIS_URL ($safeRedisUrl)"
    }
    if ($uri.Scheme -notin @("redis", "rediss")) {
        return "External Redis preflight failed: REDIS_URL must use redis:// or rediss:// ($safeRedisUrl)"
    }
    if (-not $uri.Host) {
        return "External Redis preflight failed: REDIS_URL must include a hostname ($safeRedisUrl)"
    }
    if ($uri.Scheme -eq "redis" -and $uri.UserInfo) {
        return "External Redis preflight failed: authenticated external Redis must use rediss:// so credentials are not sent over plaintext ($safeRedisUrl)"
    }

    $port = if ($uri.Port -gt 0) { $uri.Port } elseif ($uri.Scheme -eq "rediss") { 6380 } else { 6379 }
    $tcpClient = [System.Net.Sockets.TcpClient]::new()
    $stream = $null
    try {
        $connectTask = $tcpClient.ConnectAsync($uri.Host, $port)
        if (-not $connectTask.Wait($TimeoutMs) -or -not $tcpClient.Connected) {
            return "External Redis preflight failed: connection timed out ($safeRedisUrl)"
        }
        $tcpClient.SendTimeout = $TimeoutMs
        $tcpClient.ReceiveTimeout = $TimeoutMs
        $stream = $tcpClient.GetStream()
        $stream.ReadTimeout = $TimeoutMs
        $stream.WriteTimeout = $TimeoutMs

        if ($uri.Scheme -eq "rediss") {
            $stream = New-ExternalRedisTlsStream -Stream $stream -TargetHost $uri.Host -TimeoutMs $TimeoutMs
        }

        if ($uri.UserInfo) {
            $parts = $uri.UserInfo -split ":", 2
            $authCommand = @()
            if ($parts.Count -eq 2) {
                $username = [System.Uri]::UnescapeDataString($parts[0])
                $password = [System.Uri]::UnescapeDataString($parts[1])
                if ($username) {
                    $authCommand = @("AUTH", $username, $password)
                } else {
                    $authCommand = @("AUTH", $password)
                }
            } else {
                $authCommand = @("AUTH", [System.Uri]::UnescapeDataString($parts[0]))
            }

            $authResponse = Invoke-RedisRespCommand -Stream $stream -Parts $authCommand
            if (-not $authResponse.StartsWith("+OK")) {
                return "External Redis preflight failed: AUTH failed ($authResponse)"
            }
        }

        $dbPath = $uri.AbsolutePath.Trim("/")
        if ($dbPath) {
            $selectResponse = Invoke-RedisRespCommand -Stream $stream -Parts @("SELECT", $dbPath)
            if (-not $selectResponse.StartsWith("+OK")) {
                return "External Redis preflight failed: SELECT $dbPath failed ($selectResponse)"
            }
        }

        $pingResponse = Invoke-RedisRespCommand -Stream $stream -Parts @("PING")
        if ($pingResponse -eq "+PONG") {
            return ""
        }

        if ($pingResponse) {
            return "External Redis preflight failed: PING failed ($pingResponse)"
        }
        return "External Redis preflight failed: PING returned no response ($safeRedisUrl)"
    } catch {
        $details = Get-InstallerExceptionDetails -ErrorRecord $_
        $detailText = if ($details.Count -gt 0) { $details -join " | " } else { $_.Exception.Message }
        return "External Redis preflight failed: $detailText ($safeRedisUrl)"
    } finally {
        if ($stream) {
            try { $stream.Dispose() } catch {}
        }
        $tcpClient.Dispose()
    }
}

function Wait-ServicePortReady {
    param(
        [string]$Name,
        [int]$Port,
        [object]$Process,
        [int]$TimeoutSeconds = 10,
        [int]$IntervalMilliseconds = 100
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($Process -and $Process.HasExited) {
            Write-Warn "$Name process stopped while waiting for port $Port (exit $($Process.ExitCode))"
            return $false
        }

        $client = $null
        try {
            $client = [System.Net.Sockets.TcpClient]::new()
            $connect = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
            if ($connect.AsyncWaitHandle.WaitOne([TimeSpan]::FromMilliseconds($IntervalMilliseconds))) {
                $client.EndConnect($connect)
                return $true
            }
        } catch {
        } finally {
            if ($client) {
                $client.Dispose()
            }
        }

        Start-Sleep -Milliseconds $IntervalMilliseconds
    }

    Write-Warn "$Name did not listen on port $Port within ${TimeoutSeconds}s"
    return $false
}

function Start-NodeServiceProcess {
    param(
        [string]$Name,
        [string]$NodeCommand,
        [string[]]$NodeArgs,
        [string]$WorkingDirectory
    )

    $quotedArgs = @($NodeArgs | ForEach-Object { Quote-WindowsProcessArgument -Value $_ })
    $process = Start-Process `
        -FilePath $NodeCommand `
        -ArgumentList $quotedArgs `
        -WorkingDirectory $WorkingDirectory `
        -WindowStyle Hidden `
        -PassThru
    Write-Ok "$Name process started (PID $($process.Id))"
    return $process
}

function Set-RuntimeEnvDefault {
    param(
        [hashtable]$Overrides,
        [string]$Name,
        [string]$DefaultValue
    )

    $currentValue = [System.Environment]::GetEnvironmentVariable($Name, "Process")
    if ($currentValue) {
        $Overrides[$Name] = $currentValue
        return
    }

    $Overrides[$Name] = $DefaultValue
}

function Invoke-PnpmCommand {
    param([string[]]$CommandArgs)
    if (-not $script:pnpmCommand) {
        throw "pnpm command not resolved"
    }
    & $script:pnpmCommand @script:pnpmCommandPrefix @CommandArgs
}

# -- Resolve project root ------------------------------------
$ScriptPath = if ($PSCommandPath) { $PSCommandPath } elseif ($MyInvocation.MyCommand.Path) { $MyInvocation.MyCommand.Path } else { $null }
if (-not $ScriptPath) {
    Write-Err "Could not resolve start-windows.ps1 path. Run with: powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1"
    exit 1
}
$ScriptDir = Split-Path -Parent $ScriptPath
. (Join-Path $ScriptDir "install-windows-helpers.ps1")
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "OfficeClaw - Windows Startup" -ForegroundColor Cyan
Write-Host "=========================="

# -- Load .inner.env (internal defaults) then .env (user overrides) --
# Load order: .inner.env first, .env second
# User values in .env override internal defaults from .inner.env
$innerEnvFile = Join-Path $ProjectRoot ".inner.env"
$envFile = Join-Path $ProjectRoot ".env"

# Load .inner.env first (internal defaults)
if (Test-Path $innerEnvFile) {
    Get-Content $innerEnvFile -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split "=", 2
            if ($parts.Count -eq 2) {
                $key = $parts[0].Trim()
                $val = $parts[1].Trim().Trim('"').Trim("'")
                [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
            }
        }
    }
    Write-Ok ".inner.env loaded (internal defaults)"
}

# Load .env second (user overrides - highest priority)
if (Test-Path $envFile) {
    Get-Content $envFile -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split "=", 2
            if ($parts.Count -eq 2) {
                $key = $parts[0].Trim()
                $val = $parts[1].Trim().Trim('"').Trim("'")
                [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
            }
        }
    }
    Write-Ok ".env loaded (user overrides)"
} else {
    Write-Warn ".env not found - using defaults"
}

$bundledRelease = Test-OfficeClawBundledRelease -ProjectRoot $ProjectRoot
$nodeCommand = Resolve-BundledNodeCommand -ProjectRoot $ProjectRoot
if (-not $nodeCommand) {
    $nodeCommand = Resolve-ToolCommand -Name "node"
}
if (-not $nodeCommand) {
    Write-Err "Node.js not found. Run .\scripts\install.ps1 first or reinstall the packaged bundle."
    exit 1
}
Write-Ok "Node: $nodeCommand"

$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $ProjectRoot "office-claw-skills\.playwright-browsers"
try {
    Ensure-OfficeSkillNodeDependencies -ProjectRoot $ProjectRoot | Out-Null
} catch {
    Write-Warn "Skill dependency refresh failed - continuing startup"
    Write-InstallerExceptionDetails -Context "Skill dependency refresh" -ErrorRecord $_
}

$dareRuntimeReady = Ensure-WindowsDareRuntime -ProjectRoot $ProjectRoot
$jiuwenClawRuntimeReady = Ensure-WindowsJiuwenClawRuntime -ProjectRoot $ProjectRoot

$script:pnpmCommand = $null
$script:pnpmCommandPrefix = @()
if ($bundledRelease) {
    Write-Ok "Bundled release detected - prebuilt runtime enabled"
    if ($Dev) {
        Write-Warn "Bundled release does not support -Dev - using production mode"
        $Dev = $false
    }
    if (-not $Quick) {
        Write-Warn "Bundled release uses prebuilt artifacts - enabling -Quick"
        $Quick = $true
    }
} else {
    $script:pnpmCommand = Resolve-ToolCommandWithRetry -Name "pnpm" -Attempts 2
    if (-not $script:pnpmCommand) {
        $corepackCommand = Resolve-ToolCommandWithRetry -Name "corepack" -Attempts 2
        if ($corepackCommand) {
            $script:pnpmCommand = $corepackCommand
            $script:pnpmCommandPrefix = @("pnpm")
            Write-Ok "pnpm: corepack pnpm ($corepackCommand)"
        }
    }
    if (-not $script:pnpmCommand) {
        Write-Err "pnpm not found. Run .\scripts\install.ps1 first or enable Corepack."
        exit 1
    }
    if ($script:pnpmCommandPrefix.Count -eq 0) {
        Write-Ok "pnpm: $script:pnpmCommand"
    }
}

# -- Ports ---------------------------------------------------
$ConfiguredApiPort = if ($env:API_SERVER_PORT) { [int]$env:API_SERVER_PORT } else { 3004 }
$ConfiguredWebPort = if ($env:FRONTEND_PORT) { [int]$env:FRONTEND_PORT } else { 3003 }
$ConfiguredRedisPort = if ($env:REDIS_PORT) { [int]$env:REDIS_PORT } else { 6399 }
$ConfiguredRedisUrl = if ($env:REDIS_URL) { $env:REDIS_URL.Trim() } else { "" }
$ApiPort = $ConfiguredApiPort
$WebPort = $ConfiguredWebPort
$RedisPort = $ConfiguredRedisPort
$RunDir = Join-Path $ProjectRoot ".office-claw/run/windows"
$ApiPidFile = Join-Path $RunDir "api-$ApiPort.pid"
$WebPidFile = Join-Path $RunDir "web-$WebPort.pid"
$RuntimeStateFile = Join-Path $RunDir "runtime-state.json"
$StopScript = Join-Path $ScriptDir "stop-windows.ps1"
New-Item -Path $RunDir -ItemType Directory -Force | Out-Null
New-Item -Path (Join-Path $ProjectRoot ".office-claw/skills") -ItemType Directory -Force | Out-Null

# -- Kill existing port processes ----------------------------
function Get-ManagedProcessId {
    param([string]$PidFile)
    if (-not (Test-Path $PidFile)) {
        return $null
    }
    try {
        return [int](Get-Content $PidFile -TotalCount 1).Trim()
    } catch {
        return $null
    }
}

function Clear-ManagedProcessId {
    param([string]$PidFile)
    Remove-Item $PidFile -ErrorAction SilentlyContinue
}

function Set-ManagedProcessId {
    param([int]$Port, [string]$PidFile)
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        Set-Content -Path $PidFile -Value "$($listener.OwningProcess)" -Encoding ASCII
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
    param([int]$ProcessId, [string]$ProjectRoot)
    $commandLine = Get-ProcessCommandLine -ProcessId $ProcessId
    if (-not $commandLine) {
        return $false
    }
    # Normalize ProjectRoot with trailing separator to avoid substring false positives
    # e.g. C:\projects\clowder must not match C:\projects\clowder-test
    $normalizedRoot = $ProjectRoot.TrimEnd('\', '/') + '\'
    return (Test-CommandLineContainsLiteral -CommandLine $commandLine -Needle $normalizedRoot) -or
        (Test-CommandLineContainsLiteral -CommandLine $commandLine -Needle ($ProjectRoot + '"')) -or
        (Test-CommandLineContainsLiteral -CommandLine $commandLine -Needle ($ProjectRoot + "'"))
}

function Stop-PortProcess {
    param([int]$Port, [string]$Name, [string]$PidFile, [string]$ProjectRoot)
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        $managedPid = Get-ManagedProcessId -PidFile $PidFile
        foreach ($conn in $connections) {
            $isManagedPid = $managedPid -and ($conn.OwningProcess -eq $managedPid)
            $isOfficeClawOwned = $isManagedPid -or (Test-OfficeClawOwnedProcess -ProcessId $conn.OwningProcess -ProjectRoot $ProjectRoot)
            if (-not $isOfficeClawOwned) {
                Write-Err "Port $Port ($Name) is in use by non-OfficeClaw PID $($conn.OwningProcess). Stop it manually or change the configured port."
                throw "Port $Port ($Name) is in use by a non-OfficeClaw process"
            }
            Write-Warn "Port $Port ($Name) in use by PID $($conn.OwningProcess) - stopping"
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
        Clear-ManagedProcessId -PidFile $PidFile
        Start-Sleep -Seconds 1
    }
}

function Get-ServicePidFile {
    param([string]$ServiceKey, [int]$Port)
    return Join-Path $RunDir "$ServiceKey-$Port.pid"
}

function Find-AvailableFrontendApiPorts {
    param([int[]]$ExcludePorts = @(), [int]$Attempts = 64)

    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        $webPort = Find-AvailableTcpPort -ExcludePorts $ExcludePorts
        if ($webPort -ge 65535) {
            continue
        }

        $apiPort = $webPort + 1
        if ($ExcludePorts -contains $apiPort) {
            continue
        }

        if (-not (Test-TcpPortAvailable -Port $apiPort)) {
            continue
        }

        return [pscustomobject]@{
            WebPort = $webPort
            ApiPort = $apiPort
        }
    }

    throw "Could not find an available frontend/API port pair"
}

function Resolve-ServiceRuntimePort {
    param(
        [string]$ServiceKey,
        [string]$Name,
        [int]$ConfiguredPort,
        [string]$ProjectRoot,
        [bool]$PreferRandom,
        [int[]]$ReservedPorts = @()
    )

    if (-not $PreferRandom) {
        $configuredPidFile = Get-ServicePidFile -ServiceKey $ServiceKey -Port $ConfiguredPort
        try {
            Stop-PortProcess -Port $ConfiguredPort -Name $Name -PidFile $configuredPidFile -ProjectRoot $ProjectRoot
            return $ConfiguredPort
        } catch {
            Write-Warn "Configured port $ConfiguredPort ($Name) is unavailable - selecting a random port instead"
        }
    }

    $randomPort = Find-AvailableTcpPort -ExcludePorts ($ReservedPorts + @($ConfiguredPort))
    Write-Ok "$Name port selected: $randomPort (random)"
    return $randomPort
}

$PreferRandomPorts = Test-TruthyEnvFlag -Value $env:OFFICE_CLAW_WINDOWS_RANDOM_PORTS -Default ($bundledRelease -and -not $Dev)
$BundledDefaultRedisUrl = "redis://localhost:$ConfiguredRedisPort"
if ($PreferRandomPorts -and $ConfiguredRedisUrl -and ($ConfiguredRedisUrl.ToLowerInvariant() -eq $BundledDefaultRedisUrl.ToLowerInvariant())) {
    Remove-Item Env:REDIS_URL -ErrorAction SilentlyContinue
    $ConfiguredRedisUrl = ""
}
$UseRandomFrontendApiPorts = $PreferRandomPorts -and $ConfiguredApiPort -eq 3004 -and $ConfiguredWebPort -eq 3003
$UseRandomRedisPort = $PreferRandomPorts -and -not $ConfiguredRedisUrl -and $ConfiguredRedisPort -eq 6399

if ((Test-Path $RuntimeStateFile) -and (Test-Path $StopScript)) {
    Write-Step "Clear stale runtime state"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $StopScript
}

if ($UseRandomFrontendApiPorts) {
    $portPair = Find-AvailableFrontendApiPorts
    $WebPort = [int]$portPair.WebPort
    $ApiPort = [int]$portPair.ApiPort
    Write-Ok "Frontend port selected: $WebPort (random)"
    Write-Ok "API port selected: $ApiPort (random)"
} else {
    $ApiPort = Resolve-ServiceRuntimePort -ServiceKey "api" -Name "API" -ConfiguredPort $ConfiguredApiPort -ProjectRoot $ProjectRoot -PreferRandom $false
    $WebPort = Resolve-ServiceRuntimePort -ServiceKey "web" -Name "Frontend" -ConfiguredPort $ConfiguredWebPort -ProjectRoot $ProjectRoot -PreferRandom $false -ReservedPorts @([int]$ApiPort)
}

$ApiPidFile = Join-Path $RunDir "api-$ApiPort.pid"
$WebPidFile = Join-Path $RunDir "web-$WebPort.pid"
$env:API_SERVER_PORT = "$ApiPort"
$env:FRONTEND_PORT = "$WebPort"

Write-Step "Check ports"
Stop-PortProcess -Port ([int]$ApiPort) -Name "API" -PidFile $ApiPidFile -ProjectRoot $ProjectRoot
Stop-PortProcess -Port ([int]$WebPort) -Name "Frontend" -PidFile $WebPidFile -ProjectRoot $ProjectRoot

# -- Storage (Redis or Memory) -------------------------------
Write-Step "Storage"

$useRedis = -not $Memory
$startedRedis = $false
$redisLayout = Resolve-PortableRedisLayout -ProjectRoot $ProjectRoot
$redisCliPath = $null
$redisServerPath = $null
$redisSource = $null
$redisAuthArgs = @()
$redisLogFile = Join-Path $redisLayout.Logs "redis-$RedisPort.log"
$redisPidFile = Join-Path $redisLayout.Data "redis-$RedisPort.pid"
$configuredRedisUrl = $ConfiguredRedisUrl
$useExternalRedis = $useRedis -and $configuredRedisUrl -and -not (Test-LocalRedisUrl -RedisUrl $configuredRedisUrl -RedisPort $RedisPort)
$safeConfiguredRedisUrl = Get-RedactedRedisUrl -RedisUrl $configuredRedisUrl

if ($useExternalRedis) {
    Write-Ok "Using external Redis: $safeConfiguredRedisUrl"
    $externalRedisError = Get-ExternalRedisPreflightError -RedisUrl $configuredRedisUrl
    if ($externalRedisError) {
        Write-Err $externalRedisError
        throw $externalRedisError
    }
    Write-Ok "External Redis preflight passed (PING=PONG)"
} elseif ($useRedis) {
    $redisInstallReady = Ensure-WindowsRedis -ProjectRoot $ProjectRoot -Memory:$false
    if (-not $redisInstallReady) {
        Write-Err "Redis auto-install did not resolve Redis"
        throw "Redis auto-install failed: Redis binaries not found"
    }

    $redisCommands = Resolve-PortableRedisBinaries -ProjectRoot $ProjectRoot
    if (-not $redisCommands) {
        $redisCommands = Resolve-GlobalRedisBinaries
    }
    if ($redisCommands) {
        $redisCliPath = $redisCommands.CliPath
        $redisServerPath = $redisCommands.ServerPath
        $redisSource = $redisCommands.Source
        Write-Ok "Redis binaries resolved ($redisSource): $($redisCommands.BinDir)"
    }
    # -- Read stored password from Credential Manager (best-effort) ---
    $localRedisPassword = $null
    try {
        $localRedisPassword = Read-OfficeClawCredential -Path "redis/password"
        if ($localRedisPassword) {
            Write-Ok "Redis auth: Credential Manager password found"
        }
    } catch {
        Write-Warn "Redis auth: Credential Manager read failed - continuing with generated password if needed"
        Write-InstallerExceptionDetails -Context "Redis credential read" -ErrorRecord $_
    }

    if ($UseRandomRedisPort) {
        $RedisPort = Find-AvailableTcpPort -ExcludePorts @([int]$ApiPort, [int]$WebPort, $ConfiguredRedisPort)
        $redisLogFile = Join-Path $redisLayout.Logs "redis-$RedisPort.log"
        $redisPidFile = Join-Path $redisLayout.Data "redis-$RedisPort.pid"
        Write-Ok "Redis port selected: $RedisPort (random)"
    }

    # -- Preserve DB suffix (e.g. /5) from original configured URL ---
    $originalDbSuffix = ""
    if ($configuredRedisUrl) {
        try {
            $origUri = [System.Uri]::new($configuredRedisUrl)
            if ($origUri.AbsolutePath -and $origUri.AbsolutePath -ne "/") {
                $originalDbSuffix = $origUri.AbsolutePath
            }
        } catch {}
    }

    # -- Phase 1: Probe existing Redis on target port ---
    $probeSuccess = $false
    $redisAuthFromCM = $false
    $redisListener = Get-NetTCPConnection -LocalPort $RedisPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($redisListener -and $redisCliPath) {
        Write-Warn "Redis port $RedisPort already has a listener (PID $($redisListener.OwningProcess)); probing with redis-cli"
        # Probe with CM password (most likely for our own Redis)
        if (-not $probeSuccess -and $localRedisPassword) {
            $escapedPwd = [System.Uri]::EscapeDataString($localRedisPassword)
            $cmUrl = "redis://:${escapedPwd}@localhost:${RedisPort}"
            $cmAuthArgs = Get-RedisAuthArgs -RedisUrl $cmUrl
            $ping = Invoke-RedisPingOnce -RedisCliPath $redisCliPath -Port $RedisPort -AuthArgs $cmAuthArgs
            if ($ping -eq "PONG") {
                $probeSuccess = $true
                $redisAuthFromCM = $true
                $configuredRedisUrl = "redis://:${escapedPwd}@localhost:${RedisPort}${originalDbSuffix}"
                Write-Ok "Redis auth: connected with Credential Manager password"
            }
        }
        # Probe with configured URL (user-set password or bare URL)
        if (-not $probeSuccess) {
            $cfgAuthArgs = Get-RedisAuthArgs -RedisUrl $configuredRedisUrl
            $ping = Invoke-RedisPingOnce -RedisCliPath $redisCliPath -Port $RedisPort -AuthArgs $cfgAuthArgs
            if ($ping -eq "PONG") {
                $probeSuccess = $true
                Write-Ok "Redis auth: connected with configured URL"
            }
        }
    } elseif ($redisListener) {
        Write-Warn "Redis port $RedisPort already has a listener (PID $($redisListener.OwningProcess)), but redis-cli is unavailable for probing"
    } else {
        Write-Ok "No existing Redis listener on port $RedisPort"
    }

    if ($redisListener -and -not $probeSuccess) {
        $pingFailure = if ($redisCliPath) {
            Get-RedisPingFailureDetail -RedisCliPath $redisCliPath -Port $RedisPort -AuthArgs (Get-RedisAuthArgs -RedisUrl $configuredRedisUrl)
        } else {
            "redis-cli unavailable"
        }
        Write-Err "Redis port $RedisPort is in use but did not respond to Redis PING"
        Write-Warn "Redis listener PID: $($redisListener.OwningProcess)"
        Write-Warn "Redis ping detail: $pingFailure"
        throw "Redis port $RedisPort is occupied by a non-Redis or incompatible Redis process"
    }

    if ($probeSuccess) {
        # -- Reuse existing Redis ---
        $redisConnections = Get-NetTCPConnection -LocalPort $RedisPort -State Listen -ErrorAction SilentlyContinue
        if ($redisConnections) {
            $managedRedisPid = Get-ManagedProcessId -PidFile $redisPidFile
            foreach ($conn in $redisConnections) {
                $isManagedPid = $managedRedisPid -and ($conn.OwningProcess -eq $managedRedisPid)
                $isOfficeClawOwned = $isManagedPid -or (Test-OfficeClawOwnedProcess -ProcessId $conn.OwningProcess -ProjectRoot $ProjectRoot)
                if (-not $isOfficeClawOwned) {
                    Write-Warn "Redis port $RedisPort is in use by non-OfficeClaw PID $($conn.OwningProcess) - reusing existing local Redis"
                }
            }
        }
        Write-Ok "Redis already running on port $RedisPort"
        $redisAuthArgs = Get-RedisAuthArgs -RedisUrl $configuredRedisUrl
        if ($configuredRedisUrl) {
            $env:REDIS_URL = $configuredRedisUrl
        } else {
            $env:REDIS_URL = "redis://localhost:$RedisPort"
        }
        $env:REDIS_PORT = "$RedisPort"
    } else {
        # -- Phase 2: Start new Redis with auth ---
        $redisAuthFromCM = $true
        $generatedRedisPassword = $false
        if (-not $localRedisPassword) {
            $bytes = New-Object byte[] 24
            $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
            $rng.GetBytes($bytes)
            $rng.Dispose()
            $localRedisPassword = [Convert]::ToBase64String($bytes)
            $generatedRedisPassword = $true
            Write-Ok "Redis auth: new password generated"
        }
        if ($generatedRedisPassword) {
            try { Write-OfficeClawCredential -Path "redis/password" -Secret $localRedisPassword } catch {}
        }
        $escapedPwd = [System.Uri]::EscapeDataString($localRedisPassword)
        $configuredRedisUrl = "redis://:${escapedPwd}@localhost:${RedisPort}${originalDbSuffix}"
        $redisAuthArgs = Get-RedisAuthArgs -RedisUrl $configuredRedisUrl
        try {
            if ($redisServerPath) {
                New-Item -Path $redisLayout.Data -ItemType Directory -Force | Out-Null
                New-Item -Path $redisLayout.Logs -ItemType Directory -Force | Out-Null
                $redisAclFile = Join-Path $redisLayout.Data "redis-$RedisPort.acl"
                $redisServerAuthArgs = Get-RedisServerAuthArgs -RedisUrl $configuredRedisUrl -AclFilePath $redisAclFile
                $redisArgs = @(
                    "--port", $RedisPort,
                    "--bind", "127.0.0.1",
                    "--dir", (Quote-WindowsProcessArgument -Value $redisLayout.Data),
                    "--logfile", (Quote-WindowsProcessArgument -Value $redisLogFile),
                    "--pidfile", (Quote-WindowsProcessArgument -Value $redisPidFile)
                ) + $redisServerAuthArgs
                Write-Host "  Starting Redis on port $RedisPort ($redisSource)..."
                $redisProcess = Start-Process -FilePath $redisServerPath -ArgumentList $redisArgs -WindowStyle Hidden -PassThru
                if (Wait-RedisPing -RedisCliPath $redisCliPath -Port $RedisPort -AuthArgs $redisAuthArgs) {
                    Write-Ok "Redis started on port $RedisPort"
                    $env:REDIS_URL = $configuredRedisUrl
                    $env:REDIS_PORT = "$RedisPort"
                    $startedRedis = $true
                } else {
                    $pingFailure = Get-RedisPingFailureDetail -RedisCliPath $redisCliPath -Port $RedisPort -AuthArgs $redisAuthArgs
                    Write-Err "Redis start failed: ping did not return PONG on port $RedisPort within 10s"
                    Write-Warn "Redis ping detail: $pingFailure"
                    Write-Warn "Redis log file: $redisLogFile"
                    Write-RedisLogTail -RedisLogFile $redisLogFile
                    try {
                        if ($redisProcess -and $redisProcess.HasExited) {
                            Write-Warn "Redis process exited before readiness (exit $($redisProcess.ExitCode))"
                        } elseif ($redisProcess) {
                            Stop-Process -Id $redisProcess.Id -Force -ErrorAction SilentlyContinue
                        }
                    } catch {}
                    throw "Redis start failed: ping did not return PONG on port $RedisPort"
                }
            } else {
                Write-Err "Redis startup failed: Redis binaries were not found"
                Write-Warn "Run .\\scripts\\install.ps1 again to fetch the project-local Redis bundle into .office-claw/redis/windows."
                throw "Redis startup failed: Redis binaries not found"
            }
        } catch {
            Write-Err "Redis start failed - startup aborted"
            Write-InstallerExceptionDetails -Context "Redis start" -ErrorRecord $_
            throw
        }
    }
}

if (-not $useRedis) {
    Write-Warn "Memory mode (-Memory) - data will be lost on restart"
    Remove-Item Env:REDIS_URL -ErrorAction SilentlyContinue
    Remove-Item Env:REDIS_PORT -ErrorAction SilentlyContinue
    $env:MEMORY_STORE = "1"
}

try {
    # -- Build (unless -Quick) ----------------------------------
    if (-not $Quick) {
        Write-Step "Build packages"

        Write-Host "  Building shared..."
        Push-Location (Join-Path $ProjectRoot "packages/shared")
        Invoke-PnpmCommand @("run", "build")
        if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err "Build failed: shared"; throw "Build failed: shared" }
        Pop-Location
        Write-Ok "shared"

        Write-Host "  Building mcp-server..."
        Push-Location (Join-Path $ProjectRoot "packages/mcp-server")
        Invoke-PnpmCommand @("run", "build")
        if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err "Build failed: mcp-server"; throw "Build failed: mcp-server" }
        Pop-Location
        Write-Ok "mcp-server"

        Write-Host "  Building api..."
        Push-Location (Join-Path $ProjectRoot "packages/api")
        Invoke-PnpmCommand @("run", "build")
        if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err "Build failed: api"; throw "Build failed: api" }
        Pop-Location
        Write-Ok "api"

    } else {
        Write-Step "Skip build (-Quick)"
    }

    # -- Configure MCP server path -------------------------------
    $mcpPath = Join-Path $ProjectRoot "packages/mcp-server/dist/index.js"
    if (Test-Path $mcpPath) {
        $env:OFFICE_CLAW_MCP_SERVER_PATH = $mcpPath
        Write-Ok "MCP server path: $mcpPath"
    }

    $apiEntry = Join-Path $ProjectRoot "packages/api/dist/cli.js"
    if (-not (Test-Path $apiEntry)) {
        Write-Err "API build artifact not found - run without -Quick first to build"
        throw "API build artifact not found"
    }

    $webRoot = Join-Path $ProjectRoot "packages/web"
    $webDistIndex = Join-Path $webRoot "dist/index.html"
    if (-not $Dev -and -not (Test-Path $webDistIndex)) {
        Write-Err "Web build not found (packages/web/dist/index.html) - run without -Quick first to build"
        throw "Web dist not found"
    }

    $webStandaloneServer = Join-Path $webRoot "server.cjs"
    $usingStandaloneWebRuntime = (-not $Dev) -and (Test-Path $webStandaloneServer)
    $viteCli = @(
        (Join-Path $webRoot "node_modules/vite/bin/vite.js"),
        (Join-Path $ProjectRoot "node_modules/vite/bin/vite.js")
    ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    # 打包环境通常没有 vite（仅 server.cjs + dist）；$viteCli 可能为 $null，禁止对 null 调用 Test-Path
    $viteCliOk = $false
    if ($null -ne $viteCli -and (Test-Path -LiteralPath $viteCli)) {
        $viteCliOk = $true
    }
    if (-not $usingStandaloneWebRuntime -and -not $viteCliOk) {
        Write-Err "Vite not found - run pnpm install first or rebuild the packaged bundle"
        throw "Vite not found"
    }

    # -- Start services ------------------------------------------
    Write-Step "Start services"

    # Track child service processes for cleanup
    $serviceProcesses = @()
$runtimeEnvOverrides = @{
    REDIS_URL = $env:REDIS_URL
    REDIS_PORT = $env:REDIS_PORT
    MEMORY_STORE = $env:MEMORY_STORE
    OFFICE_CLAW_MCP_SERVER_PATH = $env:OFFICE_CLAW_MCP_SERVER_PATH
    PLAYWRIGHT_BROWSERS_PATH = $env:PLAYWRIGHT_BROWSERS_PATH
    API_SERVER_PORT = $ApiPort
    FRONTEND_PORT = $WebPort
    NEXT_PUBLIC_API_URL = "http://127.0.0.1:$ApiPort"
}
    if ($bundledRelease) {
        $runtimeEnvOverrides.OFFICE_CLAW_CONFIG_ROOT = $ProjectRoot
        $bundledTemplatePath = Join-Path $ProjectRoot "office-claw-template.json"
        if (Test-Path $bundledTemplatePath) {
            $runtimeEnvOverrides.CAT_TEMPLATE_PATH = $bundledTemplatePath
        }
    }
    Set-RuntimeEnvDefault -Overrides $runtimeEnvOverrides -Name "OFFICE_CLAW_AUTH_PROVIDER" -DefaultValue "no-auth"
    Set-RuntimeEnvDefault -Overrides $runtimeEnvOverrides -Name "OFFICE_CLAW_SKIP_AUTH" -DefaultValue "0"
    Set-RuntimeEnvDefault -Overrides $runtimeEnvOverrides -Name "CAT_CAFE_SKIP_AUTH" -DefaultValue "0"
    Set-RuntimeEnvDefault -Overrides $runtimeEnvOverrides -Name "OFFICE_CLAW_EVIDENCE_PROVIDER" -DefaultValue "sqlite"
    Set-RuntimeEnvDefault -Overrides $runtimeEnvOverrides -Name "OFFICE_CLAW_EVIDENCE_PROVIDER_MODULES" -DefaultValue "@openjiuwen/relay-storage-sqlite/evidence"
    Set-RuntimeEnvDefault -Overrides $runtimeEnvOverrides -Name "OFFICE_CLAW_SCHEDULER_PROVIDER" -DefaultValue "sqlite"
    Set-RuntimeEnvDefault -Overrides $runtimeEnvOverrides -Name "OFFICE_CLAW_SCHEDULER_PROVIDER_MODULES" -DefaultValue "@openjiuwen/relay-storage-sqlite/scheduler"
    Set-RuntimeEnvDefault -Overrides $runtimeEnvOverrides -Name "OFFICE_CLAW_STORAGE_PROVIDER_MODULES" -DefaultValue "@openjiuwen/relay-storage-sqlite"
    Set-RuntimeEnvDefault -Overrides $runtimeEnvOverrides -Name "OFFICE_CLAW_APPROVAL_RECORD_PROVIDER" -DefaultValue "sqlite-approval-records"

    Write-WindowsRuntimeStateFile -StateFile $RuntimeStateFile -State ([ordered]@{
        GeneratedAt = (Get-Date).ToString("o")
        ProjectRoot = $ProjectRoot
        FrontendUrl = "http://127.0.0.1:$WebPort/"
        ApiUrl = "http://127.0.0.1:$ApiPort"
        ApiPort = [int]$ApiPort
        WebPort = [int]$WebPort
        RedisPort = if ($useRedis -and -not $useExternalRedis) { [int]$RedisPort } else { $null }
        RedisUrl = if ($redisAuthFromCM -and $env:REDIS_URL) { Get-RedactedRedisUrl -RedisUrl $env:REDIS_URL } elseif ($env:REDIS_URL) { $env:REDIS_URL } else { "" }
        RedisAuthFromCredentialManager = [bool]$redisAuthFromCM
        UseExternalRedis = [bool]$useExternalRedis
        RedisStartedByLauncher = [bool]$startedRedis
        PreferRandomPorts = [bool]$PreferRandomPorts
        ApiPidFile = $ApiPidFile
        WebPidFile = $WebPidFile
        RedisPidFile = $redisPidFile
    })

    foreach ($entry in $runtimeEnvOverrides.GetEnumerator()) {
        if ($null -eq $entry.Value -or $entry.Value -eq "") {
            [System.Environment]::SetEnvironmentVariable($entry.Key, $null, "Process")
        } else {
            [System.Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, "Process")
        }
    }

    # API Server
    Write-Host "  Starting API Server (port $ApiPort)..."
    $apiArgs = @($apiEntry)
    if ($Debug) {
        $env:LOG_LEVEL = "debug"
        $apiArgs += "--debug"
    }
    $apiProcess = Start-NodeServiceProcess -Name "API" -NodeCommand $nodeCommand -NodeArgs $apiArgs -WorkingDirectory (Join-Path $ProjectRoot "packages/api")
    $serviceProcesses += [pscustomobject]@{ Name = "api"; Process = $apiProcess }

    # Frontend
    if ($Dev) {
        # Development mode: Vite dev (hot reload)
        Write-Host "  Starting Frontend (port $WebPort, vite dev)..."
        $env:FRONTEND_PORT = "$WebPort"
        $env:PORT = "$WebPort"
        $webProcess = Start-NodeServiceProcess -Name "Frontend" -NodeCommand $nodeCommand -NodeArgs @($viteCli, "--host", "127.0.0.1", "--port", "$WebPort", "--strictPort") -WorkingDirectory $webRoot
    } elseif ($usingStandaloneWebRuntime) {
        # Production mode: packaged static server (server.cjs + dist) when present.
        Write-Host "  Starting Frontend (port $WebPort, standalone)..."
        $env:PORT = "$WebPort"
        $env:HOSTNAME = "127.0.0.1"
        $webProcess = Start-NodeServiceProcess -Name "Frontend" -NodeCommand $nodeCommand -NodeArgs @($webStandaloneServer) -WorkingDirectory $webRoot
    } else {
        # Production mode fallback: vite preview (serves packages/web/dist)
        Write-Host "  Starting Frontend (port $WebPort, vite preview)..."
        $env:FRONTEND_PORT = "$WebPort"
        $env:PORT = "$WebPort"
        $webProcess = Start-NodeServiceProcess -Name "Frontend" -NodeCommand $nodeCommand -NodeArgs @($viteCli, "preview", "--host", "127.0.0.1", "--port", "$WebPort", "--strictPort") -WorkingDirectory $webRoot
    }
    $serviceProcesses += [pscustomobject]@{ Name = "web"; Process = $webProcess }

    Wait-ServicePortReady -Name "API" -Port ([int]$ApiPort) -Process $apiProcess -TimeoutSeconds 45 | Out-Null
    Wait-ServicePortReady -Name "Frontend" -Port ([int]$WebPort) -Process $webProcess -TimeoutSeconds 60 | Out-Null

    Set-Content -Path $ApiPidFile -Value "$($apiProcess.Id)" -Encoding ASCII
    Set-Content -Path $WebPidFile -Value "$($webProcess.Id)" -Encoding ASCII

    # -- Status --------------------------------------------------
    $effectiveRedisUrl = if ($env:REDIS_URL) { $env:REDIS_URL } else { "" }
    $safeEffectiveRedisUrl = Get-RedactedRedisUrl -RedisUrl $effectiveRedisUrl
    $storageMode = if ($useRedis -and $safeEffectiveRedisUrl) { "Redis ($safeEffectiveRedisUrl)" } elseif ($useRedis) { "Redis (redis://localhost:$RedisPort)" } else { "Memory (restart loses data)" }
    $frontendMode = if ($Dev) {
        "development (hot reload)"
    } elseif ($usingStandaloneWebRuntime) {
        "production (standalone static server)"
    } else {
        "production (vite preview)"
    }
    $logDir = Join-Path $ProjectRoot "data/logs/api"

    Write-Host ""
    Write-Host "  ========================================" -ForegroundColor Green
    Write-Host "  OfficeClaw started!" -ForegroundColor Green
    Write-Host "  ========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Frontend: http://localhost:$WebPort"
    Write-Host "  API:      http://localhost:$ApiPort"
    Write-Host "  Storage:  $storageMode"
    Write-Host "  Frontend: $frontendMode"
    if ($Debug) {
        Write-Host "  Debug:    ON (logs: $logDir)" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "  Press Ctrl+C to stop all services" -ForegroundColor Yellow
    Write-Host ""

    # -- Wait ----------------------------------------------------
    $serviceFailure = $false
    while ($true) {
        $stoppedProcesses = $serviceProcesses | Where-Object { $_.Process.HasExited }
        if ($stoppedProcesses.Count -gt 0) {
            foreach ($serviceProcess in $stoppedProcesses) {
                Write-Warn "Service process '$($serviceProcess.Name)' stopped (exit $($serviceProcess.Process.ExitCode))"
            }
            $serviceFailure = $true
            break
        }

        Start-Sleep -Seconds 2
    }
} finally {
    Write-Host "`nShutting down..." -ForegroundColor Yellow

    foreach ($serviceProcess in $serviceProcesses) {
        try {
            if ($serviceProcess.Process -and -not $serviceProcess.Process.HasExited) {
                Stop-Process -Id $serviceProcess.Process.Id -Force -ErrorAction SilentlyContinue
            }
        } catch {}
    }
    Clear-ManagedProcessId -PidFile $ApiPidFile
    Clear-ManagedProcessId -PidFile $WebPidFile
    Remove-WindowsRuntimeStateFile -StateFile $RuntimeStateFile

    if ($startedRedis) {
        try {
            & { $ErrorActionPreference = 'SilentlyContinue'; & $redisCliPath -p $RedisPort @redisAuthArgs shutdown save 2>$null }
            Write-Ok "Redis stopped"
        } catch {
            Write-Warn "Could not stop Redis gracefully"
        }
    }

    Write-Host "Goodbye!" -ForegroundColor Cyan
}

if ($serviceFailure) {
    exit 1
}
