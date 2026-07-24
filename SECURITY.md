# FixTrack Security Notes

## Implemented controls

- Public registration always persists `role: 'Student'`; request-supplied roles are ignored.
- Privileged accounts use `POST /api/admin/users`, which requires a full session, CSRF token, and `Administrator` role.
- Complaint access is filtered on the backend using immutable `studentUserId` and `staffUserId` ownership fields.
- Passwords use bcrypt with 12 rounds and a server-enforced policy: 12-128 characters, upper/lower/number/special character, and rejection of passwords containing the account's email, name, or a common/breached password.
- Accounts lock after 5 failed logins, with escalating lockout duration on repeated lockouts (15 minutes, then 1 hour, then 24 hours).
- A `sessionVersion` claim is bumped on password reset/change, role change, and MFA disable, so any session token issued before that point - including a stolen one - stops working immediately instead of surviving out to the full session lifetime.
- JWTs validate algorithm, issuer, audience, purpose, expiry, and a unique token ID.
- Session and pending-TOTP JWTs use HttpOnly, SameSite cookies and production `Secure` cookies.
- TOTP enrollment secrets use AES-256-GCM authenticated encryption at rest; enabling or disabling MFA requires the account password in addition to a valid TOTP code.
- Ten single-use recovery codes (bcrypt-hashed at rest) are issued once when MFA is enabled, for account recovery if the authenticator is lost.
- Unsafe authenticated requests require signed CSRF tokens bound to the current session.
- Credentialed CORS uses an exact origin allow-list; unsafe browser requests also validate `Origin`.
- Request bodies are limited to 128 KiB and must contain valid JSON with `application/json`.
- Validation sanitizes strings and rejects MongoDB operator-style keys.
- Sensitive user fields are removed from responses.
- Rate limits protect login, registration, and TOTP verification (including the disable and recovery-code routes); forwarded IPs are trusted only behind a configured proxy.
- Backend Helmet headers and frontend CSP/frame/MIME/referrer/permissions headers are configured.
- Production HTTPS redirects use configured `PUBLIC_ORIGIN`, not an untrusted Host header.
- Production refuses weak JWT or TOTP encryption keys.
- Activity logging covers login/logout, lockouts, password and profile changes, MFA enable/disable/failure/recovery, role/status changes, complaint lifecycle events, uploads, and personal-data exports, with IP/user-agent metadata attached where the request context is available.
- Authenticated users can self-service export their own profile and complaints as JSON or CSV via `GET /api/users/me/export`.

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
| `GET /api/users/me/export` | Same authenticated user only - always the caller's own data. |
| TOTP settings | Same authenticated user + CSRF; enabling/disabling also requires the account password, and disabling additionally requires a current TOTP code. |
| `POST /api/auth/totp/recover` | Pending-TOTP challenge cookie only (pre-session); code is single-use. |

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

- **CAPTCHA after repeated failed attempts.** Intentionally not built as an inert stub - it
  needs a real provider account (e.g. Cloudflare Turnstile) and site/secret keys before there's
  anything to verify. Add a `captchaService` and wire it into login/forgot-password once a
  provider is chosen.
- **A shared Redis rate limiter for multi-instance deployments.** The current limiter is an
  in-memory `Map`, correct for today's single-instance deployment; only becomes a gap once
  FixTrack runs more than one backend replica.
- Server-side session records and immediate stolen-token revocation (the `sessionVersion` bump
  covers the highest-risk cases - password reset/change, role change, MFA disable - but is not a
  general-purpose revocation list).
- Password reset/email delivery through a configured mail provider (currently Resend, optional).
- A full manual + automated (axe) accessibility pass; a skip-navigation link is in place but the
  rest of the WCAG 2.2 AA checklist (aria labeling density, form-error announcements) is not yet
  audited.
- Independent penetration testing and dependency advisory scanning.

## Local stack / CI

- `docker compose up` builds and runs the backend, frontend, and MongoDB together (see
  `docker-compose.yml`); both `Backend/Dockerfile` and `Frontend/Dockerfile` are multi-stage,
  non-root images.
- `.github/workflows/ci.yml` runs the backend test/build and frontend build on every push/PR to
  `main`.

## Tests

`npm test` in `Backend` covers CSRF/session binding, TOTP challenge separation, public-role injection, admin authorization, profile field isolation, complaint ownership, staff assignment boundaries, workflow transitions, body hardening, TOTP encryption, session invalidation, the 12-128 character/common-password/name password policy, and MFA password-confirmation and recovery-code flows.
