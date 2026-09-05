# Network Port Analyzer

Windows app that starts a local-only web server and opens a browser UI for passive LLDP/CDP discovery.

Friend/collaborator setup instructions are in [FRIEND_SETUP.md](FRIEND_SETUP.md).

## What it does

- Runs as `NetworkPortAnalyzer.exe`.
- Binds Kestrel to loopback only.
- Opens the local HTML UI in your default browser.
- Lists Windows network adapters.
- Listens passively for LLDP and CDP advertisements using Npcap and SharpPcap.
- Parses advertised switch identity, port, capabilities, management address, native VLAN, voice VLAN, and verbose TLVs.

## What it does not do

It does not scan, ping, probe, connect to switches, use SNMP, SSH, HTTP, or transmit discovery packets.

## Build

Install the .NET 8 SDK, then run:

```powershell
dotnet build .\NetworkPortAnalyzer.sln
dotnet run --project .\tests\NetworkPortAnalyzer.Tests
dotnet publish .\src\NetworkPortAnalyzer.Web\NetworkPortAnalyzer.Web.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

The executable will be under `src\NetworkPortAnalyzer.Web\bin\Release\net8.0\win-x64\publish\NetworkPortAnalyzer.exe`.

## Runtime requirement

Npcap is required for live packet capture. It is not bundled or silently installed because free Npcap redistribution has license restrictions. Install Npcap separately on systems where live capture is needed.

## Run

```powershell
.\NetworkPortAnalyzer.exe
```

Optional flags:

- `--no-browser` starts the local server without opening a browser.
- `--port=47111` binds to a fixed loopback port instead of an available dynamic port.
