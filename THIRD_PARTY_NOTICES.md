# Third-party notices

## SharpPcap

- Package: `SharpPcap` 6.3.1
- License: MIT
- Source: https://github.com/dotpcap/sharppcap
- NuGet: https://www.nuget.org/packages/SharpPcap/6.3.1

## PacketDotNet

- Package: transitive dependency of SharpPcap
- License: MPL-2.0
- Source: https://github.com/dotpcap/packetnet

## Npcap

Npcap is a runtime prerequisite for live capture on Windows. This project does not redistribute, bundle, or silently install Npcap. The free Npcap license places usage and redistribution limits; broader redistribution generally requires a commercial/OEM license from Nmap Software.

- License: https://github.com/nmap/npcap/blob/master/LICENSE
- Redistribution information: https://npcap.com/oem/redist

## System.Security.Cryptography.ProtectedData

- Package: `System.Security.Cryptography.ProtectedData` 8.0.0
- Purpose: Windows DPAPI protection for optional local evidence encryption.
- Source and license: https://github.com/dotnet/runtime

## Heroicons

- Version: 2.2.0, 24-pixel outline set.
- Source: https://github.com/tailwindlabs/heroicons/tree/v2.2.0/optimized/24/outline
- License: MIT, copyright Tailwind Labs, Inc.
- Vendored asset: `src/NetworkPortAnalyzer.Web/wwwroot/assets/heroicons.svg`.
- License text is included in `src/NetworkPortAnalyzer.Web/wwwroot/assets/heroicons-LICENSE.txt` and shipped with the app.
- The source SVG elements are combined into named symbols without changing their path data. All icons load locally.

## Fonts

JackPeek uses operating-system fonts already available to the browser, preferring Arial, Helvetica Neue, and Segoe UI. No font files are bundled, converted, downloaded, or served by this project.

## JackPeek mark

The blue network-port and magnifier mark in `jackpeek-mark.svg`, `favicon.svg`, and its generated Windows icon is original project artwork created for JackPeek. It is not a Freepik asset. Freepik stock was reviewed but not included because the standard license does not grant unrestricted source redistribution for this public repository or unrestricted use as a product trademark.

- Freepik stock terms reviewed on 2026-09-09: https://www.freepik.com/legal/terms-of-use (Section 8.1).
