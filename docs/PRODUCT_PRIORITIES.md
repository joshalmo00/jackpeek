# Product maturity review

The supplied 40-point brief is a useful checklist, not a reason to build 40 new features. The existing UI, privacy/terms pages, passive architecture, local settings, exports, logo, and accessibility checks already cover much of it.

## Applied in this pass

- Evidence integrity and safe exports: corrected ZIP file checksums, spreadsheet formula handling, and physical port selection.
- Capture reliability: server-side Ethernet validation, concurrent-capture rejection, handler cleanup, result bounds, actionable errors, and serialized audit writes.
- Local web protection: Host/Origin validation, JSON-only POSTs, security headers, and generic unhandled-error responses.
- Engineering discipline: regression tests, Windows CI, dependency update configuration, checked release commands, consistent release/MSI version arguments, and artifact metadata.
- Product documentation: brand rules, changelog, contributor guide, privacy index, security reporting, getting started, troubleshooting, architecture, and release checklist.

## Owner decisions still needed

- Software license/EULA and distribution model. No license was invented from the suggestion alone.
- Publisher identity, a code-signing certificate, and a real private support/security contact.
- Public website hosting, domain, and download distribution. The localhost interface remains a tool, not a marketing site.

## Next engineering candidates

- About/support view with build/runtime information and explicitly reviewed diagnostics export.
- Timestamp each observation from actual packet arrival, and test cross-protocol identity correlation before merging neighbors.
- Enforce an explicit export allowlist if that legacy setting is intended as a real policy; it is not currently an authorization boundary.
- Harden persistence against interrupted writes and concurrent settings changes, with isolated storage tests.
- Test actual driver lifecycle and MSI upgrades on disposable Windows machines.
- Dependency license inventory with the exact texts required for binary redistribution.

Keep the visual language stable. No active diagnostics, external integrations, fake support addresses, ownership assertions, or signing claims were added.
