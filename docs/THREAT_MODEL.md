# STRIDE Threat Model
Scope: reviewed source snapshot, trusted Windows process, local browser/API, untrusted LAN advertisements and configurable filesystem/NAS. Likelihood is a qualitative scenario estimate, not measured incident frequency.

| Threat / STRIDE | Surface | Impact | Likelihood | Existing / added controls | Recommended control | Residual |
| --- | --- | --- | --- | --- | --- | --- |
| Spoofed identity / S | LLDP/CDP | Wrong port/change attribution | Medium on hostile LAN | Explicit confidence fields, administrative review | Independent networking validation; no identity-authentication claim | MEDIUM; protocols unsigned |
| Malformed TLV / D | Parsers/native driver | Crash or excessive work | Medium | Length checks, TLV/frame/retention caps; truncation/random tests | Coverage-guided native/managed fuzzing and Windows trace | MEDIUM; semantic validation incomplete |
| Local tampering / T | JSON/ledger/settings | Forged evidence or policy | Medium | Hash check; DPAPI option | Protected ACL, signed evidence, separate trust boundary | HIGH for same-user confidentiality claims |
| Repudiation / R | Mutable audit/decision files | Cannot prove who changed data | Medium | Structured bounded audit and timestamps | Protected centralized audit / signed timestamps | MEDIUM |
| Exposure / I | NAS/cache/exports | Infrastructure and personal data loss | Medium | DPAPI local option; no raw pcap; new NAS-primary ledger fix | Share ACL/encryption, endpoint disk protection, old-data migration | HIGH for untrusted same-endpoint users |
| Shared credential / E | AdminService/history | Unauthorized admin | High if deployed with default | Removed default; salted PBKDF2, throttle | Rotate deployed default, controlled provisioning | HIGH until rotation |
| Local API abuse / E | Loopback sign-in | Approved process identity reused by local caller | Medium | Sessions, host/origin browser boundary | Single-user endpoint or redesign with OS-authenticated client boundary | HIGH in shared-host deployment |
| CSRF / T | Browser/API | Settings/capture manipulation | Low after controls | SameSite Strict, JSON POST, exact origin/host, cross-site rejection | Real browser regression / protect local bootstrap | LOW browser, native clients outside boundary |
| XSS / I/E | Advertised strings, UI/reports | Data/session operations | Medium input exposure | escapeHtml, HtmlEncode, no remote scripts, safe new review renderer | Continued sink review, dynamic malicious-string tests | MEDIUM until full runtime testing |
| Session hijack / S | HTTP loopback, local memory | Impersonation | Medium on compromised endpoint | HttpOnly cookies, expiry, logout; no JSON admin token | OS access boundary, consider absolute admin expiry | MEDIUM |
| Log poisoning/leak / T/I | Review comments and errors | Misleading logs or disclosure | Medium | JSON serialization, bounds, credential-pattern redaction | Structured allowlisted details, private collection | MEDIUM |
| Resource exhaustion / D | Capture, file reads, API | App unavailable | Medium | One capture, request/body limits, parser/file caps, auth throttle | Bound repository enumeration and NAS operations | MEDIUM |
| Supply-chain compromise / T/E | NuGet/MSI/release | Endpoint code execution | Medium | Locks, pinned CI actions, scanners, offline license verification | Signed build provenance/runtime SBOM and release gate | MEDIUM |
| Path/auth leakage / I/E | Configurable UNC/reparse roots | Windows authentication to wrong share | Medium | Admin settings gate, qualified paths | Destination allowlist and SMB policy | MEDIUM |
| Concurrent overwrite / T | NAS CSV/decision metadata | Lost index/review updates | Medium with multiple PCs | Unique evidence names, atomic file replacement | Cross-machine transactions/idempotent indexes | MEDIUM |
| Cache deletion / D | Expiration and corrupt files | Loss of pending evidence | Medium | Corrupt cache preserved; expiry configurable | Verified recovery/backups and alert scheduling | MEDIUM |

No network scanner or switch-credential attack surface was found in the runtime. Native Npcap and OS behavior remain a separate attack surface. The local OS account can modify app files it owns; hiding an admin button cannot create an OS security boundary. Sources: TECHNICAL_REVIEW.md, Program.cs, parsers, EvidenceStore.cs, AdminService.cs, AuditLog.cs.
