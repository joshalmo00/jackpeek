# Extractable Components

No framework component files exist. The current app uses vanilla HTML/CSS patterns.

## AppShell
- Source: `src/NetworkPortAnalyzer.Web/wwwroot/index.html`
- Category: layout
- Description: Product shell with brand area, navigation, and tabbed content panels.
- Extractable props: activeItem (string, default: "capture")
- Hardcoded: JackPeek logo image, section labels, all CSS class names.

## SessionCard
- Source: `src/NetworkPortAnalyzer.Web/wwwroot/index.html`
- Category: basic
- Description: Compact metadata card for Windows session, selected Ethernet, and capture state.
- Extractable props: label, value, detail, tone.

## EvidenceReportRow
- Source: `src/NetworkPortAnalyzer.Web/wwwroot/app.js`
- Category: basic
- Description: Recent saved evidence row with device, port, machine, timestamp, frame count, hash, and report links.
- Extractable props: deviceName, switchPort, machineName, createdAt, framesCaptured, observations, sha256.
