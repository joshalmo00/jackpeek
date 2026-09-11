# Data Flow
The first path is inbound passive data. The second is active local HTTP. The third can leave the workstation.

```text
Switch advertisements (untrusted LLDP/CDP; no replies from JackPeek)
    -> Windows wired NIC -> Npcap (promiscuous receive)
    -> SharpPcap BPF -> bounded protocol parsers
    -> aggregated observations -> evidence + derived history

Local Windows APIs -> adapter state / counters / process identity
    -> loopback Kestrel API <-> local browser
       (HTTP; session cookies; no infrastructure authentication)

EvidenceStore -> encrypted local cache
    -> configured archive through OS filesystem I/O
       (active off-host traffic if network path; share authentication by OS)
    -> JSON / record-hash sidecar / CSV index / review metadata
    -> successful upload retains encrypted local cache for 7 days

Explicit export -> browser download (JSON / CSV / HTML / ZIP)
Explicit vendor link -> external browser HTTPS navigation
```

No branch to a JackPeek cloud service, update service, active switch probe or packet-injection function was found. NAS reads occur during history/review refreshes as well as synchronization. Administrative actions write local audit events. License import verifies a supplied file offline.

Trust boundaries: LAN advertisements, local process/browser, local filesystem ACLs, NAS ACL/transport, downloaded reports and build dependencies. See NETWORK_BEHAVIOR.md and THREAT_MODEL.md.
