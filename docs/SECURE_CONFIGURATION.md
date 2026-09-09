# Secure Configuration Baseline
This is an operational baseline, not an automatic enforcement claim.

- Run under the intended technician Windows account on a trusted, single-user endpoint. Keep loopback binding; do not proxy or expose the app.
- Provision an installation-specific administrator password. Rotate any installation initialized with the retired shared bootstrap credential, including test installations.
- Review Npcap license/version/driver ACLs separately. Evaluate non-promiscuous reception in Windows before changing capture mode.
- Give application data directories and NAS shares explicit least-privilege ACLs. Do not use world-writable/shared temporary or mixed-purpose history directories.
- Restrict allowed network-storage destinations at the OS/network policy layer. Require organization-approved SMB transport security; the app does not enforce it.
- Treat NAS JSON, exports and historical ledger files as confidential. DPAPI LocalMachine is not an administrator-only decryption control.
- Choose retention/expiry/sync settings together. A 24h sync interval cannot guarantee a 3h pre-expiry warning. Ensure the application runs when sync is required.
- Disable Windows user inclusion where required, while accounting separately for account approval records, existing history and audit comments.
- Review export permissions: current server format enforcement is incomplete. Share only with authorized recipients.
- Build from reviewed locked dependencies; run secret scanning and tests; verify signed production artifacts through an external release gate.
- Keep antivirus/EDR/firewall controls enabled. JackPeek provides no guarantee of invisibility to monitoring.

Open enforcement gaps and acceptance conditions: FINAL_SECURITY_REVIEW.md and FIT_REVIEW.md.
