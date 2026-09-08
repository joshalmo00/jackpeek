# Changelog

## Unreleased

### Fixed

- ZIP evidence checksums now hash the exact JSON file bytes, including encoding, rather than reusing the record's internal checksum. The manifest names both values separately.
- CSV exports escape quotes, mark formula-like and control-character fields as text, and prefer physical port ID over its description. JSON remains the source for exact values.
- Capture handlers are detached after each run, open devices are closed on failure, and only one capture can run at a time.
- Capture requests enforce current physical Ethernet membership on the server. Results retain at most 10,000 decoded advertisements per capture and report when the limit is reached.
- Unexpected capture failures become completed errors. Audit-file write failures are logged without stranding the capture.

### Security

- Literal loopback Host, same-origin checks, JSON-only POST requests, anti-framing headers, and a content security policy protect the local web interface.
- Unexpected API failures return an actionable generic message instead of an exception trace. Audit failures record exception types rather than raw error contents where possible.

### Added

- Malformed/truncated packet, unknown TLV, missing-field, CSV, ZIP checksum, origin-policy, and concurrent-capture regression tests.
- Security, privacy, contributor, brand, troubleshooting, release, and product-priority documentation.
- Windows CI for dependency auditing, build, tests, and portable artifacts; weekly dependency update configuration.
- Release-script failure gates, synchronized application/MSI version inputs, exact artifact discovery, checksums, and build metadata including actual Authenticode status.

### Known limits

- WiX 7 MSI compilation is blocked by WIX7015 until an owner reviews and accepts the vendor's OSMF EULA. Portable builds are unaffected; no license terms were accepted automatically.

- No publisher signing certificate, dedicated private support address, or software redistribution license has been selected.
- Real capture requires Npcap and an active Ethernet link. Synthetic tests do not substitute for hardware capture and MSI upgrade testing.
- DPAPI protects stored files for the current Windows user; exports are readable. SHA-256 is not an authenticity signature.
- First/last observation timestamps currently describe the capture window, not individual packet arrival times.

## 1.0 UI baseline

- Introduced the Capture, Evidence history, and Settings workspaces, embedded privacy/terms pages, and functional browser/accessibility checks.
- Corrected embedded PNG serving and retained the single-file Windows executable.
