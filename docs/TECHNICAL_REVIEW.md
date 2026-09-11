# JackPeek Technical Review

Reviewed 2026-09-09. Source-backed assessment; not an approval or a claim of invisibility.

## Product purpose

JackPeek is a Windows-focused Ethernet attachment identification and evidence utility for field technicians. A technician selects a physical wired adapter, starts a bounded listening window, and reviews switch advertisements and saved history. It supplies part of the logical port-identification workflow of dedicated network-test hardware.

Implemented: switch name/chassis ID, advertised management address, port ID/description, native VLAN, selected voice VLAN policies, capabilities, CDP platform/software, LLDP system description, and CDP duplex when announced. Local APIs expose adapter ID/name/description, MAC, operational state, unicast IPs and byte counters. Missing advertisements remain missing; advertisements are not authenticated.

Not implemented in the inspected local adapter model: subnet/prefix, default gateway, DNS server list, DHCP lease/server details or negotiated link speed. Do not infer these from an interface name. Hardware cable TDR, length qualification, pair faults, certification and PoE load testing are not implemented.

Evidence: src/NetworkPortAnalyzer.Core/Models.cs (AdapterInfo, ProtocolPacket); src/NetworkPortAnalyzer.Windows/WindowsAdapterService.cs; src/NetworkPortAnalyzer.Protocols/LldpParser.cs; CdpParser.cs.

## Architecture and boundaries

Five production projects separate Core models, Protocols, Capture, Windows local queries and the ASP.NET Core Web host. Services are singleton dependencies; EvidenceSyncService is hosted in the process. The embedded HTML/CSS/JavaScript uses same-origin JSON APIs. The host listens on literal IPv4 loopback and normally opens the system browser.

Capture results are aggregated by protocol/chassis/port, then projected by PortSnapshots into combined port views. EvidenceStore saves records; PortLedgerStore supplies a derivative index; AdminReviewStore saves review decisions. ScanRegistry permits one capture at a time and retains at most 100 job entries before clearing them on a subsequent start.

An application administrator is not a Windows administrator. Account sign-in reads the server process Windows identity, not an independently authenticated browser user. The design is suitable only for a trusted single-user endpoint boundary; a local process able to call the loopback API can initiate the approved process account's login. NAC/EDR may still observe the process, driver, endpoint and file/network activity.

Evidence: Program.cs (service registrations, UseKestrel, ScanRegistry); AccessPolicyService.cs; WindowsIdentityService.cs; Core/PortSnapshot.cs. See DATA_FLOW.md and THREAT_MODEL.md.

## Network behavior

The discovery module does not transmit LLDP/CDP frames. Release update: the browser now starts a bounded active HTTPS Speed Test after sign-in. See NETWORK_BEHAVIOR.md for traffic limits, destination and privacy details. Other assessment findings below refer to the reviewed baseline. It is incorrect to describe the complete application as producing no traffic: the browser exchanges HTTP with loopback and configured network storage can cause operating-system file-sharing traffic.

| Operation | Direction | Protocol | Destination | Port / EtherType | Purpose | Trigger / frequency | Mode | Stored | Impact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LLDP capture | Inbound | Ethernet LLDP | Selected NIC; any destination matching EtherType filter | 0x88cc | Attachment identity | Start capture; 5-120 seconds bounded by policy, 30 default | Passive | Parsed observations | Spoofed announcements can mislead; promiscuous capture |
| CDP capture | Inbound | LLC/SNAP CDP | 01:00:0c:cc:cc:cc, Cisco OUI, PID 0x2000 | Ethernet LLC/SNAP | Attachment identity | Same capture window | Passive | Parsed observations | Unauthenticated LAN input |
| UI/API | Both, loopback | HTTP/TCP | 127.0.0.1 | Ephemeral or --port value | Browser UI and actions | Explicit navigation; capture polling ~1 second, counters ~1 second | Active local | Sessions in RAM; action-specific audit | Other local processes can reach listener |
| Network repository | Both, off-host if configured | OS filesystem redirector; commonly SMB | Administrator-configured history/archive path or mapped share | Commonly TCP 445; actual transport not verified | Read/write evidence, sidecars and history | Save, browse/refresh, manual sync; background sync immediately then 5-1440 min (60 default) | Active filesystem I/O | Infrastructure evidence | OS may perform name resolution and integrated share authentication |
| External links | Outbound via browser | HTTPS | npcap.com, github.com | Normally TCP 443 | Manually opened vendor/project pages | User click only | Active user navigation | Browser-managed | Provider/browser policies apply |
| Build tooling | Outbound developer/CI | HTTPS, git | NuGet, Microsoft SDK, GitHub | Typically 443 | Restore/build/scanning | Developer or CI only | Active tooling | Package/build caches | Separate from shipped runtime |

No runtime application calls found for ping/ICMP, ARP scanning, explicit DNS resolution, SNMP, SSH, Telnet, WinRM, LDAP/AD querying, DHCP renewal/configuration, switch login, LLDP/CDP injection, port scanning, raw socket transmission, WebSocket, cloud telemetry, analytics, crash upload or update checks. Kestrel creates listening TCP sockets. OS ARP/DNS/DHCP/NAC behavior is not controlled by JackPeek. No runtime HTTP client or certificate-validation bypass was found.

NAS I/O has no application cancellation/timeout; OS transport negotiation, ports, credentials and SMB encryption are Not verified from current implementation. Network paths can trigger Windows authentication to the configured host. Restrict those destinations through organizational policy.

Evidence: complete runtime source search; Program.cs routes and Listen; app.js request/pollLiveTraffic; EvidenceStore.cs; PortLedgerStore.cs; EvidenceSyncService.cs. Development references and design samples are not runtime requests.

## Capture and protocol details

SharpPcap 6.3.1 wraps Npcap. Device selection matches the Windows adapter ID within the capture device name; adapter descriptions exclude common virtual/wireless interfaces by heuristic. Open uses DeviceModes.Promiscuous and a 1,000 ms read timeout. Snaplen is not explicitly set: the resolved SharpPcap DeviceConfiguration default is 65,536 bytes. Kernel/native buffers and exact garbage-collection lifetime are Not verified from current implementation.

Current BPF:
```
ether proto 0x88cc or (ether dst 01:00:0c:cc:cc:cc and ether[14:4] = 0xaaaa0300 and ether[18:4] = 0x000c2000)
```

The prior CDP filter matched any frame to the Cisco multicast destination. The revised filter also checks LLC/SNAP bytes before delivery. This expression targets untagged frames; EthernetFrameReader handles VLAN tag nesting, but tagged LLDP/CDP admission by this BPF is not promised. Promiscuous mode is retained pending a real Windows/NIC multicast reception comparison; disabling it without that check could prevent discovery. It permits receipt of traffic beyond unicast-to-host before filtering, not visibility of every port on a switched network.

Raw frame bytes exist temporarily during callbacks. No pcap writer, CaptureFileWriterDevice or full-frame disk persistence exists. Parsers reject frames over 65,535 bytes, process at most 256 TLVs and omit unknown/truncated TLV payload bytes for new results. Unknown type metadata remains. Legacy evidence may still contain hex. Parsed retained frames are capped at 10,000 and 4 MiB of source-frame bytes; decoded object/string overhead is additional. Results retain latest packets plus conflict strings, not all frames. RAM is garbage-collected, not securely zeroed; OS swap/crash dumps are outside this guarantee. Capture stop, callback detachment and close run in finally blocks, including cancellation.

| Protocol | Receive | Transmit | Authentication | Infrastructure credentials | Active query | Implemented fields |
| --- | --- | --- | --- | --- | --- | --- |
| LLDP | Yes | No | None | None | No | TLVs 1 chassis, 2 port, 3 TTL, 4 port description, 5 system name, 6 system description, 7 capabilities, 8 management address, 127 organizational |
| CDP | Yes | No | None | None | No | Header version/TTL; 0x0001 device ID, 0x0002 first supported IPv4 address, 0x0003 port ID, 0x0004 capabilities, 0x0005 software, 0x0006 platform, 0x000a native VLAN, 0x000b duplex, 0x000e voice VLAN |

LLDP organizational parsing supports 0080c2/subtype 1 port VLAN ID and 0012bb/subtype 2 MED network policy. The implementation maps application types 1-5 with VLAN >0 into VoiceVlan; it does not fully validate all MED semantics. LLDP address decoding accepts IPv4/IPv6; unsupported known address bodies can be rendered as hex. CDP verifies destination and SNAP signature but not the CDP checksum or version semantics. Duplicate recognized TLVs generally use the last value; capabilities accumulate. Mandatory TLV ordering is not enforced. UTF-8 replacement decoding is used. A chassis identifier is not always a MAC; CDP Device ID can duplicate name and chassis, so a 2/3 score is not necessarily two independent facts.

Evidence: Capture/PassiveCaptureService.cs; Protocols/*.cs; Capture/ObservationAggregator.cs; Core/PortSnapshot.cs. Dependency default verified at https://github.com/dotpcap/sharppcap/blob/v6.3.1/SharpPcap/DeviceConfiguration.cs and CaptureDeviceExtensions.cs.

## Windows access and permissions

| Source / component | Purpose | Privilege | Access / modification |
| --- | --- | --- | --- |
| NetworkInterface.GetAllNetworkInterfaces, GetPhysicalAddress, OperationalStatus, GetIPProperties().UnicastAddresses | Local adapter metadata | Normal user expected; deployment not verified | Read |
| GetIPv4Statistics().BytesReceived / BytesSent | Observed local traffic counters | Normal user expected | Read; not a speed test |
| WindowsIdentity.GetCurrent, Name, User.Value | Process account, domain, SID for access; optional evidence attribution | Current process token | Read; no AD/LDAP lookup |
| Environment.MachineName, OSVersion; Assembly version; GetFolderPath(LocalApplicationData) | Device/version/paths | Current user | Read |
| ProtectedData.Protect / Unprotect | DPAPI evidence/ledger encryption | Process user; scope configured | Cryptographic API; writes resulting files |
| Process.Start with UseShellExecute | Open local URL in default browser | Current user | Launches browser only; no shell interpolation |
| Npcap via SharpPcap | Open capture handle | Depends on installed driver ACL/admin_only | Opens/closes packet handle; promiscuous mode |
| WiX per-machine MSI | Program Files executable and Start Menu shortcut | Installer elevation normally needed | Creates/removes installed artifacts; HKLM Software\\JackPeek installed=1 |

No runtime WMI/CIM, PowerShell, ipconfig, netsh, route, Get-NetAdapter or Get-NetIPConfiguration invocation was found. The release PowerShell script runs dotnet, Get-FileHash and Get-AuthenticodeSignature. The license-authoring script reads an operator-supplied private PEM and signs offline; it is not a runtime switch credential.

| System category | Runtime | Installer / tooling |
| --- | --- | --- |
| Registry | NONE in runtime source | CREATE/DELETE HKLM Software\\JackPeek installed; Windows Installer also manages its registration |
| Firewall / Defender | NONE | NONE in project installer |
| Adapter IP, routes, DNS, DHCP, proxy | NONE | NONE |
| Services / scheduled tasks | NONE | NONE in JackPeek MSI; separately installed Npcap has a driver/service |
| Drivers | READ/use existing capture API | JackPeek does not install Npcap |
| Certificates | NONE explicitly | Release script reads Authenticode; no signing operation |
| Local users / security policies / GPO | NONE | NONE |
| Environment variables | Standard framework configuration may read variables | Tool-specific build settings; no app persistence |
| Installed applications | Launch default browser | CREATE/DELETE JackPeek files/shortcut |

Npcap is a separate native Windows capture driver requirement. Detection is enumeration, not reliable version/access diagnosis. Minimum compatible installed Npcap version and actual ACLs: Not verified from current implementation. Installing Npcap needs separate organizational approval/elevation. admin_only can invoke NpcapHelper elevation. The app has no runas manifest or UAC request of its own. SharpPcap's MIT license does not grant Npcap redistribution rights.

Evidence: Windows/*.cs; Program.cs; EvidenceStore.cs; installer/Package.wxs; scripts/*.ps1. Npcap installation behavior: https://npcap.com/guide/npcap-users-guide.html.

## Data inventory and storage

Classification below is a conservative review recommendation, not an implemented DLP label.

| Data | Collected / source | Purpose / persisted | Location | Encryption | Retention | Export / transmission | Classification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Adapter MAC, IPs, names, link state | Yes; local .NET APIs | UI; AdapterInfo is not saved in EvidenceRecord | RAM / browser DOM | None in RAM | Session | Loopback API | Confidential infrastructure |
| Adapter ID, scan times/counts/errors | Yes; capture service | Attribution; saved | Evidence roots and ledger | Optional/local DPAPI | Evidence policy | JSON/CSV/HTML/ZIP; configured share | Confidential infrastructure |
| Switch name/IP/chassis/port/VLANs/model/software/capabilities | When advertised; LLDP/CDP | Discovery/history | Evidence and ledger | Optional local; NAS plaintext | Evidence policy | Same exports / share | Confidential infrastructure |
| Unknown TLV bytes | No for new captures | Type metadata only | Evidence | Same as evidence | Same | Legacy exports may contain old hex | Potentially sensitive LAN data |
| Machine name, OS, app version | Yes; Environment/Assembly | Evidence attribution | Evidence | Same | Same | Evidence exports / share | Internal endpoint information |
| Windows name/domain/SID/display name | Access flow always; new evidence if IncludeWindowsUser | Access / attribution | accounts.json plus optional evidence | accounts plaintext; evidence optional | Accounts until removed; evidence policy | Saved evidence may be exported | Personal / confidential |
| Settings, paths, retention, flags | Admin configuration | Operation; saved and embedded in records | settings.json, EvidenceRecord.Settings | Settings plaintext | Until changed/removed | Paths can be in exported evidence | Confidential configuration |
| Password verifier | Explicit admin setup | PBKDF2 salt/hash | admin.json | Salted hash, not encrypted | Until changed/removed | Not exported by app | Authentication-sensitive |
| Session IDs | RandomNumberGenerator | Auth | Server RAM and HttpOnly cookies | Not encrypted transport on loopback HTTP | 30-minute sliding admin / 8-hour user | Loopback | Secret |
| Audit events / review comments | App actions | Audit / decision history | audit.jsonl*, AdminReviewDecisions.json | Plaintext | Bounded audit files; decisions indefinite | File sharing if configured root is remote | Confidential / personal |
| Offline license | Imported signed document | Entitlement | license.lic | Signature verification; plaintext claims | Until replaced/removed | No online activation | Internal organization data |

Defaults under %LOCALAPPDATA%\\JackPeek: settings.json, admin.json, accounts.json, license.lic, audit.jsonl, Evidence\\<machine>\\<yyyy-MM-dd>\\JP-*.json, PendingCache\\<machine>\\<date>\\JP-*.json.dpapi. Local ledger: <history>\\PortLedger\\<timestamp>-<id>.json (or .json.dpapi for new encrypted local records). Review decisions: <history>\\AdminReviewDecisions.json.

NAS evidence: <archive>\\Switches\\<sanitized name_IP>\\<port>\\<date>\\JP-*.json; incomplete identity goes under Unresolved\\<machine>\\<date>. Sidecars: .sha256, index.csv and optional .admin-review.json. Local/mirror mode also writes <archive>\\PortLedger. NAS-primary now derives ledger views from evidence in memory instead of creating another plaintext local ledger. Previously created files are not migrated/deleted automatically.

NAS-primary is the default storage mode. It writes encrypted local cache first, attempts NAS, verifies the deserialized record hash, and keeps the encrypted local cache copy for 7 days after successful upload. If upload fails, the cache remains pending until a later sync succeeds. NAS records and exports remain plaintext even if local encryption is required. Windows file-sharing credentials/encryption are controlled by OS/share configuration. DPAPI LocalMachine is the default admin-managed setting; it is NOT an admin-only password and readable ciphertext can be decrypted by another process on that computer. CurrentUser scope limits decryption to that user, not to this application. Cross-machine recovery of DPAPI requires appropriate keys; NAS JSON is intentionally portable.

No custom NTFS ACL installation is implemented. Paths must be fully qualified but UNC destinations and reparse points are not allowlisted. Disk I/O runs as the process Windows account. No database, SQLite, Credential Manager integration or persistent browser store exists in runtime code.

Evidence: Models.cs; EvidenceStore.cs (DefaultSettings, BuildRecordPath, BuildNasRecordPath, WriteRecord); PortLedgerStore.cs; AdminReviewStore.cs; AdminService.cs; AuditLog.cs. DPAPI scope: https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.dataprotectionscope.

## Authentication and web controls

The service binds to 127.0.0.1 only. Host validation rejects DNS-rebinding names; Origin validation requires the exact local HTTP origin when supplied; Sec-Fetch-Site cross-site requests are rejected. POSTs require application/json. No permissive CORS middleware exists. Missing Origin is permitted for native clients, so this is a browser cross-site boundary, not local-process authentication.

Capture/evidence/report APIs require approved user or admin sessions. Administrative review/accounts and Technical Review require admin authorization. License import and settings mutation now require admin authorization. Bootstrap is explicit first-run password creation on a trusted endpoint; the previously embedded shared password has been removed. Existing installations keep their password verifier and must rotate the old shared password. Password change verifies the current password, atomically replaces the salt/hash and clears admin sessions. PBKDF2-SHA256 uses 210,000 iterations, a random 16-byte salt and 32-byte hash; comparison is fixed-time. Review hardening adds 10 shared authentication attempts/minute (no queue), request body limit 1 MiB and password length cap 1,024. PBKDF2 work-factor adequacy for the target endpoint still needs benchmarking. No MFA or independent per-browser Windows logon is implemented.

| Cookie | Purpose | Required | Persistence / lifetime | Sensitive | Flags |
| --- | --- | --- | --- | --- | --- |
| jackpeek-session | Approved process-account access | Yes for standard user session | Session cookie; server expiry 8 hours | Opaque random 32-byte token | HttpOnly, SameSite=Strict, Path=/ |
| jackpeek-admin | Application administrator access | Yes for admin session | Session cookie; server sliding expiry 30 minutes | Opaque random 32-byte token | HttpOnly, SameSite=Strict, Path=/ |

These are first-party cookies. Secure is not set because the application intentionally serves HTTP loopback; HSTS is not appropriate here. Tokens are regenerated at authentication, invalidated on logout and lost on restart. Admin unlock no longer returns the token in JSON to JavaScript. Legacy header-token acceptance remains for compatibility. No localStorage, sessionStorage, IndexedDB, Cache API or service-worker use was found. Sensitive data remains in DOM/JavaScript memory while displayed; no promise of secure RAM erasure.

API, HTML and report responses use Cache-Control: no-store; bundled CSS/JS/images use private, max-age=0, must-revalidate. Headers include nosniff, no-referrer, DENY, CSP frame-ancestors none and Permissions-Policy denying camera/microphone/geolocation/payment/USB. CSP limits scripts to self and connections to self plus https://speed.cloudflare.com, disables objects and base URLs; style-src still permits unsafe-inline for existing UI/reports. No unsafe-eval is used. No TLS certificate validation bypass was found. App HTTP is not appropriate for exposing the listener to LAN/Internet; NAS transport security must be configured externally.

Most UI string interpolation passes escapeHtml; report HTML uses WebUtility.HtmlEncode. Evidence identifiers and path segments are constrained. JSON handles structured inputs; no shell concatenation or SQL interface was found. Structured audit redaction now masks common credential assignments and caps details; it does not make arbitrary prose safe to log.

Evidence: Program.cs; LocalRequestPolicy.cs; AdminService.cs; AccessPolicyService.cs; app.js (request, escapeHtml, openReport); AuditLog.cs; EvidenceExport.cs.

## Retention, integrity and privacy limits

Default evidence retention is 0 (indefinite). Positive retention runs only when a new capture is saved AND AllowEvidenceDeletion is true, using filesystem modification time in the local history root. Cleanup and lookup now restrict enumeration to JP-*.json / JP-*.json.dpapi, avoiding ledger/decision/config JSON. Manual deletion affects local/cache copies only and still depends on enterprise deletion policy. Share copies, prior ledgers, review decisions and exports are not automatically erased.

Uploaded local cache retention is 168 hours by default, with warning thresholds 24 and 12 hours and sync 60 minutes (5-1440). Expiry cleanup applies only after a NAS upload has succeeded; pending upload cache is retained for later synchronization. Expiry checks run only while the process runs; no scheduled service deletes data while JackPeek is closed. Failed decryption/corrupt records are retained for review, not silently deleted. Warnings are shown by the Capture screen NAS health control and recorded in audit; delivery to an absent administrator is not guaranteed. Long sync intervals may miss the desired pre-expiry notification.

New audit logging rotates at 5 MiB into five backup files plus the active file. It is size-based, not a time-based or immutable compliance audit. Existing huge logs are rotated on next write; backups/settings/accounts/decisions and exports require organization-managed retention. Audit failures log only exception type and do not fail a completed capture.

Evidence SHA-256 covers the web-JSON serialization of the record with Sha256 empty. It detects accidental changes when the stored hash remains trustworthy; someone able to modify both content and hash can forge it. NAS .sha256 is this record hash, not sha256sum of the full JSON file. ZIP export has a distinct checksum of the exact exported JSON bytes. No cryptographic origin signature or protected timestamp exists for evidence. Offline license RSA verification is a separate control, not evidence signing.

New records omit Windows user/domain/SID/display name when IncludeWindowsUser is false. This does not rewrite old records, accounts, past decisions or audit entries. UI suppression is not a server-side redaction of old API responses or original exports. Reports can contain historical personal data and configured paths. Changing a privacy flag is not a retroactive deletion request.

Evidence: EvidenceStore.cs (ApplyRetention, SyncPendingCache, Verify); EvidenceExport.cs; AuditLog.cs; Program.cs report routes; app.js openReport; AccessPolicyService.cs. See DATA_RETENTION.md, PRIVACY.md and FINAL_SECURITY_REVIEW.md.

## Dependencies, build and licensing

| Component | Resolved version | Relationship / purpose | License evidence | Review result |
| --- | --- | --- | --- | --- |
| SharpPcap | 6.3.1 | Direct Capture package; capture wrapper | NuGet nuspec MIT | No vulnerability returned by NuGet audit at review |
| PacketDotNet | 1.4.8 | Transitive; SharpPcap dependency | NuGet nuspec MPL-2.0 | Same audit scope |
| System.Security.Cryptography.ProtectedData | 8.0.0 | Direct Web package; DPAPI | NuGet nuspec MIT | Same audit scope |
| System.Memory | 4.6.3 | Transitive buffer primitives | NuGet nuspec MIT | Same audit scope |
| System.Runtime.CompilerServices.Unsafe | 6.0.0 | Transitive runtime primitives | NuGet nuspec MIT | Same audit scope |
| System.Text.Encoding.CodePages | 9.0.5 | Transitive encodings | NuGet nuspec MIT | Same audit scope |
| .NET / ASP.NET Core | net8.0 target; SDK 8.0.425 used for this review | Runtime/framework | dotnet runtime/aspnetcore MIT and third-party notices | Published runtime patch must be inventoried per release |
| Npcap | Installed version not verified | Separately installed native prerequisite | Vendor license, not MIT | Runtime version/driver vulnerability status not verified |
| WiX Toolset SDK | 7.0.0 | Build-only MSI | Vendor terms / OSMF obligations | Installer build and eligibility not verified in this review |

Only nuget.org is configured in NuGet.Config. Restore lock files now record resolved transitive versions/content hashes; CI uses locked restore. Dependabot monitors NuGet and GitHub Actions weekly. Security CI uses pinned action commit IDs, read-only repository permissions, build/tests and a checksum-pinned Gitleaks binary. Current dependency audit is a point-in-time advisory check, not proof of absence of vulnerabilities or abandoned packages. No npm production dependency exists. UI test dependencies are developer tools and not bundled.

docs/sbom.cdx.json is a CycloneDX package-level SBOM generated from the resolved Web project lock graph by scripts/review-artifacts.cjs. It excludes native Npcap, MSI tooling and the framework/runtime files; a release owner must generate a publish-artifact SBOM for the actual self-contained executable. The review manifest hashes inspected source inputs; it is a change detector, not a signature or automatic security certification.

scripts/release-windows.ps1 builds/tests, publishes win-x64, optionally builds MSI, writes SHA-256 and records Authenticode status. It does not sign EXE/MSI or block unsigned releases. Automatic update delivery/signature verification/rollback is not implemented. The tracked output/v1.0 executable has not been rebuilt or certified by this source review.

SharpPcap and Npcap licenses are separate. Npcap usage/redistribution requires checking applicable vendor terms and organizational eligibility; JackPeek neither bundles nor installs it. Public source is not blanket redistribution permission. Public fonts/images/design references also require a rights review; a complete asset provenance chain is Not verified from current implementation.

Evidence: *.csproj; packages.lock.json; NuGet.Config; Directory.Build.props; installer/*; scripts/release-windows.ps1; .github/dependabot.yml; .github/workflows/security.yml; THIRD_PARTY_NOTICES.md.

## Known limitations and findings

HIGH: the prior shared admin password exists in Git history (commit 0a2f0e118c9cd563d6237a3a602bbee724d84c92, AdminService.cs). Current source no longer embeds it; rotate every installation that used it. History has not been rewritten.

HIGH: same-endpoint callers can initiate approved process-account login; app admin controls do not isolate data from the same Windows account or local administrators. DPAPI LocalMachine is not an admin-only secret boundary. Endpoint trust and ACLs remain required.

HIGH: historical privacy fields remain available in original API/export responses; the current UI flag is not an authorization/redaction boundary. Restrict access and apply an approved migration/redaction design.

MEDIUM: legacy local plaintext ledgers remain after enabling NAS-primary/encryption. New writes are fixed; migration is not automatic. NAS is plaintext JSON; transport encryption/ACLs need deployment validation.

MEDIUM: index.csv append and NAS review decision writes lack a cross-machine transaction/lock. Unique evidence filenames reduce evidence collision risk, but concurrent index updates can be lost. This is not a certified multi-writer repository.

MEDIUM: unkeyed SHA-256, unsigned evidence, spoofable LLDP/CDP and non-independent name/chassis identity matches prevent authenticity guarantees. Bad/unreadable evidence is skipped by some listings; no complete corruption dashboard exists.

MEDIUM: arbitrary fully qualified storage roots/reparse points are allowed, historical settings corruption falls back to defaults, synchronous NAS operations have no application timeout, and expiration/alerts depend on the app running. Use dedicated roots and validate retention/recovery.

MEDIUM: promiscuous receive remains enabled; unknown capture data was minimized but native-driver capture behavior requires Windows verification. Semantic parser gaps include CDP checksum and LLDP-MED classification.

MEDIUM: export format policy is not consistently enforced by server endpoints; authenticated users can export readable original records. Audit entries are mutable local files, some reads/exports are not audited, and admin sessions have sliding expiry refreshed by requests.

MEDIUM: no enforced release signing, runtime/native dependency release inventory or approved support lifecycle. CI configuration is provided but remote execution and repository security settings are not verified.

LOW: CSP retains inline styles; no global secure memory purge; stale UI test selectors reference removed Port log. Further real-browser regression testing remains necessary.

See FINAL_SECURITY_REVIEW.md for remediation status and approval conditions. No CRITICAL finding was demonstrated; that is not proof none exists.

## FIT assessment and verification

Assessment: conditional evaluation only. Not approved for unrestricted sensitive-enterprise deployment by this review. An organizational reviewer must accept or remediate remaining risks, verify Windows/Npcap behavior, validate NAS ACL/encryption/concurrency and confirm deployment/licensing/signing.

Source audit date: 2026-09-09. Baseline: local main based on 5cc30ce plus the uncommitted working tree, including prior UI changes. Runtime facts in this screen include the built assembly version and capture filter; narrative is a reviewed snapshot tied to REVIEW_MANIFEST.json, not a live claim of environmental compliance.

Required verification: build; executable .NET test harness; malformed packet fixtures/randomized parser cases; origin/host/auth/rate-limit checks; dependency advisory audit; redacted working-tree and reachable-history secret scanning; UI desktop/mobile checks; review manifest validation.

Not verified from current implementation: actual Windows NIC capture on this Mac, installed Npcap ACL/version, wire-level packet trace, enterprise NAC/EDR response, signing certificates, MSI deployment, SMB dialect/encryption, multi-PC stress/recovery, repository private-reporting settings and organization legal approval.

The export contains this review, FIT assessment, threat model, policies, source hashes and package SBOM. It intentionally does not bundle evidence files, local settings, account directories or credentials. Export actions are admin-authorized and audited.

Evidence: docs/VALIDATION.md; FINAL_SECURITY_REVIEW.md; REVIEW_MANIFEST.json; TechnicalReviewService.cs; Program.cs Technical Review routes.
