# FixTrack Security Notes

## Implemented controls

- Public registration always persists `role: 'Student'`; request-supplied roles are ignored.
- Privileged accounts use `POST /api/admin/users`, which requires a full session, CSRF token, and `Administrator` role.
- Complaint access is filtered on the backend using immutable `studentUserId` and `staffUserId` ownership fields.
- Passwords use bcrypt with 12 rounds and a server-enforced complexity policy.
- JWTs validate algorithm, issuer, audience, purpose, expiry, and a unique token ID.
- Session and pending-TOTP JWTs use HttpOnly, SameSite cookies and production `Secure` cookies.
- TOTP enrollment secrets use AES-256-GCM authenticated encryption at rest.
- Unsafe authenticated requests require signed CSRF tokens bound to the current session.
- Credentialed CORS uses an exact origin allow-list; unsafe browser requests also validate `Origin`.
- Request bodies are limited to 128 KiB and must contain valid JSON with `application/json`.
- Validation sanitizes strings and rejects MongoDB operator-style keys.
- Sensitive user fields are removed from responses.
- Rate limits protect login, registration, and TOTP verification; forwarded IPs are trusted only behind a configured proxy.
- Backend Helmet headers and frontend CSP/frame/MIME/referrer/permissions headers are configured.
- Production HTTPS redirects use configured `PUBLIC_ORIGIN`, not an untrusted Host header.
- Production refuses weak JWT or TOTP encryption keys.

## Authorization matrix

| Endpoint | Required access |
|---|---|
| `POST /api/users` | Public; always creates Student. |
| `GET /api/users` | Administrator. |
| `POST /api/admin/users` | Administrator + CSRF. |
| `PATCH /api/admin/users/:id` | Administrator + CSRF. |
| `GET /api/complaints` | Authenticated; results filtered by role/ownership. |
| `GET /api/complaints/:id` | Authenticated + object access. |
| `POST /api/complaints` | Student or Administrator + CSRF. |
| `PATCH /api/complaints/:id` | Role-specific object permission + CSRF. |
| `PATCH /api/auth/profile` | Same authenticated user + CSRF. |
| TOTP settings | Same authenticated user + CSRF; disabling also requires a current TOTP code. |

Inaccessible complaint IDs return `404`, preventing record-existence disclosure.

## Role-specific complaint rules

- Students see only their own complaints and may cancel only their own pending complaint.
- Maintenance staff see only assigned complaints and may transition `Assigned → In Progress → Resolved` or add notes.
- Administrators see all complaints and may assign active maintenance staff or update workflow fields.

## Production configuration

- Generate independent random values of at least 32 characters for `JWT_SECRET` and `TOTP_ENCRYPTION_KEY`.
- Use HTTPS for `PUBLIC_ORIGIN` and every `CORS_ORIGIN`.
- Enable `TRUST_PROXY` only when a trusted proxy overwrites forwarded headers.
- Require MongoDB authentication and TLS; restrict database network access.
- Protect database backups and local JSON fallback files.
- Do not commit `.env` or `.env.local` files.
- Production disables demo seeding and refuses to start without MongoDB; keep `SEED_DEMO_DATA` limited to local development.
- Run dependency, secret, and container scanning in CI.

## Remaining operational improvements

No application can be guaranteed “100% secure.” Before a high-risk public deployment, add:

- A shared Redis rate limiter for multi-instance deployments.
- Server-side session records and immediate stolen-token revocation.
- Password reset/email delivery through a configured mail provider.
- TOTP recovery codes and optional recent-password confirmation for other sensitive account changes.
- Centralized security audit logs and monitoring alerts.
- Managed private image-upload storage with file-signature validation and malware scanning.
- Independent penetration testing and dependency advisory scanning.

## Tests

`npm test` in `Backend` covers CSRF/session binding, TOTP challenge separation, public-role injection, admin authorization, profile field isolation, complaint ownership, staff assignment boundaries, workflow transitions, body hardening, and TOTP encryption.
