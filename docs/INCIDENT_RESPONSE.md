# Incident Response
Private security reporting is required; do not attach infrastructure evidence, credentials or raw dumps to public issues. Designate an incident owner and security contact before deployment; neither response SLA nor a monitored mailbox is established by source code.

For an exposed credential or API key: revoke/rotate first; determine exposure period from commits/releases/logs; search reachable history and distributed artifacts privately; identify affected installations/systems; replace credentials through approved secret storage; document containment and recovery. The retired bootstrap password is a known history finding and must be rotated even though it was removed from current source.

For unauthorized admin access: stop the app, preserve relevant audit files under restricted access, rotate the app password, revoke access approvals if necessary, inspect endpoint compromise and restart to clear process sessions. A password reset alone does not repair a compromised Windows account.

For unexpected outbound traffic: preserve an authorized OS/network trace and process identifiers; distinguish configured share I/O, manually opened browser links, OS activity and unrelated processes. Disconnect suspect destinations under organization procedure. Compare executable signatures/hashes and reviewed source/build records.

For malicious dependency or compromised release: withdraw the release, identify affected versions and package graph/SBOM, rebuild from reviewed dependencies on a clean system, verify publisher signing and notify affected owners privately.

For sensitive logs/exports: contain access, determine recipients/backups, remove or retain copies under policy, rotate any leaked credentials and add regression coverage without embedding the leaked value. Preserve necessary forensic evidence before cleanup.
