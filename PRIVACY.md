# Privacy

The user-facing [Privacy Policy](src/NetworkPortAnalyzer.Web/wwwroot/privacy.html) is embedded in the application and served at `/privacy`. Keep it synchronized with changes to storage, identity, exports, logs, retention, or network behavior.

JackPeek has no application telemetry or automatic cloud upload. It uses the configured NAS/shared archive as the default evidence repository, while retaining encrypted local cache copies for 7 days after successful upload and keeping failed uploads pending locally until synchronization succeeds. Records can optionally include Windows identity. User-configured network storage can send evidence and port history off the workstation. Exports are readable even when evidence files were stored with DPAPI encryption. Local deletion does not remove archives, backups, exports, PortLedger rows, or audit entries.

The Speed Test runs automatically after sign-in. It sends HTTPS test requests to speed.cloudflare.com, using at most 40 MB of payload per run plus network overhead and a 45-second deadline. Cloudflare sees the public IP and normal connection metadata. Requests omit credentials and referrer information and contain generated test payloads, never switch data, account details, or evidence. Measurements remain in the browser session and can be canceled. The browser route may differ from the selected Ethernet adapter. Port discovery itself remains passive LLDP/CDP capture.

Do not describe this application as collecting no data. Maintainers must review the policy for their distribution and agreements before commercial release.
