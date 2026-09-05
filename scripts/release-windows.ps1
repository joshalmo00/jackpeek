param(
  [string]$Configuration = "Release",
  [string]$Runtime = "win-x64",
  [string]$Version = "1.0"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outputRoot = Join-Path $repoRoot "output"
$publishDir = Join-Path $outputRoot "v$Version"
$installerProject = Join-Path $repoRoot "installer\JackPeek.Installer.wixproj"
$webProject = Join-Path $repoRoot "src\NetworkPortAnalyzer.Web\NetworkPortAnalyzer.Web.csproj"
$nugetConfig = Join-Path $repoRoot "NuGet.Config"

New-Item -ItemType Directory -Force -Path $publishDir | Out-Null

dotnet publish $webProject `
  -c $Configuration `
  -r $Runtime `
  --self-contained true `
  -p:PublishSingleFile=true `
  -p:DebugType=None `
  -p:DebugSymbols=false `
  -p:IsTransformWebConfigDisabled=true `
  -o $publishDir `
  --configfile $nugetConfig

dotnet build $installerProject -c $Configuration -p:Platform=x64 --configfile $nugetConfig

$candidateArtifacts = @(
  (Join-Path $publishDir "NetworkPortAnalyzer.exe"),
  (Join-Path $repoRoot "installer\bin\x64\$Configuration\JackPeek.msi"),
  (Join-Path $repoRoot "installer\bin\$Runtime\$Configuration\JackPeek.msi"),
  (Join-Path $repoRoot "installer\bin\$Configuration\JackPeek.msi")
)

$artifacts = $candidateArtifacts | Where-Object { Test-Path $_ } | Select-Object -Unique

foreach ($artifact in $artifacts) {
  $hash = Get-FileHash -Algorithm SHA256 -Path $artifact
  "$($hash.Hash.ToLowerInvariant())  $(Split-Path -Leaf $artifact)" |
    Set-Content -Encoding ascii -Path "$artifact.sha256"
}

Write-Host "Windows release artifacts:"
foreach ($artifact in $artifacts) {
  Write-Host " - $artifact"
  Write-Host " - $artifact.sha256"
}
