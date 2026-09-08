# Troubleshooting and support

| Symptom | Check |
| --- | --- |
| No wired Ethernet adapter | Connect a physical Ethernet NIC or USB Ethernet dock and refresh. Wi-Fi, VPN, and virtual switches are intentionally excluded. |
| Disconnected | Check the cable and switch port, then refresh adapters. |
| Capture support unavailable | Check Npcap installation, adapter mapping, and driver access. Restart JackPeek after driver installation. Follow local policy for elevated access. |
| No advertisements | Try a longer window and ask the switch administrator whether LLDP/CDP is enabled on that port. |
| Capture already running | Wait for the other tab's capture to finish. Do not repeatedly submit captures. |
| Capture status unavailable | Keep the executable running and use Check capture status. The job may still be running. |
| Cannot save evidence | Check configured folders, free disk space, and permissions. A local save does not prove a NAS mirror succeeded. |
| Settings locked | An administrator must re-enable `allowSettingsEdit` in `%LOCALAPPDATA%\JackPeek\settings.json`. Back up the file first. |
| Encrypted record unreadable | DPAPI is tied to the Windows user and environment. Use the original account; do not assume a NAS copy is portable. |
| Local address rejected | Open the exact `127.0.0.1` URL printed by JackPeek. Alternate hostnames, reverse proxies, and cross-origin embeds are intentionally unsupported. |

For ordinary bugs, use the project's GitHub issues. Provide the file version from the EXE's Windows Properties, Windows version, Npcap version if known, the action attempted, and the visible error. Remove network addresses, machine/user names, adapter IDs, paths, and license identifiers from attachments. Use synthetic packets instead of customer captures.

Do not upload `Evidence` or `audit.jsonl` by default. Logs and reports can contain sensitive information. For security defects follow [SECURITY.md](../SECURITY.md), not a public technical bug report. There is no promised response time or paid support plan.
