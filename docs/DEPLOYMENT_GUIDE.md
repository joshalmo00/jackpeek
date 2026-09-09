# Deployment Guide
Target: .NET 8 Windows application, win-x64 self-contained portable publish in release-windows.ps1; MSI is WiX 7 per-machine. Windows version support matrix, real driver compatibility and MSI execution are Not verified from current implementation by this Mac review.

Install Npcap separately under its vendor terms and organization driver policy. JackPeek does not download/install the driver. Runtime capture elevation depends on Npcap ACL/admin_only. JackPeek does not request Windows elevation for its application admin panel.

Build: dotnet restore --locked-mode; dotnet build; dotnet run --project tests/NetworkPortAnalyzer.Tests. Use scripts/release-windows.ps1 -SkipInstaller for portable publish; the script's optional MSI path requires WiX terms/eligibility review. Run the security CI and Windows tests before release. Obtain publisher-signed executable/installer through your release infrastructure; existing scripts only report signatures.

Uninstall MSI using normal Windows application management. The authored MSI removes its installed file/shortcut/registry key; user-created evidence, cache, accounts, passwords, logs, NAS data and downloads are not covered by installer components. Remove those only under an approved retention procedure.

Recovery: restore validated NAS evidence/metadata backups with ACLs; DPAPI local cache recovery needs the original relevant Windows keys and machine/user scope. Backing up ciphertext alone does not guarantee another workstation can decrypt it. Verify sample restoration and hash checks; review CSV/index concurrency before multi-PC deployment.
