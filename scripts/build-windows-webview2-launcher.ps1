param(
    [Parameter(Mandatory = $true)][string]$SourceFile,
    [Parameter(Mandatory = $true)][string]$OutputDir,
    [Parameter(Mandatory = $true)][string]$CacheDir,
    [string]$WebView2Version = $(if ($env:OFFICE_CLAW_WEBVIEW2_VERSION) { $env:OFFICE_CLAW_WEBVIEW2_VERSION } else { "1.0.3856.49" }),
    [string]$IconFile = ""
)

$ErrorActionPreference = "Stop"

function Resolve-CscPath {
    $candidates = @(
        "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
        "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    throw "csc.exe not found"
}

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Ensure-WebView2Package {
    param([string]$DestinationPath, [string]$Version)
    if (Test-Path $DestinationPath) {
        return
    }
    $feedRoot = if ($env:OFFICE_CLAW_NUGET_FLAT_CONTAINER_URL) {
        $env:OFFICE_CLAW_NUGET_FLAT_CONTAINER_URL.TrimEnd("/")
    } else {
        "https://api.nuget.org/v3-flatcontainer"
    }
    $url = "$feedRoot/microsoft.web.webview2/$Version/microsoft.web.webview2.$Version.nupkg"
    Invoke-WebRequest -Uri $url -OutFile $DestinationPath
}

function Resolve-FrameworkReference {
    param(
        [string]$FrameworkDir,
        [string]$AssemblyName
    )

    $assemblyFile = if ($AssemblyName.EndsWith(".dll")) { $AssemblyName } else { "$AssemblyName.dll" }
    $assemblyId = [IO.Path]::GetFileNameWithoutExtension($assemblyFile)
    $windowsDir = $env:WINDIR
    if (-not $windowsDir) {
        $windowsDir = "C:\Windows"
    }

    $candidates = @(
        (Join-Path $FrameworkDir $assemblyFile),
        (Join-Path $FrameworkDir "WPF\$assemblyFile"),
        (Join-Path $windowsDir "Microsoft.NET\assembly\GAC_MSIL\$assemblyId\v4.0_4.0.0.0__31bf3856ad364e35\$assemblyFile")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $gacRoot = Join-Path $windowsDir "Microsoft.NET\assembly\GAC_MSIL\$assemblyId"
    if (Test-Path $gacRoot) {
        $gacReference = Get-ChildItem -Path $gacRoot -Recurse -Filter $assemblyFile -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($gacReference) {
            return $gacReference.FullName
        }
    }

    throw "Missing reference: $assemblyFile (checked $($candidates -join ', '))"
}

Ensure-Directory -Path $OutputDir
Ensure-Directory -Path $CacheDir

$cscPath = Resolve-CscPath
$packagePath = Join-Path $CacheDir "microsoft.web.webview2.$WebView2Version.nupkg"
$extractDir = Join-Path $CacheDir "webview2-$WebView2Version"
$buildDir = Join-Path ([IO.Path]::GetTempPath()) ("office-claw-webview2-launcher-" + [Guid]::NewGuid().ToString("N"))
$outputExe = Join-Path $buildDir "OfficeClaw.exe"
$localSourceFile = Join-Path $buildDir ([IO.Path]::GetFileName($SourceFile))
$manifestFile = [IO.Path]::ChangeExtension($SourceFile, ".manifest")
$coreDllPath = Join-Path $extractDir "lib\net462\Microsoft.Web.WebView2.Core.dll"

Ensure-WebView2Package -DestinationPath $packagePath -Version $WebView2Version

if ((Test-Path $extractDir) -and -not (Test-Path $coreDllPath)) {
    Remove-Item -Path $extractDir -Recurse -Force
}

if (-not (Test-Path $extractDir)) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($packagePath, $extractDir)
}

if (Test-Path $buildDir) {
    Remove-Item -Path $buildDir -Recurse -Force
}
Ensure-Directory -Path $buildDir
Copy-Item -Path $SourceFile -Destination $localSourceFile -Force

# Copy additional source files from the same directory
$sourceDir = Split-Path -Parent $SourceFile
$additionalSources = Get-ChildItem -Path $sourceDir -Filter "*.cs" | Where-Object { $_.FullName -ne $SourceFile }
$localAdditionalSources = @()
foreach ($additionalSource in $additionalSources) {
    $localPath = Join-Path $buildDir $additionalSource.Name
    Copy-Item -Path $additionalSource.FullName -Destination $localPath -Force
    $localAdditionalSources += $localPath
}

$frameworkDir = Split-Path -Parent $cscPath
$frameworkReferences = @(
    (Resolve-FrameworkReference -FrameworkDir $frameworkDir -AssemblyName "System.dll"),
    (Resolve-FrameworkReference -FrameworkDir $frameworkDir -AssemblyName "System.Core.dll"),
    (Resolve-FrameworkReference -FrameworkDir $frameworkDir -AssemblyName "System.Speech.dll"),
    (Resolve-FrameworkReference -FrameworkDir $frameworkDir -AssemblyName "System.Drawing.dll"),
    (Resolve-FrameworkReference -FrameworkDir $frameworkDir -AssemblyName "System.Windows.Forms.dll")
)
$sdkFiles = @(
    (Join-Path $extractDir "lib\net462\Microsoft.Web.WebView2.Core.dll"),
    (Join-Path $extractDir "lib\net462\Microsoft.Web.WebView2.WinForms.dll"),
    (Join-Path $extractDir "runtimes\win-x64\native\WebView2Loader.dll")
)

$localSdkFiles = @()
foreach ($sdkFile in $sdkFiles) {
    if (-not (Test-Path $sdkFile)) {
        throw "Missing SDK file: $sdkFile"
    }
    $localPath = Join-Path $buildDir ([IO.Path]::GetFileName($sdkFile))
    Copy-Item -Path $sdkFile -Destination $localPath -Force
    $localSdkFiles += $localPath
}

$compileArgs = @(
    "/nologo",
    "/target:winexe",
    "/platform:x64",
    "/out:$outputExe"
)

if ($IconFile -and (Test-Path $IconFile)) {
    $compileArgs += "/win32icon:$IconFile"
}

if (Test-Path $manifestFile) {
    $compileArgs += "/win32manifest:$manifestFile"
}

foreach ($reference in ($frameworkReferences + $localSdkFiles[0..1])) {
    if (-not (Test-Path $reference)) {
        throw "Missing reference: $reference"
    }
    $compileArgs += "/r:$reference"
}

$compileArgs += $localSourceFile
foreach ($additionalSource in $localAdditionalSources) {
    $compileArgs += $additionalSource
}

& $cscPath @compileArgs
if ($LASTEXITCODE -ne 0) {
    throw "Launcher compilation failed with exit code $LASTEXITCODE"
}

# Ensure current user can write to build dir (AV scanners may lock temp files after compile)
& icacls $buildDir /grant "${env:USERNAME}:(OI)(CI)F" /T /Q 2>$null | Out-Null

@"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <startup>
    <supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.6.2" />
  </startup>
</configuration>
"@ | Set-Content -Path "$outputExe.config" -Encoding ASCII

Copy-Item -Path $outputExe -Destination (Join-Path $OutputDir "OfficeClaw.exe") -Force
Copy-Item -Path "$outputExe.config" -Destination (Join-Path $OutputDir "OfficeClaw.exe.config") -Force
foreach ($runtimeFile in $localSdkFiles) {
    Copy-Item -Path $runtimeFile -Destination (Join-Path $OutputDir ([IO.Path]::GetFileName($runtimeFile))) -Force
}

Remove-Item -Path $buildDir -Recurse -Force
