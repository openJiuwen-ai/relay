. (Join-Path $PSScriptRoot "windows-command-helpers.ps1")
. (Join-Path $PSScriptRoot "windows-installer-ui.ps1")

function Add-ProcessPathPrefix {
    param([string]$Directory)
    if (-not $Directory -or -not (Test-Path $Directory)) {
        return
    }
    $segments = @($env:Path -split ";" | Where-Object { $_ })
    if ($segments -notcontains $Directory) {
        $env:Path = "$Directory;$env:Path"
    }
}

function Test-CommandLineContainsLiteral {
    param([string]$CommandLine, [string]$Needle)

    if (-not $CommandLine -or -not $Needle) {
        return $false
    }

    return $CommandLine.IndexOf($Needle, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Resolve-PortableRedisLayout {
    param([string]$ProjectRoot)
    $root = Join-Path $ProjectRoot ".office-claw\redis\windows"
    [pscustomobject]@{
        Root = $root
        ArchiveDir = Join-Path $root "archives"
        Current = Join-Path $root "current"
        Data = Join-Path $root "data"
        Logs = Join-Path $root "logs"
        VersionFile = Join-Path $root "current-release.txt"
    }
}

function Resolve-PortableRedisBinaries {
    param([string]$ProjectRoot)
    if (-not $ProjectRoot) { return $null }
    $layout = Resolve-PortableRedisLayout -ProjectRoot $ProjectRoot
    if (-not (Test-Path $layout.Current)) { return $null }
    $redisServer = Get-ChildItem $layout.Current -Recurse -Filter "redis-server.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    $redisCli = Get-ChildItem $layout.Current -Recurse -Filter "redis-cli.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $redisServer -or -not $redisCli) { return $null }
    Add-ProcessPathPrefix -Directory $redisServer.Directory.FullName
    [pscustomobject]@{
        Source = "project-local"
        ServerPath = $redisServer.FullName
        CliPath = $redisCli.FullName
        BinDir = $redisServer.Directory.FullName
    }
}

function Resolve-GlobalRedisBinaries {
    $redisServer = Get-Command redis-server -ErrorAction SilentlyContinue
    $redisCli = Get-Command redis-cli -ErrorAction SilentlyContinue
    if (-not $redisServer -or -not $redisCli) { return $null }
    [pscustomobject]@{
        Source = "global"
        ServerPath = $redisServer.Source
        CliPath = $redisCli.Source
        BinDir = Split-Path -Parent $redisServer.Source
    }
}

function Test-LocalRedisUrl {
    param([string]$RedisUrl, [string]$RedisPort)

    if (-not $RedisUrl) {
        return $false
    }

    $uri = $null
    if (-not [System.Uri]::TryCreate($RedisUrl, [System.UriKind]::Absolute, [ref]$uri)) {
        return $false
    }

    $isLoopbackHost = $uri.Host -eq "localhost"
    $ipAddress = $null
    if (-not $isLoopbackHost -and [System.Net.IPAddress]::TryParse($uri.Host, [ref]$ipAddress)) {
        $isLoopbackHost = [System.Net.IPAddress]::IsLoopback($ipAddress)
    }

    if (-not $isLoopbackHost) {
        return $false
    }

    if ($uri.Port -gt 0 -and "$($uri.Port)" -ne "$RedisPort") {
        return $false
    }

    return $true
}

function Get-InstallerExternalRedisValidationError {
    param([string]$RedisUrl, [int]$TimeoutMs = 3000)

    if (-not $RedisUrl) {
        return "External Redis URL is empty."
    }

    $uri = $null
    if (-not [System.Uri]::TryCreate($RedisUrl, [System.UriKind]::Absolute, [ref]$uri)) {
        return "External Redis URL must be an absolute redis:// or rediss:// URL."
    }

    if ($uri.Scheme -notin @("redis", "rediss")) {
        return "External Redis URL must use redis:// or rediss://."
    }

    if (-not $uri.Host) {
        return "External Redis URL must include a hostname."
    }

    $port = if ($uri.Port -gt 0) { $uri.Port } elseif ($uri.Scheme -eq "rediss") { 6380 } else { 6379 }
    $safeRedisUrl = Get-RedactedRedisUrl -RedisUrl $RedisUrl
    $tcpClient = [System.Net.Sockets.TcpClient]::new()
    try {
        $connectTask = $tcpClient.ConnectAsync($uri.Host, $port)
        if (-not $connectTask.Wait($TimeoutMs) -or -not $tcpClient.Connected) {
            return "External Redis URL is not reachable: $safeRedisUrl"
        }
    } catch {
        return "External Redis URL is not reachable: $safeRedisUrl"
    } finally {
        $tcpClient.Dispose()
    }

    return ""
}

function Quote-WindowsProcessArgument {
    param([string]$Value)

    if ($null -eq $Value -or $Value -eq "") {
        return '""'
    }

    if ($Value -notmatch '[\s"]') {
        return $Value
    }

    $escaped = $Value -replace '(\\*)"', '$1$1\"'
    $escaped = $escaped -replace '(\\+)$', '$1$1'
    return '"' + $escaped + '"'
}

function Get-RedactedRedisUrl {
    param([string]$RedisUrl)
    if (-not $RedisUrl) { return "" }
    try {
        $uri = [System.Uri]::new($RedisUrl)
        if (-not $uri.UserInfo) { return $RedisUrl }
        $authority = if ($uri.Port -gt 0) { "$($uri.Host):$($uri.Port)" } else { $uri.Host }
        return "$($uri.Scheme)://$authority$($uri.AbsolutePath)"
    } catch {
        return $RedisUrl -replace '://[^@]+@', '://'
    }
}

function Get-RedisAuthArgs {
    param([string]$RedisUrl)
    if (-not $RedisUrl) { return @() }
    try {
        $uri = [System.Uri]::new($RedisUrl)
        $userInfo = $uri.UserInfo
        if (-not $userInfo) { return @() }
        $parts = $userInfo -split ":", 2
        $authArgs = @()
        if ($parts.Count -eq 2) {
            if ($parts[0]) { $authArgs += @("--user", [System.Uri]::UnescapeDataString($parts[0])) }
            if ($parts[1]) { $authArgs += @("-a", [System.Uri]::UnescapeDataString($parts[1]), "--no-auth-warning") }
        } elseif ($parts[0]) {
            $authArgs += @("-a", [System.Uri]::UnescapeDataString($parts[0]), "--no-auth-warning")
        }
        return $authArgs
    } catch {}
    return @()
}

function Get-RedisServerAuthArgs {
    param([string]$RedisUrl, [string]$AclFilePath)
    if (-not $RedisUrl) { return @() }
    try {
        $uri = [System.Uri]::new($RedisUrl)
        $userInfo = $uri.UserInfo
        if (-not $userInfo) { return @() }

        $parts = $userInfo -split ":", 2
        $username = ""
        $password = ""
        if ($parts.Count -eq 2) {
            $username = if ($parts[0]) { [System.Uri]::UnescapeDataString($parts[0]) } else { "" }
            $password = if ($parts[1]) { [System.Uri]::UnescapeDataString($parts[1]) } else { "" }
        } elseif ($parts[0]) {
            $password = [System.Uri]::UnescapeDataString($parts[0])
        }

        if (-not $password) { return @() }

        if ($username) {
            if (-not $AclFilePath) {
                throw "AclFilePath is required for Redis ACL usernames"
            }
            $aclLines = if ($username -eq "default") {
                @("user default on >$password allkeys allcommands")
            } else {
                @(
                    "user default off",
                    "user $username on >$password allkeys allcommands"
                )
            }
            $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllLines($AclFilePath, $aclLines, $utf8NoBom)
            return @("--aclfile", (Quote-WindowsProcessArgument -Value $AclFilePath))
        }

        return @("--requirepass", (Quote-WindowsProcessArgument -Value $password))
    } catch {}
    return @()
}

# -- Windows Credential Manager helpers -------------------------

function Initialize-WinCredNative {
    if (-not ('WinCredNative' -as [type])) {
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class WinCredNative {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public UInt32 Flags;
        public UInt32 Type;
        public string TargetName;
        public string Comment;
        public long LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist;
        public UInt32 AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }
    [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, UInt32 type, UInt32 reservedFlag, out IntPtr credentialPtr);
    [DllImport("Advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite(ref CREDENTIAL credential, UInt32 flags);
    [DllImport("Advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr credentialPtr);
}
"@
    }
}

function Read-OfficeClawCredential {
    param([Parameter(Mandatory)][string]$Path)
    Initialize-WinCredNative
    $target = "OfficeClaw/$Path"
    $credPtr = [IntPtr]::Zero
    $ok = [WinCredNative]::CredRead($target, 1, 0, [ref]$credPtr)
    if (-not $ok) {
        $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        if ($err -eq 1168) { return $null }
        throw "CredRead failed for '$target': Win32 error $err"
    }
    try {
        $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($credPtr, [type][WinCredNative+CREDENTIAL])
        if ($cred.CredentialBlobSize -le 0 -or $cred.CredentialBlob -eq [IntPtr]::Zero) { return "" }
        $bytes = New-Object byte[] $cred.CredentialBlobSize
        [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)
        return [System.Text.Encoding]::Unicode.GetString($bytes).TrimEnd([char]0)
    } finally {
        if ($credPtr -ne [IntPtr]::Zero) { [WinCredNative]::CredFree($credPtr) }
    }
}

function Write-OfficeClawCredential {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Secret
    )
    Initialize-WinCredNative
    $target = "OfficeClaw/$Path"
    $bytes = [System.Text.Encoding]::Unicode.GetBytes($Secret)
    $blob = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
    try {
        [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blob, $bytes.Length)
        $cred = New-Object WinCredNative+CREDENTIAL
        $cred.Type = 1
        $cred.TargetName = $target
        $cred.CredentialBlobSize = $bytes.Length
        $cred.CredentialBlob = $blob
        $cred.Persist = 2
        $cred.UserName = $target
        if (-not [WinCredNative]::CredWrite([ref]$cred, 0)) {
            $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            throw "CredWrite failed for '$target': Win32 error $err"
        }
    } finally {
        if ($blob -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($blob) }
    }
}

function Test-TruthyEnvFlag {
    param([string]$Value, [bool]$Default = $false)

    if ($null -eq $Value -or $Value -eq "") {
        return $Default
    }

    switch ($Value.Trim().ToLowerInvariant()) {
        "1" { return $true }
        "true" { return $true }
        "yes" { return $true }
        "on" { return $true }
        "0" { return $false }
        "false" { return $false }
        "no" { return $false }
        "off" { return $false }
        default { return $Default }
    }
}

function Test-TcpPortAvailable {
    param([int]$Port)

    if ($Port -le 0 -or $Port -gt 65535) {
        return $false
    }

    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Server.ExclusiveAddressUse = $true
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        if ($listener) {
            $listener.Stop()
        }
    }
}

function Find-AvailableTcpPort {
    param([int[]]$ExcludePorts = @(), [int]$Attempts = 64)

    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        $listener = $null
        try {
            $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
            $listener.Server.ExclusiveAddressUse = $true
            $listener.Start()
            $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
            if ($ExcludePorts -notcontains $port) {
                return $port
            }
        } finally {
            if ($listener) {
                $listener.Stop()
            }
        }
    }

    throw "Could not find an available TCP port"
}

function Read-WindowsRuntimeStateFile {
    param([string]$StateFile)

    if (-not $StateFile -or -not (Test-Path $StateFile)) {
        return $null
    }

    try {
        return Get-Content $StateFile -Raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Write-WindowsRuntimeStateFile {
    param([string]$StateFile, $State)

    if (-not $StateFile -or $null -eq $State) {
        return
    }

    $parentDir = Split-Path -Parent $StateFile
    if ($parentDir) {
        New-Item -Path $parentDir -ItemType Directory -Force | Out-Null
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $json = $State | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($StateFile, $json + "`r`n", $utf8NoBom)
}

function Remove-WindowsRuntimeStateFile {
    param([string]$StateFile)

    if (-not $StateFile) {
        return
    }

    Remove-Item $StateFile -ErrorAction SilentlyContinue
}

function Get-InstallerExceptionDetails {
    param($ErrorRecord)

    if (-not $ErrorRecord) {
        return @()
    }

    $details = @()
    $exception = $ErrorRecord.Exception
    $level = 0
    while ($exception) {
        $message = $exception.Message
        $typeName = $exception.GetType().FullName
        if ($message) {
            $details += "[$level] $($typeName): $message"
        } elseif ($typeName) {
            $details += "[$level] $typeName"
        }
        $exception = $exception.InnerException
        $level++
    }

    if ($details.Count -eq 0 -and $ErrorRecord.ToString()) {
        $details += $ErrorRecord.ToString()
    }

    return $details
}

function Write-InstallerExceptionDetails {
    param([string]$Context, $ErrorRecord)

    foreach ($detail in (Get-InstallerExceptionDetails -ErrorRecord $ErrorRecord)) {
        if ($Context) {
            Write-Warn "$Context detail: $detail"
        } else {
            Write-Warn "Failure detail: $detail"
        }
    }
}

function Resolve-InstallerNodeCommand {
    param([string]$ProjectRoot)

    $bundledNode = Resolve-BundledNodeCommand -ProjectRoot $ProjectRoot
    if ($bundledNode) {
        return $bundledNode
    }

    return Resolve-ToolCommandWithRetry -Name "node" -Attempts 2
}

function Ensure-OfficeSkillNodeDependencies {
    param([string]$ProjectRoot)

    if (-not $ProjectRoot) {
        throw "ProjectRoot is required"
    }

    $skillsRoot = Join-Path $ProjectRoot "office-claw-skills"
    if (-not (Test-Path $skillsRoot)) {
        Write-Warn "office-claw-skills/ not found - skill dependency install skipped"
        return $false
    }

    $nodeCommand = Resolve-InstallerNodeCommand -ProjectRoot $ProjectRoot
    if (-not $nodeCommand) {
        throw "Node.js not found for skill dependency installation"
    }

    $helperScript = Join-Path $ProjectRoot "scripts\ensure-office-skill-node-deps.mjs"
    if (-not (Test-Path $helperScript)) {
        throw "Missing helper script: $helperScript"
    }

    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $skillsRoot ".playwright-browsers"
    & $nodeCommand $helperScript --skills-root $skillsRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Office skill dependency installation failed"
    }

    return $true
}

function Ensure-WindowsRedis {
    param([string]$ProjectRoot, [switch]$Memory)
    if ($Memory) {
        Write-Warn "Memory mode (-Memory) - skipping Redis detection"
        return $false
    }

    $portableRedis = Resolve-PortableRedisBinaries -ProjectRoot $ProjectRoot
    if ($portableRedis) {
        Write-Ok "Redis available ($($portableRedis.Source)): $($portableRedis.BinDir)"
        return $true
    }

    $globalRedis = Resolve-GlobalRedisBinaries
    if ($globalRedis) {
        Write-Ok "Redis available ($($globalRedis.Source)): $($globalRedis.BinDir)"
        return $true
    }

    Write-Warn "Redis not found - attempting portable install into .office-claw/redis/windows"
    try {
        $layout = Resolve-PortableRedisLayout -ProjectRoot $ProjectRoot
        $installerUserAgent = if ($env:OFFICE_CLAW_INSTALLER_USER_AGENT) {
            $env:OFFICE_CLAW_INSTALLER_USER_AGENT.Trim()
        } else {
            "OfficeClaw-Installer"
        }
        $headers = @{ "User-Agent" = $installerUserAgent }
        $redisReleaseApi = if ($env:OFFICE_CLAW_WINDOWS_REDIS_RELEASE_API) {
            $env:OFFICE_CLAW_WINDOWS_REDIS_RELEASE_API.Trim()
        } else {
            "https://api.github.com/repos/redis-windows/redis-windows/releases/latest"
        }
        $redisDownloadUrl = if ($env:OFFICE_CLAW_WINDOWS_REDIS_DOWNLOAD_URL) {
            $env:OFFICE_CLAW_WINDOWS_REDIS_DOWNLOAD_URL.Trim()
        } else {
            $null
        }

        New-Item -Path $layout.ArchiveDir -ItemType Directory -Force | Out-Null
        New-Item -Path $layout.Root -ItemType Directory -Force | Out-Null
        if (Test-Path $layout.Current) {
            Remove-Item -Path $layout.Current -Recurse -Force
        }

        if ($redisDownloadUrl) {
            $archiveName = [System.IO.Path]::GetFileName(([System.Uri]$redisDownloadUrl).AbsolutePath)
            if (-not $archiveName) {
                $archiveName = "redis-windows.zip"
            }
            $archivePath = Join-Path $layout.ArchiveDir $archiveName
            $releaseTag = "manual-override"
            Write-Host "  Redis archive source: explicit OFFICE_CLAW_WINDOWS_REDIS_DOWNLOAD_URL"
            Write-Host "  Downloading $archiveName..."
            Invoke-WebRequest -Uri $redisDownloadUrl -OutFile $archivePath -Headers $headers -UseBasicParsing
        } else {
            Write-Host "  Redis release metadata source: $redisReleaseApi"
            $release = Invoke-RestMethod -Uri $redisReleaseApi -Headers $headers
            $asset = $release.assets | Where-Object { $_.name -match "^Redis-.*-Windows-x64-msys2\.zip$" } | Select-Object -First 1
            if (-not $asset) {
                $asset = $release.assets | Where-Object { $_.name -match "^Redis-.*-Windows-x64-cygwin\.zip$" } | Select-Object -First 1
            }
            if (-not $asset) {
                $asset = $release.assets | Where-Object { $_.name -match "^Redis-.*-Windows-x64-msys2-with-Service\.zip$" } | Select-Object -First 1
            }
            if (-not $asset) {
                $asset = $release.assets | Where-Object { $_.name -match "^Redis-.*-Windows-x64-cygwin-with-Service\.zip$" } | Select-Object -First 1
            }
            if (-not $asset) {
                throw "No Windows Redis zip asset found in release metadata"
            }

            $archivePath = Join-Path $layout.ArchiveDir $asset.name
            $releaseTag = $release.tag_name
            Write-Host "  Downloading $($asset.name)..."
            Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $archivePath -Headers $headers -UseBasicParsing
        }

        Expand-Archive -Path $archivePath -DestinationPath $layout.Current -Force

        $portableRedis = Resolve-PortableRedisBinaries -ProjectRoot $ProjectRoot
        if (-not $portableRedis) {
            throw "Redis executables were not found after extraction"
        }

        Set-Content -Path $layout.VersionFile -Value $releaseTag -Encoding ascii
        Write-Ok "Redis installed: $($portableRedis.BinDir)"
        Write-Warn "Portable Redis will be reused from .office-claw/redis/windows on later starts."
        return $true
    } catch {
        Write-Warn "Redis auto-install failed - install Redis manually or rerun with an external Redis URL"
        Write-InstallerExceptionDetails -Context "Redis auto-install" -ErrorRecord $_
        $manualRedisUrl = if ($env:OFFICE_CLAW_WINDOWS_REDIS_RELEASES_URL) {
            $env:OFFICE_CLAW_WINDOWS_REDIS_RELEASES_URL.Trim()
        } else {
            "https://github.com/redis-windows/redis-windows/releases"
        }
        Write-Warn "Manual Redis install: $manualRedisUrl"
        return $false
    }
}

function Ensure-WindowsJiuwenClawRuntime {
    param([string]$ProjectRoot)

    if (-not $ProjectRoot) {
        return $false
    }

    $appDir = Join-Path $ProjectRoot "vendor\jiuwenclaw"
    $appEntryPy = Join-Path $appDir "jiuwenclaw\app.py"
    $appEntryPyc = Join-Path $appDir "jiuwenclaw\app.pyc"
    if (-not (Test-Path $appEntryPy) -and -not (Test-Path $appEntryPyc)) {
        return $false
    }

    function Test-PythonModuleAvailable {
        param([string]$PythonCommand, [string]$ModuleName)

        if (-not $PythonCommand -or -not (Test-Path $PythonCommand)) {
            return $false
        }

        try {
            & $PythonCommand -c "import importlib.util; raise SystemExit(0 if importlib.util.find_spec('$ModuleName') else 1)" 1>$null 2>$null
            return $LASTEXITCODE -eq 0
        } catch {
            return $false
        }
    }

    function Test-JiuwenClawPythonVersion {
        param([string]$PythonCommand, [string[]]$PythonArgs = @())

        if (-not $PythonCommand -or -not (Test-Path $PythonCommand)) {
            return $false
        }

        try {
            & $PythonCommand @PythonArgs -c "import sys; raise SystemExit(0 if (sys.version_info.major == 3 and (3, 11) <= sys.version_info[:2] < (3, 14)) else 1)" 1>$null 2>$null
            return $LASTEXITCODE -eq 0
        } catch {
            return $false
        }
    }

    function Test-JiuwenClawRuntimePython {
        param([string]$PythonCommand)

        return (Test-JiuwenClawPythonVersion -PythonCommand $PythonCommand) -and
            (Test-PythonModuleAvailable -PythonCommand $PythonCommand -ModuleName "jiuwenclaw") -and
            (Test-PythonModuleAvailable -PythonCommand $PythonCommand -ModuleName "dotenv")
    }

    function Resolve-JiuwenClawBootstrapPython {
        $pythonCommand = Resolve-ToolCommandWithRetry -Name "python" -Attempts 2
        if ($pythonCommand -and (Test-JiuwenClawPythonVersion -PythonCommand $pythonCommand)) {
            return [pscustomobject]@{ Command = $pythonCommand; Args = @(); Label = $pythonCommand }
        }

        $python3Command = Resolve-ToolCommandWithRetry -Name "python3" -Attempts 2
        if ($python3Command -and (Test-JiuwenClawPythonVersion -PythonCommand $python3Command)) {
            return [pscustomobject]@{ Command = $python3Command; Args = @(); Label = $python3Command }
        }

        $pyCommand = Resolve-ToolCommandWithRetry -Name "py" -Attempts 2
        if ($pyCommand) {
            foreach ($version in @("-3.13", "-3.12", "-3.11", "-3")) {
                $candidateArgs = @($version)
                if (Test-JiuwenClawPythonVersion -PythonCommand $pyCommand -PythonArgs $candidateArgs) {
                    return [pscustomobject]@{ Command = $pyCommand; Args = $candidateArgs; Label = "$pyCommand $version" }
                }
            }
        }

        return $null
    }

    # Runtime startup: no pip install allowed. Dependencies must be installed at build/install time.
    $venvPython = Join-Path $appDir ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        if (Test-JiuwenClawRuntimePython -PythonCommand $venvPython) {
            return $true
        }
        Write-Warn "jiuwen runtime .venv exists but dependency check failed - skipping (install deps at build time)"
        return $false
    }
    Write-Warn "jiuwen runtime .venv not found - run build to set up dependencies"
    return $false
}

function Ensure-WindowsDareRuntime {
    param([string]$ProjectRoot)

    if (-not $ProjectRoot) {
        return $false
    }

    $appDir = Join-Path $ProjectRoot "vendor\dare-cli"
    $appEntryPy = Join-Path $appDir "client\__main__.py"
    $appEntryPyc = Join-Path $appDir "client\__main__.pyc"
    if (-not (Test-Path $appEntryPy) -and -not (Test-Path $appEntryPyc)) {
        return $false
    }

    # Shared Python from bundled embeddable runtime (tools\python layout)
    $sharedPython = Join-Path $ProjectRoot "tools\python\python.exe"
    if (Test-Path $sharedPython) {
        Write-Ok "DARE runtime: using shared Python ($sharedPython)"
        return $true
    }

    $venvPython = Join-Path $appDir ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        return $true
    }

    $pythonCommand = Resolve-ToolCommandWithRetry -Name "python" -Attempts 2
    $pythonArgs = @()
    if (-not $pythonCommand) {
        $pythonCommand = Resolve-ToolCommandWithRetry -Name "py" -Attempts 2
        if ($pythonCommand) {
            $pythonArgs = @("-3")
        }
    }
    if (-not $pythonCommand) {
        Write-Warn "DARE runtime unavailable - Python 3.11+ not found"
        return $false
    }

    Write-Host "  Preparing DARE runtime..."
    try {
        Push-Location $appDir
        & $pythonCommand @pythonArgs -m venv ".venv"
        if ($LASTEXITCODE -ne 0) {
            throw "python -m venv failed"
        }
        & $venvPython -m pip install --upgrade pip setuptools wheel
        if ($LASTEXITCODE -ne 0) {
            throw "pip bootstrap failed"
        }
        & $venvPython -m pip install -r requirements.txt "httpx[socks]"
        if ($LASTEXITCODE -ne 0) {
            throw "DARE dependency install failed"
        }
        Write-Ok "DARE runtime prepared"
        return $true
    } catch {
        Write-Warn "DARE runtime setup failed - client will stay unavailable"
        Write-InstallerExceptionDetails -Context "DARE runtime" -ErrorRecord $_
        return $false
    } finally {
        Pop-Location
    }
}

function New-InstallerAuthState {
    param([string]$ProjectRoot)
    [pscustomobject]@{
        ProjectRoot = $ProjectRoot
        HelperPath = Join-Path $ProjectRoot "scripts\install-auth-config.mjs"
        EnvSetMap = [ordered]@{}
        EnvDeleteMap = @{}
    }
}

function Set-InstallerEnvValue {
    param($State, [string]$Key, [string]$Value)
    $State.EnvSetMap[$Key] = $Value
    if ($State.EnvDeleteMap.ContainsKey($Key)) {
        $State.EnvDeleteMap.Remove($Key) | Out-Null
    }
}

function Add-InstallerEnvDelete {
    param($State, [string]$Key)
    if ($State.EnvSetMap.Contains($Key)) {
        $State.EnvSetMap.Remove($Key)
    }
    $State.EnvDeleteMap[$Key] = $true
}

function Invoke-InstallerAuthHelper {
    param($State, [string[]]$CommandArgs)
    if (-not (Test-Path $State.HelperPath)) {
        throw "Missing install auth helper: $($State.HelperPath)"
    }
    & node $State.HelperPath @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        # throw "install auth helper failed"
    }
}

function Set-CodexOAuthMode {
    param($State)
    Set-InstallerEnvValue $State "CODEX_AUTH_MODE" "oauth"
    Add-InstallerEnvDelete $State "OPENAI_API_KEY"
    Add-InstallerEnvDelete $State "OPENAI_BASE_URL"
    Add-InstallerEnvDelete $State "CAT_CODEX_MODEL"
}

function Set-CodexApiKeyMode {
    param($State, [string]$ApiKey, [string]$BaseUrl, [string]$Model)

    Set-InstallerEnvValue $State "CODEX_AUTH_MODE" "api_key"
    Set-InstallerEnvValue $State "OPENAI_API_KEY" $ApiKey
    if ($BaseUrl) { Set-InstallerEnvValue $State "OPENAI_BASE_URL" $BaseUrl } else { Add-InstallerEnvDelete $State "OPENAI_BASE_URL" }
    if ($Model) { Set-InstallerEnvValue $State "CAT_CODEX_MODEL" $Model } else { Add-InstallerEnvDelete $State "CAT_CODEX_MODEL" }
}

function Set-GeminiOAuthMode {
    param($State)
    Add-InstallerEnvDelete $State "GEMINI_API_KEY"
    Add-InstallerEnvDelete $State "CAT_GEMINI_MODEL"
}

function Set-GeminiApiKeyMode {
    param($State, [string]$ApiKey, [string]$Model)

    Set-InstallerEnvValue $State "GEMINI_API_KEY" $ApiKey
    if ($Model) { Set-InstallerEnvValue $State "CAT_GEMINI_MODEL" $Model } else { Add-InstallerEnvDelete $State "CAT_GEMINI_MODEL" }
}

function Set-ModelArtsCustomEnv {
    param($State)

    # OFFICE_CLAW_CLIENT_LABELS is the single source of truth:
    # keys = enabled clients, values = console display names.
    # Format: "clientId:DisplayName,clientId:DisplayName"
    # Available client IDs: anthropic | openai | google | dare | opencode | antigravity | relayclaw
    # Example: "dare:jiuwen,anthropic:Claude,opencode:OpenCode"
    Set-InstallerEnvValue $State "OFFICE_CLAW_BUILTIN_CLIENTS_ENABLED" "false"
    Set-InstallerEnvValue $State "OFFICE_CLAW_CLIENT_LABELS" "dare:dare,relayclaw:jiuwen"
    Add-InstallerEnvDelete $State "CODEX_AUTH_MODE"
    Add-InstallerEnvDelete $State "OPENAI_API_KEY"
    Add-InstallerEnvDelete $State "OPENAI_BASE_URL"
    Add-InstallerEnvDelete $State "OPENAI_API_BASE"
    Add-InstallerEnvDelete $State "CAT_CODEX_MODEL"
    Add-InstallerEnvDelete $State "GEMINI_API_KEY"
    Add-InstallerEnvDelete $State "GEMINI_BASE_URL"
    Add-InstallerEnvDelete $State "CAT_GEMINI_MODEL"
}

function Set-ClaudeInstallerProfile {
    param($State, [string]$ApiKey, [string]$BaseUrl, [string]$Model)

    $profileArgs = @("claude-profile", "set", "--project-dir", $State.ProjectRoot)
    if ($BaseUrl) { $profileArgs += @("--base-url", $BaseUrl) }
    if ($Model) { $profileArgs += @("--model", $Model) }
    # Pass API key via environment variable to avoid exposure in process listing
    $env:_INSTALLER_API_KEY = $ApiKey
    try {
        Invoke-InstallerAuthHelper $State $profileArgs
    } finally {
        Remove-Item Env:\_INSTALLER_API_KEY -ErrorAction SilentlyContinue
    }
}

function Remove-ClaudeInstallerProfile {
    param($State)
    Invoke-InstallerAuthHelper $State @("claude-profile", "remove", "--project-dir", $State.ProjectRoot)
}

function Read-InstallerSecret {
    param([string]$Prompt)

    $secureValue = Read-Host $Prompt -AsSecureString
    if ($null -eq $secureValue) {
        return ""
    }

    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        if ($bstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

function Configure-InstallerAuth {
    param([string]$ProjectRoot, $State)

    Invoke-InstallerAuthHelper $State @("modelarts-preset", "apply", "--project-dir", $ProjectRoot)
    Set-ModelArtsCustomEnv $State
    Write-Ok "ModelArts preset written: built-in clients / shared glm-5 profile / dare+jiuwen only"
}

function Apply-InstallerAuthEnv {
    param($State, [string]$EnvFile)
    if ($State.EnvSetMap.Count -eq 0 -and $State.EnvDeleteMap.Count -eq 0) { return }
    $helperArgs = @("env-apply", "--env-file", $EnvFile)
    foreach ($key in $State.EnvSetMap.Keys) {
        $helperArgs += @("--set", "$key=$($State.EnvSetMap[$key])")
    }
    foreach ($key in $State.EnvDeleteMap.Keys) {
        $helperArgs += @("--delete", $key)
    }
    Invoke-InstallerAuthHelper $State $helperArgs
    Write-Ok "Auth config written to .env"
}
