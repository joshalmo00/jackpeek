# Data Retention
| Category | Implemented retention | Deletion boundary |
| --- | --- | --- |
| Native/raw frame buffers | Callback/library lifetime; not written as packet capture | Garbage collection/native release, not guaranteed secure erase |
| Parsed active capture | 10,000 advertisements / 4 MiB source-frame budget / max 120s | Aggregation removes per-frame list; bounded job registry retains results |
| Job registry | Clears when 100 entries reached on next accepted capture; restart clears | RAM only |
| Discovery evidence | Default 0 days = indefinite; positive days only when deletion enabled and next save runs | Matching JP evidence files in local history, based on modification age |
| NAS-primary pending cache | Default 24h; checks on running sync loop; successful upload deletes pending copy | Corrupt/unreadable records retained for investigation |
| Local ledger | No automatic age purge; new NAS-primary writes no separate local ledger | Legacy files need approved manual migration |
| NAS evidence/sidecars | No application age purge | Organization storage lifecycle |
| Audit | Rotate at 5 MiB, five backups plus current | Size rotation; not fixed number of days |
| Review decisions/settings/accounts/license/admin verifier | Until replaced or administratively removed | No blanket uninstall cleanup |
| Downloads/exports/backups | Browser/recipient/organization managed | Never assumed deleted by app |

Warnings use remaining hours, with 3/2-hour defaults, and are written to audit and exposed by the app. No guaranteed notification while closed or with long intervals. Unreadable cache may outlive expiry. Filesystem delete does not guarantee forensic erasure or deletion from backups.

Policy: organization must select an evidence period and review whether local retention purges meet its legal/operational obligations. Do not set LocalHistoryPath to a mixed-purpose directory. Before deleting legacy data, verify NAS evidence integrity and backups, then remove authorized copies under a controlled retention procedure.

Source: EvidenceStore.ApplyRetention/SyncPendingCache/ListPendingCache; AuditLog.Write; ScanRegistry.
