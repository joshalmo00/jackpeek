# Privacy

The user-facing [Privacy Policy](src/NetworkPortAnalyzer.Web/wwwroot/privacy.html) is embedded in the application and served at `/privacy`. Keep it synchronized with changes to storage, identity, exports, logs, retention, or network behavior.

JackPeek has no application telemetry or automatic cloud upload. It does retain evidence and port log rows locally by default, optionally including Windows identity. User-configured network storage and archive mirroring can send evidence and port history off the workstation. Exports are readable even when evidence files were stored with DPAPI encryption. Local deletion does not remove archives, backups, exports, port ledger rows, or audit entries.

Do not describe this application as collecting no data. Maintainers must review the policy for their distribution and agreements before commercial release.
