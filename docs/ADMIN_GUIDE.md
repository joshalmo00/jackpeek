# Administration Guide
Start JackPeek under the intended Windows account. On a new installation choose Log in as Administrator and create a unique password; future admin sessions use the saved verifier. Do not reuse the retired shared password. Existing installations do not automatically change their verifier.

In Account Manager approve the exact DOMAIN\\username, then have the technician register a display name. This is an allowlist for the server process account, not enterprise SSO. Restrict the endpoint accordingly.

Settings > Technical Review is available to authenticated application administrators. Expand a topic, search for cookies/NAS/permissions, and use Export Technical Review to download the detailed Markdown package, findings, threat model and package SBOM. These documents include open risks; they are not an approval certificate.

General Settings controls evidence roots, user inclusion, retention, encryption and mirror policy. Review Center records administrative identity decisions in a separate mutable file. Confirmation does not cryptographically authenticate a switch or rewrite original evidence. Before removing legacy plaintext ledger files, validate repository contents and authorization.

Source: app.js showAdminTab; Program.cs admin endpoints; AccessPolicyService.cs; AdminReviewStore.cs.
