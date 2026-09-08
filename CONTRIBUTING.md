# Contributing to JackPeek

Start with [FRIEND_SETUP.md](FRIEND_SETUP.md). Use a separate branch for each change, with the `codex/` prefix for agent-created branches. Keep pull requests focused and describe the resulting behavior, tests, and remaining limitations.

## Boundaries

- Keep capture passive and limited to physical wired Ethernet. UI filtering must also be enforced by the API.
- Keep parsers, capture, Windows metadata, persistence, exports, and UI responsibilities separate.
- Treat advertised fields as untrusted text. HTML must escape them and spreadsheet exports must neutralize formula-like values.
- Never commit customer packets, workstation evidence, credentials, signing keys, or real license documents. Use synthetic fixtures in tests.
- Follow [BRAND.md](BRAND.md); reuse the established UI rather than redesigning it for each feature.
- Do not add telemetry, external integrations, or pretend security controls incidentally.

## Verification

Run `dotnet build NetworkPortAnalyzer.sln` and `dotnet run --project tests/NetworkPortAnalyzer.Tests`. Browser checks are described in the README. Add tests for changed parser behavior, state transitions, or export contracts. Test empty, loading, failure, and completion paths, not just populated results.

Update `CHANGELOG.md`, affected documentation, and the privacy policy when applicable. Test release scripts in a separate output directory before replacing a shared build. Changes to the installer require install, upgrade, and uninstall testing on a disposable Windows machine.

Repository ownership and redistribution licensing have not been resolved by this guide. Do not add a software license, copyright owner, publisher certificate, or support promise without an owner decision.
