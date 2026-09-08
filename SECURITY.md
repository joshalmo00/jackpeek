# Security policy

## Reporting a vulnerability

Do not put sensitive network evidence, personal identifiers, credentials, or exploit details in a public issue.

Check the repository's [Security advisories](https://github.com/joshalmo00/jackpeek/security/advisories) for **Report a vulnerability**. Use it if available. Private vulnerability reporting must be enabled by a repository administrator; this document does not claim it is enabled.

If that option is unavailable, open a public issue that only asks for a private security contact, without technical details or attachments. Wait for an agreed private channel before sending evidence. No dedicated security email or response-time commitment has been established.

Include the application version, Windows version, a concise impact description, and sanitized reproduction steps. Use synthetic advertisements whenever possible. Do not test other people's networks without authorization.

## Current support scope

Security fixes are developed on the current main branch. There is no long-term-support or backport commitment. Maintainers should review critical and high-severity dependency advisories before releasing a build. The Windows CI restore audits direct and transitive NuGet dependencies and fails on critical/high advisories when those advisories are returned by the configured feed. Audit availability and completeness are not guaranteed.

See [security architecture](docs/SECURITY_ARCHITECTURE.md) for the implemented boundaries and known limitations. Signing, an independent security assessment, and production support commitments remain release-owner responsibilities.
