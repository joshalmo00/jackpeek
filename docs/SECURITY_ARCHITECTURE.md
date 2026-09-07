# Security architecture

Data flows from the selected physical Ethernet adapter through the Npcap receive filter, LLDP/CDP parsers, observation aggregation, local evidence storage, and the loopback browser UI. Capture does not query or authenticate to switches and does not request switch credentials.

The Windows service listens only on `127.0.0.1`. Host and Origin checks reject alternate hostnames and foreign browser origins; POST APIs require JSON. Framing and nonlocal script loading are blocked. This is not authentication against another process running as the same Windows user. Protect the workstation; do not proxy the API to other machines.

Only adapters returned by the physical Ethernet service are accepted by the scan API. Capture availability uses the NIC identifier rather than a fuzzy display-name match. Only one capture is admitted at a time. Each capture retains up to 10,000 decoded advertisements and the in-memory scan registry is bounded. Unknown TLVs stay hex. Unrelated packet payloads are not exported.

Discovery content remains untrusted. HTML output is escaped. Spreadsheet exports prefix potentially executable cells as text; downstream spreadsheet re-saving can change interpretations, so import untrusted CSV as text and use JSON when exact bytes matter. File checksums detect corruption against a trusted reference; a checksum shipped with a report is not proof of authorship.

Settings, optional license, and audit data use `%LOCALAPPDATA%\JackPeek`; evidence defaults to its `Evidence` subfolder. Port log rows are stored under `PortLedger` in the configured history folder and mirrored under `PortLedger` in the archive location when enabled. Network storage/mirroring is explicitly configurable. DPAPI encryption is optional and only protects stored evidence files, not port ledger rows. Exports, settings, port logs, and audit logs are not DPAPI-encrypted. Retention and deletion do not erase archives or backups.

Audit writes are serialized. If an audit file cannot be written, the application reports a console warning and continues serving results; this is not a fail-closed compliance logging system. General API errors avoid exception traces. ASP.NET and Windows can produce operational logs outside the evidence subsystem.

There is no telemetry, auto-updater, remote support agent, or guaranteed vulnerability response time. Updates are manual. Signing and installer upgrade validation are pending production release work. See [SECURITY.md](../SECURITY.md) for reporting guidance.
