# Network Behavior
The complete operation table and exact BPF are in TECHNICAL_REVIEW.md, sections Network behavior and Capture and protocol details. These sections are the canonical review; no separate marketing claim overrides them.

Runtime discovery: receive LLDP EtherType 0x88cc and CDP Cisco multicast LLC/SNAP. No injection method calls found. Capture mode remains promiscuous. The narrowed CDP BPF matches the Cisco destination, LLC 0xaaaa03, OUI 0x00000c and PID 0x2000. LLDP does not additionally require the standard destination 01:80:c2:00:00:0e, so any matching EtherType may enter. VLAN-tagged reception is not guaranteed.

Runtime local traffic: the browser initiates loopback HTTP requests, including approximately one-second counter/capture polls. Kestrel listens on IPv4 127.0.0.1 with ephemeral or specified port. No remote service binding exists in Program.cs.

Configured shared storage is active I/O. Windows may resolve share names, authenticate with integrated credentials and use SMB. The exact transport, negotiated security, destination ports, retry intervals and OS timeout are Not verified from current implementation. No separate network ping is used to check the NAS. The sync loop tries real file operations immediately at startup and at the configured interval. No explicit reconnect event handler exists.

Manual browser links can visit Npcap/GitHub over HTTPS. .NET restore, CI, dependency/secret scanner installation and the review's tooling contact external services; these are developer operations, not application discovery.

Source: PassiveCaptureService.cs; Program.cs; app.js; EvidenceSyncService.cs; EvidenceStore.cs; PortLedgerStore.cs.
