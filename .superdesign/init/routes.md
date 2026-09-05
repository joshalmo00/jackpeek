# Routes

The app is a local-only .NET 8 web application with one HTML route.

## `/`
- File: `src/NetworkPortAnalyzer.Web/wwwroot/index.html`
- Layout: embedded app shell
- Renders: Capture, Results, History, and Settings tab panels.

## API routes
- `/api/session`: workstation identity and evidence settings.
- `/api/adapters`: Windows Ethernet adapter list.
- `/api/scans`: starts passive LLDP/CDP capture.
- `/api/scans/{scanId}`: capture status/result/evidence.
- `/api/evidence/settings`: evidence settings.
- `/api/reports`: local evidence history.
- `/api/reports/{evidenceId}`: saved evidence record.
- `/api/reports/{evidenceId}/download`: JSON evidence download.
- `/reports/{evidenceId}.html`: printable report.
