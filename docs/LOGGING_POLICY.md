# Logging Policy
AuditLog stores timestamp, action, outcome, optional evidence ID and optional detail in %LOCALAPPDATA%\\JackPeek\\audit.jsonl. Events include capture, sign-in, password changes, settings, account approval, review decisions, sync, integrity verification and some exports. Not every evidence read/download is logged. Admin comments/account names may be personal/confidential data.

Added controls: structured JSON serialization, 2,048-character field bound, common credential-assignment redaction, size rotation at 5 MiB with five backups, and exception-type-only sync failures. Never intentionally pass passwords, tokens, raw packets or request bodies. Pattern redaction is defense-in-depth, not permission to log arbitrary secrets.

ASP.NET uses its configured framework providers (normally console). Application warning calls expose exception type rather than request body. No persistent diagnostic-file provider or remote log exporter is registered. Information/Warning/Error/Debug use framework levels; audit event outcomes are distinct from logger levels. Debug configuration does not sanitize third-party library diagnostics.

Audit writes may fail without blocking successful capture. Files inherit directory permissions and are not signed, append-only enforced, centralized or immutable. Require protected local directory ACLs and organizational collection/retention if audit guarantees matter. Do not claim SIEM-grade evidence.

Source: AuditLog.cs; Program.cs audit calls; EvidenceSyncService.cs.
