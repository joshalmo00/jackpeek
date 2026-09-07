# JackPeek brand and interface rules

Use **JackPeek** with this capitalization. The existing port-and-magnifier logo is the product identity; reuse `src/NetworkPortAnalyzer.Web/wwwroot/assets/port-checker.png`, the favicon, and `app.ico`. Do not replace them without an explicit branding decision.

The application is a passive Ethernet inspection tool, not a network scanner, cable certifier, or hosted monitoring service. Say what a control does. Never imply active probing, a verified switch identity, certified security, or a signed publisher unless the behavior has been implemented and verified.

- Interface font: Segoe UI Variable, Segoe UI, system sans. Monospace is reserved for network values and identifiers.
- Graphite header, white panels, neutral gray background, green primary actions. Reuse the tokens in `wwwroot/styles.css`.
- Reuse `.button`, `.badge`, `.panel`, `.detail-grid`, `.notice`, `.empty-state`, and the existing tab behavior.
- Keep the current Capture, Evidence history, and Settings structure. New capabilities should extend it rather than trigger another redesign.
- No gradients, emoji, fake data, testimonials, decorative charts, em dashes, scroll animation, or unsupported controls.
- Label missing data and errors explicitly. Status needs text, not color alone. Preserve visible focus, keyboard navigation, and narrow layouts.

`NetworkPortAnalyzer.exe` remains the compatibility filename for version 1.0. Internal namespaces retain that name. A future executable rename requires coordinated installer, scripts, documentation, and upgrade testing; do not silently rename only one artifact.
