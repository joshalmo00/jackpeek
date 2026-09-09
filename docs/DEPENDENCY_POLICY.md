# Dependency and SBOM Policy
Production package versions/content hashes are in each project's packages.lock.json. Restore uses nuget.org only. Use dotnet restore --locked-mode in CI; dependency updates intentionally refresh locks and require review. Dependabot is configured weekly. This does not prove GitHub alert settings or organization enforcement are enabled.

Run dotnet list NetworkPortAnalyzer.sln package --vulnerable --include-transitive on every release and retain the advisory output privately. The 2026-09-09 review query returned no advisories for the resolved NuGet graph; Npcap, .NET release binaries, WiX, fonts and operating-system components were not covered by that query.

Run node scripts/review-artifacts.cjs after reviewing changed source/docs. This writes a source fingerprint and CycloneDX 1.5 NuGet-level SBOM from the Web project's resolved lock file. Run with --check to detect drift. It is a documentation change detector, not automatic proof of behavior or source authenticity.

The package SBOM excludes the self-contained runtime, native installed Npcap and installer build dependencies. For release, also generate an artifact-level SBOM using an organization-approved CycloneDX/SPDX tool on publish output, include runtime/native versions and verify licenses. Do not label the source/package SBOM a complete binary inventory.

CI pins checkout/setup-dotnet action commits and the downloaded Gitleaks archive SHA-256. SDK runner images remain externally maintained, so byte-for-byte reproducibility is not verified. Build tooling can make external package/advisory requests. No runtime update checker is implemented.
