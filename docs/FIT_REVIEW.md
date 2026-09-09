# JackPeek FIT-for-Use Review

Review date: 2026-09-09. Evidence-backed source assessment of the working tree, not a certified release.

## 1. Executive Summary

Conditional evaluation. The source implements a useful attachment-evidence workflow; HIGH and MEDIUM risks remain. This is not a production approval.

## 2. Product Purpose

Identify advertised switch/port information from a wired workstation and preserve observations, attribution and history.

## 3. Business Justification

Can reduce manual jack/port lookup where switches advertise LLDP/CDP. Labor savings, financial return and equivalence to dedicated testers are Not verified from current implementation.

## 4. Intended Users

IT field technicians; application administrators; security/network/management reviewers through the new Technical Review screen.

## 5. Supported Environment

Windows-focused net8.0, release target win-x64, existing Npcap prerequisite. OS/NIC/driver certification matrix is not verified.

## 6. Application Architecture

Core, Protocols, Capture, Windows and Web projects. Embedded browser UI; singleton services; one active capture. See ARCHITECTURE.md.

## 7. Data Flow

Inbound advertisements -> parsers -> evidence; Windows APIs -> local HTTP UI; configured filesystem -> NAS. See DATA_FLOW.md.

## 8. Network Interaction

Passive discovery plus active loopback API and optional share file I/O; user-click external links. No app ping/scan/SNMP/SSH functions found.

## 9. Protocols

LLDP and CDP receive only. Parser TLV inventory and semantic limitations are in TECHNICAL_REVIEW.md.

## 10. Required Permissions

Normal process account for app/data; Npcap ACL may require elevation; MSI/driver installation privileges separate.

## 11. System Changes

Runtime file writes and browser launch; promiscuous capture request. MSI installs executable/shortcut and HKLM marker. No firewall/Defender/network-configuration changes found.

## 12. Security Architecture

Sessions/host/origin validation, password hashing, optional DPAPI, unkeyed evidence checksum, encoded display; see F01-F17.

## 13. Data Classification

Infrastructure fields confidential; attribution/accounts personal; verifier/session IDs authentication-sensitive. Classification is review guidance.

## 14. Data Storage

Per-user defaults, configurable history/archive/cache, plaintext NAS/exports, optional local DPAPI. Full path patterns in TECHNICAL_REVIEW.md.

## 15. Data Transmission

Data can leave via configured remote roots and manual exports. No application cloud telemetry found. OS traffic remains outside app control.

## 16. Authentication

Local process-account allowlist and application admin password. Not enterprise SSO and not an independent browser Windows login.

## 17. Logging

Structured local JSONL, added redaction/size rotation, incomplete action coverage and no immutability. See LOGGING_POLICY.md.

## 18. Privacy

User flag controls future evidence, not old originals/accounts/decisions. Historical API/export issue remains F04.

## 19. Third-Party Software

Six resolved NuGet packages; native Npcap separately installed; WiX build SDK. Package BOM is not complete binary BOM.

## 20. Licensing

MIT/MPL production packages and vendor-specific Npcap/WiX terms. Redistribution and asset rights require owner review; not legal approval.

## 21. Vulnerability Management

NuGet advisory check, Gitleaks source/history scan, pinned security CI and weekly Dependabot. CI execution/remote security settings not verified.

## 22. Operational Risk

Synchronous NAS calls, cache lifecycle dependent on process uptime, partial logging, no assured off-app warning delivery.

## 23. Network Risk

Unauthenticated spoofable advertisements; promiscuous capture; configurable share access may invoke OS authentication. Monitoring invisibility is not promised.

## 24. Endpoint Risk

Same-user/local-admin actors can access or alter user-owned files. DPAPI machine scope is not admin-only isolation.

## 25. Known Limitations

No physical cable/PoE qualification, no guaranteed advertisements, no complete corruption dashboard, no signed evidence or transactional NAS index.

## 26. Compensating Controls

Trusted single-user endpoint, NTFS/share ACLs, disk/SMB encryption, backups, independent networking confirmation and signed release gate.

## 27. Installation Requirements

Separate Npcap installation/license approval; inspect release signature; provision unique password and storage. See DEPLOYMENT_GUIDE.md.

## 28. Uninstallation

MSI removes authored installed artifacts; per-user evidence/settings/NAS/exports remain for controlled retention. Verify Windows uninstall behavior.

## 29. Support Model

Repository documentation exists; monitored private contact, supported lifecycle and response SLA are not verified. SECURITY.md requires owner configuration.

## 30. Disaster/Recovery Considerations

Restore verified NAS backups with ACLs; DPAPI cache recovery depends on machine/user keys; test loss and concurrent update scenarios.

## 31. Security Testing

See VALIDATION.md for executed build/test/security checks and Windows/network limitations. Native capture is not tested by a mocked UI.

## 32. Open Risks

F01-F17 in FINAL_SECURITY_REVIEW.md include severity, source, remediation and current status. Source fixes do not rotate deployed secrets.

## 33. Recommended Approval Conditions

Resolve/accept HIGH risks, rotate legacy credential, validate actual Windows signed artifact, NAS concurrency/transport, privacy/export controls and licensing.

## 34. Final Technical Assessment

Suitable for controlled technical evaluation with explicit limitations. Enterprise FIT approval must be issued by the organization's accountable reviewers after conditions are met.
