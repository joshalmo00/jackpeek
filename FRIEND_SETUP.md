# Friend Setup Guide

This project is shared at:

https://github.com/joshalmo00/jackpeek

## 1. Get access

The repository is public, so you can clone it immediately. If Joshua wants you to push branches directly, ask him to add your GitHub username as a collaborator in GitHub.

## 2. Clone the repo

```powershell
git clone https://github.com/joshalmo00/jackpeek.git
cd jackpeek
```

## 3. Open it in Codex

In Codex, open the cloned `jackpeek` folder as the project workspace. Ask Codex to inspect the repository first, then work from a branch instead of editing `main` directly.

Good starting prompt:

```text
You are working in the JackPeek repo. Inspect the repository, read README.md and FRIEND_SETUP.md, then create a feature branch for the task I describe. Keep the app passive-only and do not add active network scans or probes.
```

## 4. Use branches

Create one branch per task:

```powershell
git checkout -b feature/my-change
```

Suggested branch names:

- `feature/rename-product-text`
- `feature/installer`
- `feature/live-capture-ui`
- `feature/parser-hardening`
- `feature/release-notes`

## 5. Build and test

Install the .NET 8 SDK, then run:

```powershell
dotnet build .\NetworkPortAnalyzer.sln --configfile .\NuGet.Config
dotnet run --project .\tests\NetworkPortAnalyzer.Tests\NetworkPortAnalyzer.Tests.csproj --configfile .\NuGet.Config
```

To publish a local Windows executable:

```powershell
dotnet publish .\src\NetworkPortAnalyzer.Web\NetworkPortAnalyzer.Web.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false -p:IsTransformWebConfigDisabled=true -o .\output\v1.0 --configfile .\NuGet.Config
```

The ready-to-run executable is:

```text
output\v1.0\NetworkPortAnalyzer.exe
```

To publish the Windows executable, WiX MSI, and SHA-256 release hashes:

```powershell
.\scripts\release-windows.ps1 -Version 1.0
```

Every release should include the executable, MSI, and matching `.sha256` files.

To create an offline license, use `scripts\New-JackPeekLicense.ps1` from a secured administrative workstation. The private signing key must remain outside the repository and outside the installed application. Import the resulting `.lic` file in the Settings tab.

Enterprise deployments can require a valid license, enable Windows DPAPI evidence protection, define retention, disable evidence deletion, and lock settings. These controls are local policy foundations for a later Group Policy provider.

## 6. Safety rules for changes

- Keep capture passive-only.
- Do not add ping sweeps, port scans, SNMP, SSH, HTTP probing, or switch login features.
- Do not silently install Npcap.
- Do not bundle Npcap in the release.
- Keep LLDP/CDP parsing separated from capture code so parser tests can run without Npcap.
- Do not publish packet payloads unrelated to LLDP/CDP.
- Keep evidence storage local-first. NAS/shared-folder archive support must be explicit and user-configured, never hidden.
- Do not add required cloud telemetry, automatic uploads, or remote callbacks for secure deployments.
- Keep the evidence package export local and auditable: JSON, HTML, and SHA-256 travel together in a downloadable ZIP.
- Treat future SIEM/Syslog, ServiceNow/Jira, CMDB, and Intune/SCCM integrations as optional on-prem adapters; they must never become required runtime dependencies.

## 7. Share work back

After changes:

```powershell
git status
git add .
git commit -m "Describe the change"
git push -u origin feature/my-change
```

Then open a pull request into `main` on GitHub and ask Joshua to review it.
