param(
  [ValidateSet('Release', 'Debug')][string]$Configuration = 'Release',
  [ValidateSet('win-x64')][string]$Runtime = 'win-x64',
  [ValidatePattern('^\d+\.\d+(\.\d+)?$')][string]$Version = '1.0',
  [string]$OutputRoot,
  [switch]$SkipInstaller
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (!$OutputRoot) { $OutputRoot = Join-Path $repoRoot 'output' }
$releaseVersion = if ($Version.Split('.').Count -eq 2) { "$Version.0" } else { $Version }
$parsedVersion = [version]$releaseVersion
if ($parsedVersion.Major -gt 255 -or $parsedVersion.Minor -gt 255 -or $parsedVersion.Build -gt 65535) {
  throw 'Version exceeds Windows MSI version limits.'
}
$publishDir = [IO.Path]::GetFullPath((Join-Path $OutputRoot "v$Version"))
$webProject = Join-Path $repoRoot 'src\NetworkPortAnalyzer.Web\NetworkPortAnalyzer.Web.csproj'
$nugetConfig = Join-Path $repoRoot 'NuGet.Config'

function Invoke-DotNet {
  param([string[]]$Arguments)
  & dotnet @Arguments
  if ($LASTEXITCODE -ne 0) { throw "dotnet failed with exit code $LASTEXITCODE. Release aborted." }
}

# Build and tests must pass before updating release artifacts.
Invoke-DotNet -Arguments @('build', (Join-Path $repoRoot 'NetworkPortAnalyzer.sln'), '-c', $Configuration, '--configfile', $nugetConfig)
Invoke-DotNet -Arguments @('run', '--project', (Join-Path $repoRoot 'tests\NetworkPortAnalyzer.Tests'), '-c', $Configuration, '--no-build')
New-Item -ItemType Directory -Force -Path $publishDir | Out-Null
Invoke-DotNet -Arguments @('publish', $webProject, '-c', $Configuration, '-r', $Runtime, '--self-contained', 'true',
  '-p:PublishSingleFile=true', '-p:DebugType=None', '-p:DebugSymbols=false', '-p:PublishIISAssets=false',
  "-p:Version=$releaseVersion", "-p:AssemblyVersion=$releaseVersion.0", "-p:FileVersion=$releaseVersion.0",
  "-p:InformationalVersion=$releaseVersion", '-o', $publishDir, '--configfile', $nugetConfig)
$exe = Join-Path $publishDir 'NetworkPortAnalyzer.exe'
if (!(Test-Path -LiteralPath $exe)) { throw 'Publish completed without the expected executable.' }
$artifacts = @($exe)

if (!$SkipInstaller) {
  $installerOutput = Join-Path $publishDir 'installer'
  Invoke-DotNet -Arguments @('build', (Join-Path $repoRoot 'installer\JackPeek.Installer.wixproj'), '-c', $Configuration,
    '-p:Platform=x64', "-p:PublishDir=$publishDir\", "-p:ProductVersion=$releaseVersion", "-p:OutputPath=$installerOutput\", '--configfile', $nugetConfig)
  $msi = Join-Path $installerOutput 'JackPeek.msi'
  if (!(Test-Path -LiteralPath $msi)) { throw 'Installer build completed without the expected MSI.' }
  $artifacts += $msi
}

$metadata = foreach ($artifact in $artifacts) {
  $hash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText("$artifact.sha256", "$hash  $([IO.Path]::GetFileName($artifact))`n", [Text.Encoding]::ASCII)
  $signature = Get-AuthenticodeSignature -LiteralPath $artifact
  [ordered]@{ file = [IO.Path]::GetRelativePath($publishDir, $artifact); sha256 = $hash; authenticodeStatus = $signature.Status.ToString() }
}
$manifest = [ordered]@{ product = 'JackPeek'; version = $releaseVersion; runtime = $Runtime; builtAtUtc = [DateTimeOffset]::UtcNow.ToString('O'); artifacts = @($metadata) }
[IO.File]::WriteAllText((Join-Path $publishDir 'build-info.json'), ($manifest | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
Write-Host "Validated release artifacts: $publishDir"
Write-Host 'Checksums verify file integrity, not publisher identity. See build-info.json for Authenticode status.'
