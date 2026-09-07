# JackPeek product interface

## Research and decisions

Reviewed 2026-09-05. These are workflow references, not copied designs.

- NetAlly LinkRunner presents the nearest switch and port on a result card, then expands detail. Put identity and port first in JackPeek, with VLANs beside them. https://www.netally.com/user-guides/linkrunner/Content/B_Testing-Applications/AutoTest/Wired/Wired-Profile-Results.htm
- Pockethernet groups physical link and LLDP/CDP information into diagnostic sections and supports reports. Keep adapter context visible and make saved evidence a separate workspace. JackPeek does not implement Pockethernet's active tests or hardware measurements. https://pockethernet.com/manual/index.html
- Wireshark separates a selectable overview from detailed protocol fields. Use a neighbor list and detail pane, with raw TLVs collapsed. https://www.wireshark.org/docs/wsug_html_chunked/ChUsePacketListPaneSection.html
- FTC guidance says privacy disclosures should explain actual data practices. The local evidence store, Windows identity, optional network archive, exports, logs, and retention behavior must be disclosed accurately. https://www.ftc.gov/business-guidance/resources/marketing-your-mobile-app-get-it-right-start

## Visual system

Segoe UI Variable / Segoe UI / system sans for interface text; Consolas monospace only for addresses, ports, identifiers and protocol values. Off-white #f5f6f8 canvas, white panels, #192330 ink, #596574 secondary text, #dce1e7 rules. Dark #17212d header; #176b55 action accent. Status colors: green #166347, amber #85520b, red #a32c30. No gradients, marketing hero, testimonials, emoji, em dashes or scroll animation. 4/8/12/16/24/32 spacing, 6px control radius, 8px panel radius. Visible focus rings; native inputs; compact outline icons.

## Architecture

Capture combines adapter context, duration, one primary action, progress, and neighbor results. A two-pane result workspace prioritizes switch name, physical port ID, management address and VLANs. Never populate production screens with invented observations. Empty, disconnected, missing driver, running, processing, error and completed states are distinct. Capture readiness means a mapped capture device, not proof of permission to open it.

Evidence history has search, a selectable report, verification and exports. Show verification as a checksum comparison, not an authenticity guarantee. Settings groups storage, identity, retention, policy and offline license. No decorative disabled controls. Privacy Policy and Terms & Conditions are actual local routes in the same visual system. All application assets remain embedded and offline. The localhost service stays bound to 127.0.0.1.
