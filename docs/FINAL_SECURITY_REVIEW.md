# Final Security Review
Reviewed 2026-09-09. Scope: reachable repository source, working changes, build files, resolved dependencies and targeted execution. This review does not certify the prebuilt executable or grant FIT approval. Credentials are deliberately not reproduced.

## Findings
Severity is assigned to the observed issue before remediation. Status distinguishes current fixes from deployed/history risks.

| ID | Severity | Finding | Evidence / component | Risk | Recommended remediation | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F01 | HIGH | Shared bootstrap credential in reachable history | AdminService.cs; commit 0a2f0e118c9cd563d6237a3a602bbee724d84c92 | Anyone with the distributed default can unlock administration. | Remove embedded default, provision unique secrets and rotate all affected installations. | Source fixed; existing verifier/history/releases unchanged; rotation REQUIRED. |
| F02 | HIGH | Process-account authentication is not browser-user authentication | Program.cs /api/access/login; WindowsIdentityService.Capture | Native local callers can sign in as the approved server process account. | Use trusted single-user endpoints; redesign OS-authenticated client separation for shared hosts. | Open architectural limit; documented. |
| F03 | HIGH | DPAPI machine scope is not an admin-only secret boundary | EvidenceStore.WriteRecord; AdminManagedCacheEncryption default | Other local processes with ciphertext access can decrypt machine-scoped data; same user can modify policy/verifier files. | Enforce OS ACLs/disk security; use distinct service identity or managed certificate/key boundary if required. | Open architectural limit; no false password-encryption claim. |
| F04 | HIGH | Historical personal data remains in API/export | Program.cs report endpoints; app.js openReport; EvidenceRecord.Workstation | Turning off IncludeWindowsUser does not remove historic user/domain/SID from readable originals. | Separate read/export privacy authorization and explicit redacted derivatives; retain original integrity metadata separately. | Open; new captures honor flag; UI hiding is not sufficient. |
| F05 | MEDIUM | NAS-primary had plaintext local ledger side copies | PortLedgerStore.Save | Sensitive data survives cache cleanup in a different local file. | Derive NAS-primary ledger from evidence; encrypt new local ledger with local encryption policy; migrate old files separately. | Fixed for new writes; existing files need reviewed migration. |
| F06 | MEDIUM | Cleanup/lookup enumerated unrelated JSON | EvidenceStore.EnumerateEvidenceFiles / ApplyRetention | Retention could delete decision/ledger files and parse unrelated sidecars. | Restrict to JP-*.json and JP-*.json.dpapi; retain corrupt cache; disallow plaintext fallback for .dpapi. | Fixed; dedicated directories still required; no old-file cleanup executed. |
| F07 | MEDIUM | Unnecessary TLV bytes and loose CDP filter | Parsers; PassiveCaptureService | Unknown discovery payloads could be retained; non-CDP Cisco multicast delivered before parser rejection. | Omit unknown/truncated payloads; exact SNAP CDP filter; frame/TLV/memory budgets. | Fixed in source; live Windows BPF/capture validation pending. |
| F08 | MEDIUM | Authentication throttling and JS token exposure | Program.cs admin unlock/password; app.js | Repeated password guesses and avoidable script-readable bearer token. | 10 attempts/minute shared limiter; 1 MiB body cap; stop returning admin token to JS. | Fixed; legacy header tokens still accepted; sliding session expiry remains. |
| F09 | MEDIUM | License import lacked admin enforcement | Program.cs /api/license/import | Approved users could replace licensing configuration. | Require server-side admin session for import; require admin for settings even before configured bootstrap. | Fixed. |
| F10 | MEDIUM | NAS metadata concurrency is not transactional | EvidenceStore.WriteNasSidecars; AdminReviewStore.SaveDecision | Concurrent PCs can lose CSV/index/decision updates despite unique evidence files. | Transactional/idempotent per-evidence index or tested cross-machine lock; recovery reconciliation. | Open; temporary filenames made unique; no multi-PC proof. |
| F11 | MEDIUM | Checksums are not authenticity signatures; derivative ledger not verified | EvidenceStore.Verify; EvidenceExport.Package; PortLedgerStore.TryRead | Attacker can alter content and stored hash; UI may rely on unsigned ledger. | Protected signatures/timestamps and trust chain; independently validate ledger derivation. | Open; corrupt records not synced or used as prior match after hardening. |
| F12 | MEDIUM | Storage destination and failure policies incomplete | EvidenceStore.Normalize/GetSettings; configured paths and sync | UNC authentication to arbitrary destination, fallback settings, stalled NAS operations, missed expiry alerts. | Root allowlist/reparse checks, fail-closed policy, cancellable transport, durable alert service. | Open; synchronous OS I/O retained to preserve behavior. |
| F13 | MEDIUM | Partial audit/export policy enforcement | Program.cs export routes; AuditLog | Original exports bypass format policy; not all reads audited; local logs mutable. | Enforce AllowedExportFormats at each route; protected audit sink and access events. | Open; redaction/bounds/size rotation added; NAS CSV formula injection fixed. |
| F14 | MEDIUM | Release signing and native/runtime inventory incomplete | release-windows.ps1; output/v1.0/NetworkPortAnalyzer.exe; WiX | Unsigned or stale artifacts distributed without native vulnerability assessment. | Publisher signing gate; artifact SBOM; Windows installer/capture tests; license review. | Open; package SBOM/locks/security CI added; tracked EXE not rebuilt. |
| F15 | MEDIUM | Unauthenticated semantics and promiscuous capture | LldpParser; CdpParser; PassiveCaptureService; PortSnapshot | Spoofing, misleading identity confidence and inaccurate MED interpretation. | Independent switch validation; semantic parser coverage; test non-promiscuous reception. | Open; no silent capture mode change. |
| F16 | LOW | Broad no-store cache policy and absent browser permission restrictions | Program.cs security headers | Unnecessary static asset cache suppression; undocumented browser features. | Separate static revalidation from no-store sensitive routes; add Permissions-Policy. | Fixed; inline style CSP remains for compatibility. |
| F17 | LOW | Stale UI regression suite and source/report drift risk | tests/ui/smoke.cjs; docs review | Old removed Port log assertions cannot certify current UI; stale report may overclaim. | Update full UI suite; source fingerprint check; explicit manual review gate on changed behavior. | Partly fixed with focused Technical Review tests and fingerprint; broader legacy suite remains open. |

## A-Q Requested Assessment
| Item | Verified assessment |
| --- | --- |
| A. Current behavior | Passive attachment discovery, local adapter counters, evidence/history/inventory, local administration, optional NAS repository. |
| B. Generated traffic | Loopback HTTP, configured OS network-share I/O, user-click external links; development restore/scanners are separate. |
| C. Passive receipt | LLDP EtherType and CDP SNAP; promiscuous capture, no LLDP/CDP transmit calls. |
| D. Windows resources | .NET NetworkInterface, process WindowsIdentity, Environment metadata, DPAPI, browser launch; MSI installs files/shortcut/HKLM value. |
| E. Disk writes | Per-user configuration/verifier/accounts/license/audit, evidence/cache/ledger/decisions, optional NAS JSON/sidecars, browser downloads. |
| F. Data leaving endpoint | Configured remote filesystem and explicitly exported/shared reports; no automatic maintainer/cloud upload found. |
| G. Permissions | Current user for app/files; driver ACL can require elevated capture; per-machine MSI/driver installation requires administrative privileges. |
| H. Dependencies/licenses | Six resolved production NuGet packages; MIT except PacketDotNet MPL-2.0. Npcap separately licensed; WiX build terms separate. |
| I. Existing controls | Loopback/host/origin gate, JSON POST, sessions, PBKDF2, hash checks, optional DPAPI, encoded HTML/CSV, bounded capture duration, one active capture. |
| J. Added controls | F05-F09 fixes, stronger capture/resource bounds, log redaction/rotation, restrictive permission headers, static cache policy, lock files/scanning/review UI. |
| K. Vulnerabilities | F01-F17 above; no CRITICAL exploit demonstrated. High residual architectural/deployment risks remain. |
| L. Secrets | One retired bootstrap password found by redacted Gitleaks in 14 reachable commits. Working-tree scan found no matches. No private signing/API key identified; absence is not proven. |
| M. Cookies/storage | Two first-party HttpOnly Strict session cookies. No browser persistent storage found. Local HTTP cookies lack Secure; native same-endpoint access is a documented limit. |
| N. Cache | API/HTML no-store; static assets revalidate. DPAPI pending cache is not guaranteed to expire while app is closed; old plaintext ledger needs migration. |
| O. Privacy | User inclusion controls future evidence; account directory and historical originals remain personal/confidential. |
| P. Remaining risk | Same-endpoint trust, old default rotation, unsigned evidence/releases, NAS concurrency/transport, semantics, historical privacy, incomplete policy enforcement. |
| Q. Next steps | Rotate deployed credential; validate Windows/Npcap and signed release; test NAS multi-writer/recovery; address server privacy/export controls and independent identity verification. |

## Technical Evidence and Validation
Canonical behavior/operation/data tables: TECHNICAL_REVIEW.md. STRIDE analysis: THREAT_MODEL.md. Source-content hashes: REVIEW_MANIFEST.json. Package-level BOM: sbom.cdx.json. Executed checks and environmental limitations: VALIDATION.md.

Gitleaks is pattern-based; Git scan covers locally reachable refs, not deleted/unreachable history or remote forks, downloaded binaries and past logs outside the repository. Working-tree scan is distinct from history remediation. Rotate first; do not merely erase a string or rewrite history without coordination.

## Approval Conditions
Before sensitive enterprise deployment, the owner must review HIGH findings, confirm rotation, limit endpoint and share access, verify the actual signed Windows artifact/Npcap configuration, test restore/retention/concurrency and record who accepts the residual MEDIUM risks. Until then the assessment is conditional, not Approved.
