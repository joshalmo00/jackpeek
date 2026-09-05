param(
  [Parameter(Mandatory = $true)][string]$PrivateKeyPath,
  [Parameter(Mandatory = $true)][string]$Organization,
  [ValidateSet("Trial", "Professional", "Enterprise")][string]$Edition = "Trial",
  [string]$LicenseId = ([guid]::NewGuid().ToString("n")),
  [datetime]$ValidFrom = (Get-Date),
  [datetime]$ValidUntil = (Get-Date).AddDays(30),
  [string]$MachineId = "",
  [string[]]$Features = @("capture", "evidence", "reports")
)

$ErrorActionPreference = "Stop"
$options = [System.Text.Json.JsonSerializerOptions]::new()
$options.PropertyNamingPolicy = [System.Text.Json.JsonNamingPolicy]::CamelCase
$options.WriteIndented = $true

$unsigned = [ordered]@{
  licenseId = $LicenseId
  product = "JackPeek"
  edition = $Edition
  organization = $Organization
  validFrom = ([datetimeoffset]$ValidFrom).ToUniversalTime()
  validUntil = ([datetimeoffset]$ValidUntil).ToUniversalTime()
  machineId = if ([string]::IsNullOrWhiteSpace($MachineId)) { $null } else { $MachineId }
  features = $Features
  signature = ""
}

$payload = [System.Text.Json.JsonSerializer]::Serialize($unsigned, $options)
$rsa = [System.Security.Cryptography.RSA]::Create()
$rsa.ImportFromPem((Get-Content -Raw -Path $PrivateKeyPath))
$signature = $rsa.SignData(
  [System.Text.Encoding]::UTF8.GetBytes($payload),
  [System.Security.Cryptography.HashAlgorithmName]::SHA256,
  [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$unsigned.signature = [Convert]::ToBase64String($signature)

Write-Output ([System.Text.Json.JsonSerializer]::Serialize($unsigned, $options))
