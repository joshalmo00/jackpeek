# Architecture
Reviewed 2026-09-09; see TECHNICAL_REVIEW.md for the assessed source snapshot.

Core holds immutable records and PortSnapshots. Protocols parses spans without external I/O. Capture resolves an ICaptureDevice, installs a BPF and collects bounded parsed advertisements. Windows reads local adapter statistics and process identity. Web composes singleton services through dependency injection, hosts Kestrel on loopback, embeds static resources and exposes JSON endpoints.

The browser is a presentation layer, not a security boundary. API middleware checks sessions. Account approval is local configuration, not an LDAP/domain authentication exchange. Administrative secrets are verified by AdminService; license RSA signatures by LicenseService; evidence hashes by EvidenceStore.

Storage calls are synchronous and shared services are not universally transactional. ScanRegistry serializes captures but does not serialize evidence reads versus background synchronization. The ledger is a derivative index, not authoritative signed evidence. Review decisions update a separate JSON file. Shutdown cancels the capture delay and closes the capture device; a slow filesystem call is not cancellable by this implementation.

Source: Program.cs; Core/*.cs; Capture/*.cs; Windows/*.cs; Web/*Store.cs. DI/test seams exist for capture device resolution, ledger settings and admin storage root. Error responses expose generic messages while detailed review comments remain confidential data.
