# JackPeek

Windows app that starts a local-only web server and opens a browser UI for passive LLDP/CDP discovery and auditable port evidence.

Friend/collaborator setup instructions are in [FRIEND_SETUP.md](FRIEND_SETUP.md).

Start with [Getting started](docs/GETTING_STARTED.md), [Troubleshooting](docs/TROUBLESHOOTING.md), [Security architecture](docs/SECURITY_ARCHITECTURE.md), and [Release notes](CHANGELOG.md). Contributors should read [CONTRIBUTING.md](CONTRIBUTING.md) and [BRAND.md](BRAND.md). Security reports follow [SECURITY.md](SECURITY.md). The [product maturity review](docs/PRODUCT_PRIORITIES.md) records adopted suggestions and remaining owner decisions.

## What it does

- Runs as `NetworkPortAnalyzer.exe`.
- Binds Kestrel to loopback only.
- Opens the local HTML UI in your default browser.
- Lists physical wired Ethernet adapters, excluding wireless and virtual/VPN adapters.
- Listens passively for LLDP and CDP advertisements using Npcap and SharpPcap.
- Parses advertised switch identity, port, capabilities, management address, native VLAN, voice VLAN, and verbose TLVs.
- Saves evidence records with workstation name, optional Windows user, capture result, app version, timestamp, and SHA-256 hash.
- Uses the configured NAS/shared archive as the default evidence repository. A successful NAS upload keeps an encrypted local cache copy for 7 days; failed uploads remain pending locally until a later sync succeeds.
- Combines matching LLDP/CDP observations into one switch-port result with Switch IP, advertised chassis MAC, VLANs, and other available values.
- Shows Port history beside the current capture, reading matching local and configured NAS ledger records. Selecting a record compares previous and current values side by side.
- Highlights differences between values observed in both captures. Missing values are marked as not observed, rather than treated as confirmed changes. Raw protocol evidence remains available in exports.

## What it does not do

It does not scan, ping, probe, connect to switches, use SNMP, SSH, HTTP, or transmit discovery packets.

## Enterprise evidence

JackPeek is designed for sensitive environments where the safest default is local-only operation.

- The web server binds to loopback only.
- Evidence is written first to the current user's local application data folder.
- Windows PC name and username can be recorded for audit trails, or the username can be disabled in the UI.
- A NAS/shared archive path can be configured for on-prem history without using a cloud service.
- PortLedger records switch, port, VLAN, management IP, workstation, and scanner identity for repeat visits to the same port; it supports history and inventory without a separate Port log workspace.
- Each saved JSON evidence file includes a SHA-256 hash of the record contents to make tampering easier to detect.
- HTML evidence reports can be opened from the history panel and printed to PDF using the browser.
- CSV, JSON, HTML, and ZIP evidence package exports are available from the history panel.
- The history panel can download an evidence package containing JSON, HTML, and a matching `.sha256` file.
- Package checksums cover the exact exported JSON bytes. The record's internal checksum is separate. Neither proves authorship. CSV neutralizes formula-like values as spreadsheet text; JSON retains original decoded values.
- Settings includes optional Windows identity recording, storage, retention, encryption, maximum capture duration, and a local editing lock. The legacy secure-mode flag is preserved but is not presented as a separate protection control.
- Offline license files can be imported and verified with an embedded public key; licensing is optional until an enterprise policy requires it.
- Evidence can optionally be protected with Windows DPAPI for the current Windows user; encrypted records remain readable through JackPeek but are not plain JSON on disk.
- Local administrative events are written to `%LOCALAPPDATA%\JackPeek\audit.jsonl` without external telemetry.
- No SIEM/Syslog, ServiceNow/Jira, CMDB, or Intune/SCCM integration is implemented.

Default local evidence path:

```text
%LOCALAPPDATA%\JackPeek\Evidence
```

Default settings path:

```text
%LOCALAPPDATA%\JackPeek\settings.json
```

## Sign-in and account administration

JackPeek opens with **Log in** and **Log in as Administrator**. Windows sign-in
checks the account running JackPeek using its exact `DOMAIN\username`, without
converting display names to email addresses. `SBHCS\joalvarez` is initially
approved. Other accounts must be approved by an administrator using their exact
Windows username. The two support email addresses are contacts, not login IDs.

An approved user supplies their first and last names on first login. The profile
is saved in `%LOCALAPPDATA%\JackPeek\accounts.json` and reused on this installation.
Future evidence, CSV exports, and port logs include the saved name when identity
recording is enabled, alongside the original Windows identifiers. Existing
records are not rewritten. Account approvals and names are local to this Windows
application-data folder; they are not centrally synchronized through NAS.

Administrator sign-in is reachable from both the initial and access-denied
screens. New installations require an administrator to create a unique local
password; only a salted PBKDF2 hash is stored locally. Existing installations
continue to use their saved password. Any installation that used the retired
shared bootstrap credential must rotate it before deployment. Seven logo clicks
also open the administrator page; cancel restores the current workspace.

Settings has three administrator tabs: **Account Manager** for approvals, account
status, and password changes; **Review Center** for identity and NAS evidence
events; and **General Settings** for evidence storage, identity, retention,
capture policy, licensing, NAS health, and cache synchronization. Disabling an
account prevents new sign-ins and invalidates its active user sessions. This
local application gate does not replace Windows file permissions or enterprise
identity management.

## Build and verification

The UI has Capture and Evidence history workspaces for regular users, plus administrator-only Settings tabs for access, review, inventory, and technical assessment. The rebuilt interface uses an Arial-like system type stack, local Heroicons, a single compact switch-port result, and a one-line port history list. Previous and current captures open side by side with changed fields highlighted. Privacy Policy (`/privacy`) and Terms & Conditions (`/terms`) use the same design.

The Capture screen includes a floating NAS health control with a stethoscope icon. It checks whether the configured repository is writable, shows retained encrypted cache records, pending uploads, cache records close to cleanup, and provides a force-upload action for pending logs.

A Speed Test starts after sign-in and can be canceled or run again. It measures download/upload, HTTPS ping, and jitter through Cloudflare using up to 40 MB per run plus overhead, with a 45-second deadline. This is active Internet traffic over the browser's selected route, which may differ from the Ethernet NIC chosen for passive discovery. No switch evidence or account information is submitted. See [network behavior](docs/NETWORK_BEHAVIOR.md).

Typography uses locally available system fonts, preferring Arial, Helvetica Neue, and Segoe UI. Icons and interface graphics load locally; no remote fonts or interface assets are fetched. Asset sources and licensing are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The legal pages describe this build's behavior. Maintainers should review them for their distribution and any applicable agreements before a public commercial release.

Install the .NET 8 SDK, then run:

```powershell
dotnet build .\NetworkPortAnalyzer.sln
dotnet run --project .\tests\NetworkPortAnalyzer.Tests
dotnet publish .\src\NetworkPortAnalyzer.Web\NetworkPortAnalyzer.Web.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

The executable will be under `src\NetworkPortAnalyzer.Web\bin\Release\net8.0\win-x64\publish\NetworkPortAnalyzer.exe`.

To update the single-file `output\v1.0` build:

```powershell
dotnet publish .\src\NetworkPortAnalyzer.Web\NetworkPortAnalyzer.Web.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false -p:IsTransformWebConfigDisabled=true -o .\output\v1.0 --configfile .\NuGet.Config
```

### Browser verification

`tests/ui/smoke.cjs` checks binary assets, local legal routes, capture and error states, keyboard tabs, settings locks, report search and checksum verification, responsive overflow, and WCAG A/AA rules. It uses simulated API responses for mutations, so it does not change real evidence, policy, or licenses. Screenshots go to the ignored `.ui-test` folder. Passing automated accessibility rules does not replace a full assistive-technology review.

Start the built app with `--no-browser --port=52521`. Install the test dependencies into the ignored test-tools directory and run:

```powershell
npm install --no-save --prefix .ui-test playwright @axe-core/playwright
$env:NODE_PATH = (Resolve-Path .ui-test\node_modules).Path
node .\tests\ui\smoke.cjs
```

The test uses installed Microsoft Edge in headless mode. Set `JACKPEEK_TEST_URL` to use another loopback port.

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
- Stops on build/test failures and writes actual artifact signature status to `build-info.json`. Use `-SkipInstaller` for portable-only packaging. See [RELEASING.md](docs/RELEASING.md).

Npcap is not bundled in the MSI and is not silently installed.

MSI compilation currently requires an owner decision on WiX 7's OSMF EULA (WIX7015). Use `-SkipInstaller` for the verified portable release path. No vendor terms are accepted by the script.

## Offline licensing

JackPeek validates signed JSON license files locally and does not require an activation server. The application contains only the public verification key. Keep the private signing key outside the repository and inside the organization's secure release process.

Generate a license on an administrative signing workstation:

```powershell
.\scripts\New-JackPeekLicense.ps1 -PrivateKeyPath C:\Secure\jackpeek-license-private.pem -Organization "Example Hospital" -Edition Enterprise -ValidUntil (Get-Date).AddYears(1) | Set-Content .\jackpeek.lic
```

Import the resulting `.lic` file from Settings. Enable `Require valid license` after verifying the license; enabling it without a valid license blocks captures.

The private signing key is not included in this repository. Replace the embedded public key with the organization's production public key before shipping a commercial build.

## Runtime requirement

Npcap is required for live packet capture. It is not bundled or silently installed because free Npcap redistribution has license restrictions. Install Npcap separately on systems where live capture is needed. When JackPeek detects a wired adapter but no usable capture device, the app shows a setup prompt with the official Npcap download link and a Check again action.

## Run

```powershell
.\NetworkPortAnalyzer.exe
```

Optional flags:

- `--no-browser` starts the local server without opening a browser.
- `--port=47111` binds to a fixed loopback port instead of an available dynamic port.
