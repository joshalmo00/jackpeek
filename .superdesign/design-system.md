# JackPeek Design System

## Product Positioning

JackPeek is a Windows-first enterprise network port evidence tool. It passively listens for LLDP/CDP, records workstation/session context, and saves auditable evidence locally or to an internal NAS. The design must feel like professional infrastructure software for hospitals, banks, secure facilities, and field technicians.

## Visual Direction

Avoid generic AI dashboard aesthetics: no pale grid backgrounds, no oversized marketing hero, no floating SaaS card collage, no purple/blue gradients. The interface should feel like a precise Windows enterprise console: modern, compact, confident, and operational.

## Identity

- Brand name: JackPeek.
- Tone: secure, technical, exact, calm.
- Logo: use the existing `port-checker.png` mark where a logo appears.
- Main action language: "Start Capture", "Passive Capture", "Evidence", "History", "Settings".

## Color System

Use a restrained but distinctive infrastructure palette:

- Deep graphite/nav: #121b21, #17232b, #20313a
- Industrial teal: #087a78, #075f5e
- Steel blue: #376178
- Copper/amber accent: #ad642f
- Canvas: #edf2f5 or #f4f7f8
- Panel: #ffffff
- Lines: #d7e0e5 and #b9c7cf
- Text: #18222a, #293640
- Muted text: #687885

The palette should not read as one-note teal. Use teal for primary action/status, steel for information, copper/amber for release/integrity/evidence accent.

## Typography

Use a technical IT console font across the whole product: Cascadia Code first, Cascadia Mono/Consolas fallback. Segoe UI may only be a final fallback if monospace fonts are unavailable. The typography should feel like enterprise infrastructure software: heavier labels, crisp tabular data, compact line-height, and stronger hierarchy through weight rather than oversized text. Avoid decorative fonts.

Recommended type rhythm:

- Product name: 20-22px, 800 weight.
- Page title: 22-27px, 800 weight.
- Section title: 16-20px, 750-800 weight.
- Card value: 14-16px, 700-800 weight.
- Labels: 10-12px uppercase, 750-800 weight, modest tracking.
- Body/supporting text: 12-14px, 400-500 weight.

## Layout Principles

- Desktop: app-like shell, preferably compact top header plus refined horizontal tabs or a tight left rail; avoid a centered landing-page hero.
- First screen: focused on capture readiness and one obvious Start Capture action.
- Results, History, and Settings should feel like distinct work areas.
- Use dense but readable cards, tables/lists, and status bands.
- Avoid cards inside cards.
- Border radius max 8px.
- Optimize space like an enterprise console: reduce empty vertical air, keep status context visible, and make tab panels feel like workspaces.
- Prefer flatter panels with hairline borders over large shadows.

## Components

- Navigation tabs should look like modern product navigation, not giant segmented pills. Results, History, and Settings need stronger individual identities with icons/status hints, active underline/rail, and compact labels.
- User/session card should surface Windows user, machine, domain, and capture readiness.
- Settings should contain Enterprise Evidence controls, not the main capture view.
- History should show evidence rows with timestamp, device/port, machine, frames, observations, and SHA-256.

## Hard Constraints

- Keep the app passive-only.
- Do not imply scans, switch login, SNMP, ping, probes, or cloud upload.
- Do not introduce new fonts, whimsical icons, or decorative illustration.
- Use only the fonts, colors, spacing, and component styles defined in this design system.
