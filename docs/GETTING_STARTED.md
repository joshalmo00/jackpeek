# Getting started

JackPeek identifies advertised switch, port, VLAN, and management information from a wired Ethernet connection on Windows. It listens for LLDP/CDP; it does not query switches or perform physical cable tests.

## Run a capture

1. Obtain a build from the project or your administrator. Check the supplied checksum and, when supplied, the Authenticode publisher signature. Current local builds are not automatically signed.
2. Install Npcap separately if required by your organization. Review its license and installation options. JackPeek never installs it automatically.
3. Connect physical Ethernet and run `NetworkPortAnalyzer.exe`. The console prints a `http://127.0.0.1:<port>` address and opens the browser.
4. Select the Ethernet adapter, choose 5 to 120 seconds (subject to policy), and start capture. Another browser tab cannot start an overlapping capture.
5. Select an observed neighbor. The protocol badge identifies the source of that neighbor's fields. Adapter MAC, link state, and IP addresses come from Windows, not LLDP/CDP. Expand details for TLVs.
6. Review saved evidence in Evidence history. JSON preserves decoded values; CSV applies spreadsheet-safe text prefixes to potentially executable cells. A ZIP contains JSON, HTML, a JSON file checksum, and a manifest.

## Understand the values

A native VLAN or voice VLAN is an advertised value, not a connectivity test or proof of current switch configuration. A management address is supplied by the neighbor, not discovered with a ping. Missing fields mean no decoded advertised value was available. No advertisements can mean LLDP/CDP is disabled, the window was too short, or capture access is unavailable.

Separate protocols or chassis/port combinations remain separate observations. Conflicts within a group are displayed. Current first/last observation timestamps are the capture window boundaries. The capture engine does not authenticate advertisements or verify their checksums as a statement of device identity.

## Data handling

The default application data directory is `%LOCALAPPDATA%\JackPeek`. Review Settings before capturing sensitive infrastructure. Recording Windows user identity is enabled by default. Enabling encryption only affects new stored records, not exports or older files.

Read the in-app Privacy Policy and Terms & Conditions. For troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
