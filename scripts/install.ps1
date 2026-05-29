<#
.SYNOPSIS
  OfficeClaw - Windows Repo-Local Install Helper

.DESCRIPTION
  Installs prerequisites and sets up the current checked-out office-claw repo.
  Clone or download the repo first, then run this helper from inside it.
  Steps: env detect -> Node/pnpm install -> Redis -> .env generate -> deps & build
         -> AI CLI tools -> auth config -> verify & optionally start

.EXAMPLE
  # From repo root:
  .\scripts\install.ps1
#>

param(
    [switch]$Start,
    [switch]$SkipBuild,
    [switch]$SkipCli,
    [switch]$Debug
)

$ErrorActionPreference = "Stop"

function Write-Step  { param([string]$msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$msg) Write-Host "  [ERR] $msg" -ForegroundColor Red }

function Refresh-Path {
    Sync-ToolPath
}

function Resolve-PnpmCommand { Resolve-ToolCommand -Name "pnpm" }
function Invoke-Pnpm { param([string[]]$CommandArgs) Invoke-ToolCommand -Name "pnpm" -CommandArgs $CommandArgs }
function Test-InstallerCancellation {
    param($ErrorRecord)
    if (-not $ErrorRecord -or -not $ErrorRecord.Exception) {
        return $false
    }
    $exception = $ErrorRecord.Exception
    while ($exception) {
        $exceptionType = $exception.GetType().FullName
        if ($exceptionType -eq 'System.Management.Automation.PipelineStoppedException' -or
            $exceptionType -eq 'System.Management.Automation.OperationStoppedException') {
            return $true
        }
        $exception = $exception.InnerException
    }
    return $false
}
function Exit-InstallerIfCancelled {
    param($ErrorRecord, [string]$Context)
    if (Test-InstallerCancellation -ErrorRecord $ErrorRecord) {
        Write-Err "$Context cancelled by user"
        exit 1
    }
}
function Get-PnpmStatus {
    param([int]$Attempts = 1, [int]$DelayMs = 500)
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        try {
            Refresh-Path
            $pnpmCommand = Resolve-PnpmCommand
            if ($pnpmCommand) {
                $pnpmRaw = & $pnpmCommand --version 2>$null
                if ($pnpmRaw -and $pnpmRaw -match '^(\d+)\.' -and [int]$Matches[1] -ge 8) {
                    return [pscustomobject]@{
                        Command = $pnpmCommand
                        Version = $pnpmRaw
                    }
                }
            }
        } catch {}
        if ($attempt -lt ($Attempts - 1)) {
            Start-Sleep -Milliseconds $DelayMs
        }
    }
    return $null
}

function Get-PackageManagerPnpmVersion {
    param([Parameter(Mandatory)][string]$ProjectRoot)

    $packageJsonPath = Join-Path $ProjectRoot "package.json"
    if (-not (Test-Path $packageJsonPath)) { return $null }
    try {
        $packageJson = Get-Content -Raw -Path $packageJsonPath | ConvertFrom-Json
        if ($packageJson.packageManager -and $packageJson.packageManager -match '^pnpm@(.+)$') {
            return $Matches[1]
        }
    } catch {}
    return $null
}

function Resolve-NodeMsiUrl {
    param([Parameter(Mandatory)][string]$Architecture)

    if ($env:OFFICE_CLAW_NODE_MSI_URL) {
        return $env:OFFICE_CLAW_NODE_MSI_URL.Trim().Replace("{arch}", $Architecture)
    }
    return "https://nodejs.org/dist/latest/node-latest-$Architecture.msi"
}

$ScriptPath = if ($PSCommandPath) { $PSCommandPath } elseif ($MyInvocation.MyCommand.Path) { $MyInvocation.MyCommand.Path } else { $null }
if (-not $ScriptPath) {
    Write-Err "Could not resolve install.ps1 path. Run with: powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1"
    exit 1
}
$ScriptDir = Split-Path -Parent $ScriptPath
. (Join-Path $ScriptDir "install-windows-helpers.ps1")

function Resolve-ProjectRoot {
    $projectRoot = Split-Path -Parent $ScriptDir
    if (-not (Test-Path (Join-Path $projectRoot "package.json")) -or
        -not (Test-Path (Join-Path $projectRoot "packages/api"))) {
        Write-Err "Run this helper from a checked-out office-claw repo: .\scripts\install.ps1"
        exit 1
    }
    $gitRepoUnavailable = $false
    try {
        & git -C $projectRoot rev-parse --is-inside-work-tree 1>$null 2>$null
        $gitRepoUnavailable = $LASTEXITCODE -ne 0
    } catch {}
    if ($gitRepoUnavailable) {
        Write-Warn "No .git directory detected - git-dependent features will be unavailable"
    }
    return $projectRoot
}

# -- Step 1: Environment detection ---------------------------
Write-Step "Step 1/8 - Detect environment"

if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Err "PowerShell 5.0+ required (current: $($PSVersionTable.PSVersion))"
    exit 1
}
Write-Ok "PowerShell $($PSVersionTable.PSVersion)"

$hasWinget = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
if ($hasWinget) { Write-Ok "winget available" } else { Write-Warn "winget not found - manual install may be needed" }

$gitCommand = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCommand) {
    Write-Warn "Git not found - git-dependent features will be unavailable"
} else {
    Write-Ok "Git: $(& $gitCommand.Source --version)"
}

$ProjectRoot = Resolve-ProjectRoot
$authState = New-InstallerAuthState -ProjectRoot $ProjectRoot
$defaultFrontendPort = if ($env:OFFICE_CLAW_FRONTEND_PORT) { $env:OFFICE_CLAW_FRONTEND_PORT.Trim() } else { "3003" }
$defaultApiPort = if ($env:OFFICE_CLAW_API_SERVER_PORT) { $env:OFFICE_CLAW_API_SERVER_PORT.Trim() } else { "3004" }
$defaultRedisPort = if ($env:OFFICE_CLAW_REDIS_PORT) { $env:OFFICE_CLAW_REDIS_PORT.Trim() } else { "6399" }
$pnpmVersion = if ($env:OFFICE_CLAW_PNPM_VERSION) { $env:OFFICE_CLAW_PNPM_VERSION.Trim() } else { Get-PackageManagerPnpmVersion -ProjectRoot $ProjectRoot }
$pnpmSpec = if ($pnpmVersion) { "pnpm@$pnpmVersion" } else { "pnpm" }

if ($env:OFFICE_CLAW_NPM_REGISTRY) {
    $env:NPM_CONFIG_REGISTRY = $env:OFFICE_CLAW_NPM_REGISTRY.Trim()
    Write-Ok "npm registry override: $($env:NPM_CONFIG_REGISTRY)"
}

Write-Step "Step 2/8 - Node.js and pnpm"

$nodeOk = $false
try {
    $nodeRaw = & node --version 2>$null
    if ($nodeRaw -match 'v(\d+)\.(\d+)') {
        $nodeMajor = [int]$Matches[1]
        if ($nodeMajor -ge 20) {
            Write-Ok "Node.js $nodeRaw"
            $nodeOk = $true
        } else {
            Write-Warn "Node.js $nodeRaw too old (need >= 20), upgrading..."
        }
    }
} catch {}

if (-not $nodeOk) {
    if ($hasWinget) {
        try {
            Write-Host "  Installing Node.js LTS via winget..."
            winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent 2>$null
            Refresh-Path
            $nodeRaw = & node --version 2>$null
            if ($nodeRaw -match 'v(\d+)\.(\d+)') {
                $nodeMajor = [int]$Matches[1]
                if ($nodeMajor -ge 20) {
                    Write-Ok "Node.js $nodeRaw installed"
                    $nodeOk = $true
                } else {
                    Write-Warn "Node.js $nodeRaw still too old after winget install"
                }
            } else {
                Write-Warn "Could not verify Node.js version after winget install"
            }
        } catch {
            Exit-InstallerIfCancelled -ErrorRecord $_ -Context "Node.js installation"
        }
        if (-not $nodeOk) {
            Write-Warn "winget Node.js install failed - falling back to manual prerequisite check"
        }
    }
    # Fallback: download Node.js MSI directly from nodejs.org
    if (-not $nodeOk) {
        try {
            $arch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64') { 'arm64' } else { 'x64' }
            $nodeUrl = Resolve-NodeMsiUrl -Architecture $arch
            $msiPath = Join-Path $env:TEMP "node-latest-$arch.msi"
            Write-Host "  Downloading Node.js LTS ($arch)..."
            Invoke-WebRequest -Uri $nodeUrl -OutFile $msiPath -UseBasicParsing
            Write-Host "  Installing Node.js (silent MSI)..."
            Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn /norestart" -Wait -NoNewWindow
            Remove-Item $msiPath -ErrorAction SilentlyContinue
            Refresh-Path
            $nodeRaw = & node --version 2>$null
            if ($nodeRaw -match 'v(\d+)\.(\d+)') {
                $nodeMajor = [int]$Matches[1]
                if ($nodeMajor -ge 20) {
                    Write-Ok "Node.js $nodeRaw installed (direct download)"
                    $nodeOk = $true
                }
            }
        } catch {
            Write-Warn "Direct Node.js download failed: $_"
        }
    }
    if (-not $nodeOk) {
        Write-Err "Node.js >= 20 required. Install from https://nodejs.org/"
        exit 1
    }
}

$pnpmOk = $false
try {
    $pnpmStatus = Get-PnpmStatus
    if ($pnpmStatus) {
        Write-Ok "pnpm $($pnpmStatus.Version)"
        $pnpmOk = $true
    }
} catch {}

if (-not $pnpmOk) {
    Write-Host "  Installing pnpm..."
    $npmCommand = Resolve-ToolCommand -Name "npm"
    if ($npmCommand) {
        try {
            & $npmCommand install -g $pnpmSpec 2>$null
            $pnpmStatus = Get-PnpmStatus -Attempts 6
            if ($pnpmStatus) {
                Write-Ok "pnpm $($pnpmStatus.Version) (via npm)"
                $pnpmOk = $true
            } else {
                throw "pnpm shim missing after npm install"
            }
        } catch {
            Exit-InstallerIfCancelled -ErrorRecord $_ -Context "pnpm installation"
        }
    }
    if (-not $pnpmOk) {
        $corepackCommand = Resolve-ToolCommand -Name "corepack"
        if ($corepackCommand) {
            try {
                & $corepackCommand enable 2>$null
                & $corepackCommand install -g $pnpmSpec 2>$null
                $pnpmStatus = Get-PnpmStatus -Attempts 6
                if ($pnpmStatus) {
                    Write-Ok "pnpm $($pnpmStatus.Version) (via corepack)"
                    $pnpmOk = $true
                } else {
                    throw "pnpm shim missing after corepack install"
                }
            } catch {
                Exit-InstallerIfCancelled -ErrorRecord $_ -Context "pnpm installation"
            }
        }
    }
    if (-not $pnpmOk) {
        Write-ToolResolutionDiagnostics -Name "pnpm"
        Write-Err "Could not install pnpm. Run: npm install -g $pnpmSpec"
        exit 1
    }
}

Write-Step "Step 3/8 - Redis"

$redisPlan = Resolve-InstallerRedisPlan -ProjectRoot $ProjectRoot
$hasRedis = Apply-InstallerRedisPlan -State $authState -ProjectRoot $ProjectRoot -Plan $redisPlan
if (-not $hasRedis) {
    Write-Err "Redis setup failed. Install Redis locally or rerun and choose an external Redis URL."
    exit 1
}

Write-Step "Step 4/8 - Generate .env"

Set-Location $ProjectRoot
Write-Ok "Using project root: $ProjectRoot"

$envFile = Join-Path $ProjectRoot ".env"
$envExample = Join-Path $ProjectRoot ".env.example"

if (Test-Path $envFile) {
    Write-Ok ".env already exists - skipping"
} elseif (Test-Path $envExample) {
    Copy-Item $envExample $envFile
    Write-Ok ".env created from .env.example"
    Write-Warn "Edit .env to add your API keys and customize ports"
} else {
    Write-Warn ".env.example not found - creating minimal .env"
    @"
FRONTEND_PORT=$defaultFrontendPort
API_SERVER_PORT=$defaultApiPort
NEXT_PUBLIC_API_URL=http://localhost:$defaultApiPort
REDIS_PORT=$defaultRedisPort
"@ | Out-File -FilePath $envFile -Encoding utf8
    Write-Ok "Minimal .env created"
}

# Load .env into current session so NEXT_PUBLIC_* vars are available at build time
if (Test-Path $envFile) {
    foreach ($line in (Get-Content $envFile)) {
        $trimmed = $line.Trim()
        if ($trimmed -and -not $trimmed.StartsWith("#") -and $trimmed -match '^([^=]+)=(.*)$') {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim().Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
        }
    }
    Write-Ok ".env loaded into session"
}

Write-Step "Step 5/8 - Install dependencies and build"

Write-Host "  Running pnpm install..."
$frozenInstallOk = $false
$frozenInstallError = $null
try {
    Invoke-Pnpm -CommandArgs @("install", "--frozen-lockfile") 2>$null
    $frozenInstallOk = $LASTEXITCODE -eq 0
} catch {
    $frozenInstallError = $_
}
if (-not $frozenInstallOk) {
    Exit-InstallerIfCancelled -ErrorRecord $frozenInstallError -Context "pnpm install"
    Write-Warn "Frozen lockfile failed, retrying..."
    Invoke-Pnpm -CommandArgs @("install")
    if ($LASTEXITCODE -ne 0) { Write-Err "pnpm install failed"; exit 1 }
}
Write-Ok "Dependencies installed"

Write-Host "  Installing office skill runtime dependencies..."
try {
    Ensure-OfficeSkillNodeDependencies -ProjectRoot $ProjectRoot | Out-Null
    Write-Ok "Office skill runtime dependencies"
} catch {
    Exit-InstallerIfCancelled -ErrorRecord $_ -Context "office skill dependency installation"
    Write-Err "Office skill dependency installation failed"
    Write-InstallerExceptionDetails -Context "Office skill dependency installation" -ErrorRecord $_
    exit 1
}

if (-not $SkipBuild) {
    $buildSteps = @(
        @{ Name = "shared"; Path = "packages/shared" },
        @{ Name = "mcp-server"; Path = "packages/mcp-server" },
        @{ Name = "api"; Path = "packages/api" },
        @{ Name = "web"; Path = "packages/web" }
    )
    foreach ($step in $buildSteps) {
        Write-Host "  Building $($step.Name)..."
        Push-Location (Join-Path $ProjectRoot $step.Path)
        Invoke-Pnpm -CommandArgs @("run", "build")
        if ($LASTEXITCODE -ne 0) { Write-Err "Build failed: $($step.Name)"; Pop-Location; exit 1 }
        Pop-Location
        Write-Ok "$($step.Name)"
    }
} else {
    Write-Warn "Build skipped (-SkipBuild)"
}

Write-Step "Step 6/8 - AI CLI tools"
Write-Host "  Custom install - no external CLI tools required"
Write-Ok "Skipped (dare/jiuwen use vendored runtimes)"

$dareRuntimeReady = Ensure-WindowsDareRuntime -ProjectRoot $ProjectRoot
$jiuwenClawRuntimeReady = Ensure-WindowsJiuwenClawRuntime -ProjectRoot $ProjectRoot

Write-Step "Step 7/8 - Auth config"
Configure-InstallerAuth -ProjectRoot $ProjectRoot -State $authState

Apply-InstallerAuthEnv -State $authState -EnvFile $envFile

Write-Step "Step 8/8 - Verify and launch"

$artifacts = @("packages/shared/dist", "packages/mcp-server/dist/index.js", "packages/api/dist/cli.js", "packages/web/dist/index.html")
$allGood = $true
foreach ($artifact in $artifacts) {
    $fullPath = Join-Path $ProjectRoot $artifact
    if (Test-Path $fullPath) { Write-Ok $artifact } else { Write-Err "$artifact - missing!"; $allGood = $false }
}

if (-not $allGood -and -not $SkipBuild) {
    Write-Err "Build artifacts missing. Check build output above."
    exit 1
}

Write-Host ""
Write-Host "  ========================================" -ForegroundColor Green
Write-Host "  OfficeClaw installed!" -ForegroundColor Green
Write-Host "  ========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Project: $ProjectRoot"
Write-Host "  Node:    $(node --version)"
Write-Host "  Redis:   $(if ($hasRedis) { 'available' } else { 'not configured' })"
Write-Host "  Dare:     $(if ($dareRuntimeReady) { 'ready' } else { 'not installed' })"
Write-Host "  jiuwen:   $(if ($jiuwenClawRuntimeReady) { 'ready' } else { 'not installed' })"
Write-Host ""
Write-Host "  Start the app:" -ForegroundColor Cyan
$startCmd = ".\scripts\start-windows.ps1"
Write-Host "    $startCmd" -ForegroundColor White
Write-Host ""
$frontendPort = Get-InstallerEnvValueFromFile -EnvFile $envFile -Key "FRONTEND_PORT"
if (-not $frontendPort) { $frontendPort = "3003" }
Write-Host "  Then open http://localhost:$frontendPort" -ForegroundColor Cyan
Write-Host ""

if ($Start) {
    Write-Host "  Auto-starting..." -ForegroundColor Cyan
    $startArgs = @("-Quick")
    if ($Debug) { $startArgs += "-Debug" }
    & (Join-Path $ProjectRoot "scripts\start-windows.ps1") @startArgs
}
