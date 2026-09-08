# JackPeek

Windows app that starts a local-only web server and opens a browser UI for passive LLDP/CDP discovery and auditable port evidence.

Friend/collaborator setup instructions are in [FRIEND_SETUP.md](FRIEND_SETUP.md).

## What it does

- Runs as `NetworkPortAnalyzer.exe`.
- Binds Kestrel to loopback only.
- Opens the local HTML UI in your default browser.
- Lists Windows network adapters.
- Listens passively for LLDP and CDP advertisements using Npcap and SharpPcap.
- Parses advertised switch identity, port, capabilities, management address, native VLAN, voice VLAN, and verbose TLVs.
- Saves evidence records with workstation name, optional Windows user, capture result, app version, timestamp, and SHA-256 hash.
- Supports local-only, local plus NAS mirror, or NAS-only with encrypted temporary local cache.

## What it does not do

It does not scan, ping, probe, connect to switches, use SNMP, SSH, HTTP, or transmit discovery packets.

## Enterprise evidence

JackPeek is designed for sensitive environments where the safest default is local-only operation.

- The web server binds to loopback only.
- Evidence can be written locally, mirrored to NAS, or written to NAS with only encrypted temporary local cache.
- NAS-only mode writes temporary cache only when the configured NAS/share is unavailable.
- Temporary cache is encrypted, retried on a scheduled interval, deleted after successful NAS sync, and expired after the configured deadline.
- Default cache expiration is 24 hours, with warning states at 3 and 2 hours before cleanup.
- NAS writes are organized by switch identity, port, and date when LLDP/CDP provides enough data. Switch identity uses switch name plus management IP when available, then falls back to management IP or chassis ID. Unknown captures go under `Unresolved`.
- Unique evidence IDs avoid overwrite collisions when many PCs sync at the same time.
- Switch history correlation uses the same port plus at least 2 of 3 switch identity fields: switch name, management IP, and chassis/MAC ID.
- If only 1 of 3 identity fields matches, JackPeek treats it as a new switch identity instead of merging history, but still writes an admin review sidecar so networking can verify the possible relationship.
- If exactly 2 of 3 fields match, JackPeek keeps continuity but writes an admin audit event so networking can verify whether the switch was renamed, re-IPed, or replaced.
- Partial identity matches create a `.admin-review.json` file beside the NAS evidence record.
- NAS writes use temporary files and hash verification before the local encrypted cache is removed.
- Windows PC name and username can be recorded for audit trails, or the username can be disabled in the UI.
- A NAS/shared archive path can be configured for on-prem history without using a cloud service.
- Each saved JSON evidence file includes a SHA-256 hash of the record contents to make tampering easier to detect.
- HTML evidence reports can be opened from the history panel and printed to PDF using the browser.
- CSV, JSON, HTML, and ZIP evidence package exports are available from the history panel.
- The history panel can download an evidence package containing JSON, HTML, and a matching `.sha256` file.
- The local policy surface includes secure mode, optional Windows identity fields, maximum capture duration, and an admin-style setting lock.
- Offline license files can be imported and verified with an embedded public key; licensing is optional until an enterprise policy requires it.
- Evidence can optionally be protected with Windows DPAPI for the current Windows user; encrypted records remain readable through JackPeek but are not plain JSON on disk.
- Local administrative events are written to `%LOCALAPPDATA%\JackPeek\audit.jsonl` without external telemetry.
- A hidden admin unlock panel opens with 7 clicks on the JackPeek logo within 5 seconds. The gesture only reveals the password prompt; the admin password is verified locally with a salted PBKDF2 hash. After an admin password is configured, enterprise settings updates require an unlocked admin session.
- Future SIEM/Syslog, ServiceNow/Jira, CMDB, and Intune/SCCM adapters are intentionally only prepared as local export boundaries; no external connection is enabled by default.

Default local evidence path:

```text
%LOCALAPPDATA%\JackPeek\Evidence
```

Default encrypted pending cache path:

```text
%LOCALAPPDATA%\JackPeek\PendingCache
```

Default settings path:

```text
%LOCALAPPDATA%\JackPeek\settings.json
```

## Build

Install the .NET 8 SDK, then run:

```powershell
dotnet build .\NetworkPortAnalyzer.sln
dotnet run --project .\tests\NetworkPortAnalyzer.Tests
dotnet publish .\src\NetworkPortAnalyzer.Web\NetworkPortAnalyzer.Web.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

The executable will be under `src\NetworkPortAnalyzer.Web\bin\Release\net8.0\win-x64\publish\NetworkPortAnalyzer.exe`.

## Windows MSI release

JackPeek uses WiX Toolset for the Windows installer. WiX is referenced as an SDK-style `.wixproj`, so release builds can run through `dotnet build` after the app is published.

Recommended release command from PowerShell:

```powershell
.\scripts\release-windows.ps1 -Version 1.0
```

The release script:

- Publishes the self-contained Windows executable.
- Builds `installer\JackPeek.Installer.wixproj`.
- Produces `JackPeek.msi`.
- Produces `.sha256` files for the executable and MSI.

Npcap is not bundled in the MSI and is not silently installed.

## Offline licensing

JackPeek validates signed JSON license files locally and does not require an activation server. The application contains only the public verification key. Keep the private signing key outside the repository and inside the organization's secure release process.

Generate a license on an administrative signing workstation:

```powershell
.\scripts\New-JackPeekLicense.ps1 -PrivateKeyPath C:\Secure\jackpeek-license-private.pem -Organization "Example Hospital" -Edition Enterprise -ValidUntil (Get-Date).AddYears(1) | Set-Content .\jackpeek.lic
```

Import the resulting `.lic` file from Settings. The `Require valid license` policy can be enabled only after the license has been installed and verified.

The private signing key is not included in this repository. Replace the embedded public key with the organization's production public key before shipping a commercial build.

## Runtime requirement

Npcap is required for live packet capture. It is not bundled or silently installed because free Npcap redistribution has license restrictions. Install Npcap separately on systems where live capture is needed.

## Run

```powershell
.\NetworkPortAnalyzer.exe
```

Optional flags:

- `--no-browser` starts the local server without opening a browser.
- `--port=47111` binds to a fixed loopback port instead of an available dynamic port.
