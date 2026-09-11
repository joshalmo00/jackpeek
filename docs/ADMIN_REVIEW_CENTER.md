# Admin Review Center

JackPeek's Admin Review Center is a local-only workspace for evidence events that need human verification. It is visible only after the existing administrator session is unlocked.

## Review behavior

- Three matching identity fields are compared: switch name, management IP, and chassis/MAC ID.
- A 3/3 match is treated as confirmed continuity.
- A 2/3 match keeps the historical continuity but remains pending for administrator review.
- A 1/3 match creates a new identity folder and remains visible for review.
- A capture waiting for NAS synchronization appears in the same queue. Pending uploads are retained locally until synchronization succeeds.

The original evidence record is never changed or deleted by a decision. Decisions are stored locally in AdminReviewDecisions.json and written to the existing audit log with the administrator identity, timestamp, status, and optional comment.

## Administrator actions

Administrators can inspect the complete evidence, compare the previous linked review, verify SHA-256, export the evidence package, confirm or reject the identity, defer the review, and retry pending NAS synchronization.

All /api/admin/reviews endpoints require the existing jackpeek-admin session token. No new password or external service is introduced.
