# Releasing JackPeek

Use the .NET 8 SDK on Windows. The canonical portable filename remains `NetworkPortAnalyzer.exe` for compatibility; product name is JackPeek. Use predictable numeric release versions and document behavior in CHANGELOG.md.

```powershell
./scripts/release-windows.ps1 -Version 1.0 -SkipInstaller
```

Omit `-SkipInstaller` to include the WiX MSI build. Use `-OutputRoot ./.ui-test/releases` for a trial build. The script builds and tests before publishing, checks every native exit code, passes the same normalized version to the EXE and MSI, requires the expected artifacts, and writes SHA-256 files and `build-info.json`. A hash is calculated over the artifact's actual bytes. The metadata reports the observed Authenticode status; it does not claim unsigned artifacts are signed.

The existing installer references WiX Toolset 7. In local verification on September 6, 2026, MSI compilation stopped with WIX7015 because the Open Source Maintenance Fee EULA had not been accepted. A release owner must review the vendor's terms and eligibility before enabling MSI builds. No acceptance is automated here. The portable `-SkipInstaller` path is verified and does not depend on WiX.

The CI workflow runs build/tests and portable packaging on Windows. It does not deploy, publish a GitHub release, sign an artifact, or test a physical NIC. Its first hosted run occurs after the workflow is pushed. High/critical NuGet advisories fail the audit step when reported by the source. Review the output and all remaining warnings.

Before a public release, owners must choose a redistribution license, identify the legal publisher, establish a private security contact, review dependency notices and legal pages, and test installation, upgrade, and uninstall on a clean Windows machine. Obtain a legitimate signing certificate through the owner's release process. Keep private keys outside the repo. Sign finalized EXE/MSI files and regenerate checksums afterward; verify the publisher signature on another machine. There is currently no automatic signing step.

Verify the portable app serves `/`, `/privacy`, `/terms`, assets, and API routes on loopback. Run the browser smoke tests described in README.md, then test Npcap absence and a real LLDP/CDP-capable Ethernet link. Keep synthetic test success distinct from a hardware validation result. Do not install a test MSI over a production installation to perform these checks.
