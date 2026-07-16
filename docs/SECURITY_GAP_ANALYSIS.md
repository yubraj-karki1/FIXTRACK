# FixTrack — Security Gap Analysis (Phase 1)

Audit date: 2026-07-16
Scope: `Backend/src/**`, `Frontend/src/**`, repo root config, `SECURITY.md`.

This document is the required Phase 1 deliverable: a full inventory of what FixTrack already
does, what is missing relative to the coursework brief, and the priority order for closing each
gap in Phases 2–8. **No functional code changes are included in this document** — it is audit
output only, per the "complete the audit before making major changes" rule.

## How to read this table

- **Current status**: `Implemented`, `Partial`, or `Missing`.
- **Priority**: `P0` (fix before anything else touches this area — active vulnerability or
  hard requirement completely absent), `P1` (required by the brief, not yet done), `P2`
  (hardening / nice-to-have, lower blast radius).

---

## 1. Authentication and JWT/session architecture

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| Server-signed session token, HttpOnly cookie only | Implemented | `Backend/src/services/session.service.ts`, `Backend/src/config/session.config.ts` | — | — | — |
| JWT validates algorithm, issuer, audience, purpose, expiry, jti | Implemented | `Backend/src/services/jwt-verification.service.ts:20-39` | — | — | — |
| Bearer-token fallback is opt-in and off by default | Implemented | `Backend/src/services/token-source.service.ts:37-46`, `Backend/src/config/index.ts:44` | Low — only relevant if an operator enables `ALLOW_BEARER_FALLBACK` | Document that this must stay `false` unless a non-browser client needs it | P2 |
| **Session invalidation on password change/reset/role change/MFA disable** | **Missing** | `Backend/src/services/auth.service.ts` (`resetPassword`, `changePasswordAfterExpiry`), `Backend/src/services/totp.service.ts` (`disable`), `Backend/src/services/user.service.ts` (`adminUpdateUser`) | The session JWT is stateless with no revocation list or token-version claim. If an account is compromised, a legitimate password reset or an admin role change does **not** invalidate an attacker's already-issued session cookie — it stays valid for up to `JWT_EXPIRES_IN_SECONDS` (8h default) after the owner "secures" the account. Same for TOTP disable: an attacker who disabled MFA on a hijacked session keeps using that session. | Add a `sessionVersion` (or `tokenValidAfter` timestamp) field to `User`, stamp it into new session JWTs, and check it in `verifyAndLoadActiveUser`. Bump the version on password change/reset, role change, and MFA disable so old tokens fail verification immediately. | **P0** |
| Rotate session identifier after authentication / privilege change | Missing (follows from above) | same as above | Same class of risk as above — no rotation happens today, e.g. an admin promoting a user to Administrator doesn't force that user's existing session to re-authenticate. | Same fix as above (version bump forces re-auth on next request) | P1 |
| Refresh-token rotation / reuse detection | N/A by design | — | Architecture uses one medium-lived access token, no refresh token. This is a defensible simplification, not a bug, given "preserve current architecture unless clearly necessary." | No change recommended — document the decision in `docs/SECURITY_GAP_ANALYSIS.md`/`SECURITY.md` rather than bolting on refresh tokens | P2 |
| Logout clears all auth cookies | Implemented | `Backend/src/services/session.service.ts:132-137` | — | — | — |

## 2. Cookie configuration

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| HttpOnly | Implemented | `Backend/src/services/session.service.ts:38` | — | — | — |
| Secure in production | Implemented | `Backend/src/config/session.config.ts:24-26` | — | — | — |
| SameSite | Implemented (`Lax`) | `Backend/src/config/session.config.ts:23` | — | — | — |
| Limited Max-Age | Implemented | `Backend/src/config/session.config.ts` (session 8h, TOTP-pending 5m, password-pending 10m) | — | — | — |
| Scoped Path | Implemented | `sessionCookiePath = '/'`, `pendingCookiePath = '/api/auth'` | — | — | — |

## 3. Password hashing and policy

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| bcrypt with adequate cost factor | Implemented (12 rounds) | `Backend/src/services/password.service.ts:3` | — | — | — |
| Never store/return plaintext or log passwords | Implemented | `jwt-verification.service.ts` and `user.service.ts` both strip `password` via `withoutPrivateFields` before any response | — | — | — |
| Password history (block reuse) | Implemented (last 5) | `Backend/src/services/password.service.ts:65-83` | — | — | — |
| Minimum length | **Partial** — current minimum is 8 | `Backend/src/services/password.service.ts:27`, `Backend/src/middlewares/validation.middleware.ts` (multiple schemas, `min: 8`) | Below the brief's required 12-char minimum | Raise `min` to 12 in `validatePasswordStrength` and every `isLength` rule for password fields | **P1** |
| Maximum length | **Partial/risk** — hard-capped at 20 | `password.service.ts:28`, validation schemas (`max: 20`) | A 20-character ceiling actively blocks legitimate long passphrases (a stronger practice than short complex passwords) and contradicts "a safe maximum" — 20 is too low, not too high | Raise max to something like 72 (bcrypt's effective input limit) or 128, keep server-side truncation-safe | P1 |
| Composition rules (upper/lower/number/special) | Implemented | `password.service.ts:29-32` | — | — | — |
| Reject password containing user's name/email | **Partial** — checks email only, not name | `password.service.ts:33-38` | A password containing the user's own name is currently allowed | Extend `validatePasswordStrength` to also reject passwords containing a normalized substring of `name` | P2 |
| Common-password deny-list | **Missing** | `password.service.ts` | Users can set common passwords like `Password123!` as long as they satisfy composition rules | Add a small deny-list check (e.g. top 1k common passwords via a bundled list or `zxcvbn`-style check) before accepting a new/changed password | P1 |
| Frontend strength feedback | Implemented | `Frontend/src/components/auth/PasswordStrengthFeedback.tsx` | — | — | — |
| Backend enforcement (cannot be bypassed by disabling JS) | Implemented | `validatePasswordStrength` runs server-side on register, reset, and expired-change paths | — | — | — |
| Password expiry with forced change | Implemented (90 days) | `password.service.ts:87-92`, `auth.controller.ts:24-33` | — | — | — |

## 4. TOTP / MFA

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| Secrets from a trusted library | Implemented (`otplib`) | `Backend/src/services/totp.service.ts:1,34` | — | — | — |
| QR code at setup | Implemented (`qrcode`) | `totp.service.ts:35-36` | — | — | — |
| OTP confirmation before enabling | Implemented — secret stored as `pendingTotpSecret` until `verifySetup` succeeds | `totp.service.ts:28-60` | — | — | — |
| Secrets encrypted at rest (AES-256-GCM) | Implemented | `Backend/src/services/secret-encryption.service.ts`, used for both `totpSecret`/`pendingTotpSecret` | — | — | — |
| Secrets never exposed via API | Implemented | Every response passes through `withoutTotpSecrets` / `withoutPrivateFields` | — | — | — |
| **Password confirmation before enabling/disabling MFA** | **Missing** | `Backend/src/controller/auth.controller.ts:100-111` (`disableTotp`), `verifyTotpSetup` | Disabling MFA today only requires a valid current TOTP code (`totpService.verifyLogin`), and enabling requires only the pending TOTP code — neither step re-confirms the account password. If a session is hijacked (XSS, stolen cookie) while the attacker also has a live authenticator (e.g. because they just enrolled it), they can toggle MFA without ever re-proving the password. | Add a `currentPassword` field to both the enable-confirmation and disable requests; verify it via `verifyPassword` before proceeding | **P1** |
| **Single-use recovery codes stored as hashes** | **Missing entirely** | `totp.service.ts`, `types/index.ts` (`User` has no recovery-code field) | Users who lose their authenticator have no account-recovery path other than an administrator manually disabling MFA — no self-service recovery, and nothing to test | Generate N (e.g. 10) random recovery codes at MFA enable time, show once, store only bcrypt hashes on `User.recoveryCodeHashes`; add a `POST /api/auth/totp/recover` verify-and-consume endpoint | **P1** |
| Rate limiting on MFA setup/verify/disable/recovery | **Partial** | `Backend/src/middlewares/rate-limit.middleware.ts:19-29` | `verify-setup` and `verify-login` are rate-limited, but **`POST /api/auth/totp/disable` has no rate-limit rule at all**. Since disable only requires a 6-digit code check via `totpService.verifyLogin`, an attacker holding a stolen session cookie can attempt unlimited TOTP guesses against `/api/auth/totp/disable` with no throttling. | Add `'POST /api/auth/totp/disable'` to `sensitiveRouteLimits`; also rate-limit the new recovery-code endpoint once built | **P0** |
| Logging of MFA enable/disable/failure/recovery use | **Partial** | `Backend/src/services/audit.service.ts`, `types/index.ts` (`AuditEventType`) | No `mfa.*` audit event types exist at all today — enabling, disabling, and failed TOTP attempts are currently unlogged | Add `mfa.enabled`, `mfa.disabled`, `mfa.verify_failed`, `mfa.recovery_used` audit types and call `auditService.record(...)` from `totp.service.ts` | P1 |

## 5. RBAC and ownership checks

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| Role/identity derived only from verified session | Implemented | `Backend/src/middlewares/auth.middleware.ts`, every controller receives `User` from `requireAuthenticatedUser`/`requireRole`, never from the body | — | — | — |
| Deny by default | Implemented | `routes/index.ts` falls through to `404` for unmatched routes; every mutating route calls `requireRole`/`requireAuthenticatedUser` before touching data | — | — | — |
| Public registration cannot self-assign role | Implemented | `Backend/src/services/user.service.ts:84-89` — role hardcoded to `'Student'`, request body role ignored even if `privilegedUserValidationSchema` fields leak through | — | — | — |
| Privileged account creation gated to Administrator + CSRF | Implemented | `routes/index.ts:100-109` | — | — | — |
| Ownership checks on complaints (IDOR protection) | Implemented | `Backend/src/services/complaint.service.ts:11-24` (`canAccessComplaint`), inaccessible IDs return `404` not `403` to avoid existence disclosure | — | — | — |
| Admin cannot self-promote/self-demote/self-deactivate | Implemented | `Backend/src/services/user.service.ts:115-117` | — | — | — |
| Field-level allow-list for profile updates | Implemented | `UpdateProfileDto` (`name`, `phone`, `building`, `room` only) enforced in `updateProfileValidationSchema` and `userService.updateProfile` | — | — | — |
| Staff cannot manage users/roles | Implemented | No staff-reachable route touches `userService`/`adminUpdateUser` | — | — | — |
| Integration tests per role/endpoint | **Partial** | `Backend/src/routes/*.test.ts` | Good coverage for registration, CSRF, complaint ownership; **no tests** for admin user list/detail authorization, `adminUpdateUser` self-protection, or MFA-route ownership (`assertCurrentUser`) | Add role-matrix integration tests (see §12) | P1 |

## 6. Login rate limiting and account lockout

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| Rate limiting on login/registration/reset/OTP | Implemented (IP-based, in-memory) | `Backend/src/middlewares/rate-limit.middleware.ts:19-29` | — | — | — |
| 429 on limit exceeded | Implemented | `rate-limit.middleware.ts:60-65` | — | — | — |
| Account lockout after repeated failures | Implemented (5 attempts → 15 min) | `Backend/src/services/auth.service.ts:22-23,66-101` | — | — | — |
| Reset failed-attempt counter on success | Implemented | `auth.service.ts:111-115` | — | — | — |
| No account-existence disclosure | Implemented | Generic "Invalid email or password" on login; identical forgot-password response regardless of account existence | — | — | — |
| Lockout events logged | Implemented | `auth.service.ts:78-83` (`user.account_locked`) | — | — | — |
| **Redis-backed limiter for multi-instance deployments** | **Missing** | `rate-limit.middleware.ts:16` (`new Map<string, RateLimitBucket>()`, module-scoped, per-process) | If FixTrack is ever deployed with more than one backend instance/replica, each instance has its own independent counters, so the effective limit is `maxRequests × instanceCount` — rate limiting is silently much weaker than configured | Introduce a pluggable store: keep the in-memory `Map` for local/single-instance dev, add a Redis-backed implementation selected by an env var (`REDIS_URL`) for production | P1 |
| Increasing/reasonable lockout duration | **Partial** — fixed 15 min, does not escalate on repeated lockouts | `auth.service.ts:23` | Low risk today (15 min is reasonable), but repeated lockout cycles from a persistent attacker aren't penalized more heavily | Optionally track lockout count and scale duration (e.g. 15m → 1h → 24h) | P2 |
| Tests for rate limiting/lockout | **Missing** | no test file exercises `rate-limit.middleware.ts` or the lockout branch of `auth.service.ts` | Regressions here would be undetected | Add unit tests for the limiter and an integration test for the 5-strikes lockout flow | P1 |

## 7. CAPTCHA

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| CAPTCHA after suspicious activity | **Missing entirely** | n/a | No secondary friction after repeated failures beyond the existing lockout; acceptable for coursework scope, but the brief explicitly asks for it | Add a `captchaService` that verifies a token server-side (Turnstile/hCaptcha/reCAPTCHA) via `CAPTCHA_SECRET_KEY`; trigger requirement once an IP/account crosses a failed-attempt threshold; provide a `CAPTCHA_PROVIDER=none` dev bypass and a mock for tests | P1 |

## 8. User profile security

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| Users access/update only their own profile | Implemented | `routes/index.ts:194-202` binds `PATCH /api/auth/profile` to `requireAuthenticatedUser(request).id`, never a body-supplied id | — | — | — |
| Admin uses separate protected endpoints | Implemented | `/api/admin/users*` routes, `requireRole(request, 'Administrator')` | — | — | — |
| Mass-assignment protection | Implemented | `UpdateProfileDto`/`AdminUpdateUserDto` are narrow allow-lists; `validateRequest` + `mongoSanitize` reject unexpected/operator keys | — | — | — |
| Sensitive fields never editable by owner (role, lock status, password hash, MFA secret) | Implemented | Same allow-list; `updateProfile` only ever writes `name/phone/building/room` | — | — | — |

## 9. Data export / import

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| Self-service personal data export (own profile + complaints, JSON/CSV) | **Missing** | n/a | No endpoint exists | Add `GET /api/users/me/export?format=json|csv`, populated from the current user's profile (minus hashes/secrets/tokens) and their own complaints only; rate-limit and audit-log it | P1 |
| Administrator reference-data import (rooms/buildings/categories) | **Missing** | n/a | No endpoint exists; there is currently no "reference data" model at all — buildings/rooms/categories are free-text or inline enums (`complaintTextFields.category` in `validation.middleware.ts:285-291`) | Only build this if/when reference data becomes a real entity; if implemented, gate to Administrator, validate file type/size/columns, strip formula-injection prefixes (`=,+,-,@`), use a DB transaction with rollback, and never accept role/password/MFA columns | P2 (build only if the coursework wants the full CRUD reference-data model; otherwise document as intentionally out of scope) |

## 10. Activity logging

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| Registration, login success/failure, lockout | Implemented | `auth.service.ts`, `user.service.ts` | — | — | — |
| Logout | **Missing** | `auth.controller.ts:166-174` (`logout`) doesn't call `auditService.record` | Minor — logout is a low-risk event, but the brief lists it explicitly | Add a `user.logout` audit call in the logout controller | P2 |
| Password change/reset | Implemented | `auth.service.ts:204-209,238-243` | — | — | — |
| MFA changes | **Missing** (see §4) | `totp.service.ts` | — | see §4 | P1 |
| Profile update | **Missing** | `user.service.ts:103-112` (`updateProfile`) records nothing | Profile edits (including phone/room/building, which affect where staff are dispatched) leave no trail | Add a `user.profile_updated` audit event | P2 |
| Complaint created/assigned/status changed | Implemented | `complaint.service.ts:88-93,160-168` | — | — | — |
| Role changes | Implemented | `user.service.ts:129-131` | — | — | — |
| Data import/export | N/A yet | — | Add once §9 is built | — | — |
| Safe IP/user-agent metadata on events | **Missing** | `types/index.ts:84-93` (`AuditEvent` has no `ip`/`userAgent` fields), `audit.service.ts` | Investigating an incident (e.g. "was this login from the usual location?") is harder without IP/UA context | Add optional `ip`/`userAgent` fields to `AuditEvent`, populate from the request in controllers that already have it, truncate/hash if storing raw IP is a privacy concern | P1 |
| Never log secrets | Implemented | Audit messages are hand-built strings that never include password/OTP/token values | — | — | — |

## 11. Accessibility (WCAG 2.2 AA) — preliminary scan

Full findings will land in `docs/ACCESSIBILITY_TEST_REPORT.md` (Phase 7); this is a first pass.

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| No clickable `div`s used as buttons | Implemented | grep found zero `<div onClick>` patterns in `Frontend/src` | — | — | — |
| Images have alt text | Implemented | `Frontend/src/components/FixTrackScreens.tsx:765,1453` | — | — | — |
| `<html lang>` set | Implemented | `Frontend/src/app/layout.tsx:12` | — | — | — |
| Skip-navigation link | **Missing** | no match for "skip" anywhere in `Frontend/src` | Keyboard/screen-reader users must tab through the full nav on every page | Add a visually-hidden "Skip to main content" link as the first focusable element in `layout.tsx` | P1 |
| `aria-*`/`role`/`<label>` density | **Low, needs review** | Only 24 occurrences total across the entire frontend; `Frontend/src/components/FixTrackScreens.tsx` is a 1707-line monolith carrying most of the app's screens | Forms, dashboards, and modals likely have unlabeled inputs and no `aria-live` announcements for async state (toasts, loading, errors) | Full manual + automated (axe) pass in Phase 7; likely needs `aria-describedby` on validation errors, `aria-live="polite"` on the existing toast (`FixTrackContext.tsx:206-209` already uses `role="status"`, which is good, but form-level errors likely aren't wired the same way) | P1 |
| Automated accessibility tests | **Missing** | `Frontend/tests/` does not exist | No regression protection | Add `@axe-core/playwright` or `jest-axe` smoke tests for the key pages (login, register, dashboard, complaint form, admin) | P1 |

## 12. Docker and CI/CD

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| Dockerfiles (frontend/backend) | **Missing entirely** | no `Dockerfile` anywhere in the repo | No reproducible container build exists | Author multi-stage, non-root Dockerfiles per Phase 8 | P1 |
| `docker-compose.yml` | **Missing** | — | No one-command local stack (backend + frontend + Mongo) | Author `docker-compose.yml` | P1 |
| `.dockerignore` | **Missing** | — | Risk of accidentally copying `.env`/`node_modules` into an image once Dockerfiles exist | Add alongside the Dockerfiles | P1 |
| GitHub Actions / CI pipeline | **Missing entirely** | no `.github/workflows/` directory | Tests, lint, and typecheck are not enforced automatically on push/PR | Add a CI workflow running `npm test`, `tsc --noEmit`, and `next build` for both packages | P1 |

## 13. Existing tests and identified vulnerabilities summary

| Area | Status | Files |
|---|---|---|
| CSRF/session binding | Covered | `Backend/src/routes/csrf.integration.test.ts` (140 lines) |
| Registration/role-injection/profile field isolation | Covered | `Backend/src/routes/registration.authorization.test.ts` (200 lines) |
| Complaint ownership/assignment/status transitions | Covered | `Backend/src/routes/complaint.authorization.test.ts` (164 lines) |
| Body hardening (content-type, size, malformed JSON) + TOTP encryption round-trip | Covered | `Backend/src/routes/security.hardening.test.ts` (32 lines) |
| Rate limiting / lockout | **Not covered** | — |
| TOTP setup/verify/disable happy-path and failure-path | **Not covered** | — |
| Password history/expiry/strength | **Not covered** | — |
| Encryption tamper cases (modified ciphertext/tag/wrong key/invalid format) | **Not covered** | — |
| Frontend accessibility | **Not covered** | — |

### Vulnerabilities found (ranked)

1. **P0 — No rate limit on `POST /api/auth/totp/disable`.** A hijacked session can brute-force
   the 6-digit disable code with no throttling. (§4)
2. **P0 — No session invalidation on password change/reset, role change, or MFA disable.** A
   stolen session cookie survives the account-recovery actions meant to shut it out, for up to
   8 hours. (§1)
3. **P1 — Password max length (20) is too restrictive** and minimum (8) is below the 12-char
   requirement. (§3)
4. **P1 — No MFA password confirmation, no recovery codes.** (§4)
5. **P1 — In-memory rate limiter won't scale past one backend instance.** (§6)
6. **P1 — No CAPTCHA layer.** (§7)
7. **P1 — No self-service data export.** (§9)
8. **P1 — Sparse activity logging** (no logout, MFA, or profile-update events; no IP/UA metadata). (§10)
9. **P1 — No accessibility automation, no skip link.** (§11)
10. **P1 — No Docker or CI/CD.** (§12)

### What NOT to touch

The following are already correctly implemented and should be preserved as-is per the "don't
duplicate correctly implemented features" rule: JWT/cookie session architecture, CSRF
double-token binding, CORS allow-list, Helmet CSP headers, bcrypt password hashing, password
history, complaint ownership/IDOR protections, public-registration role safety, admin
self-protection guards, and the existing integration test suite.

---

## Next steps (Phase 2 onward)

This document is the baseline. Proposed execution order, most critical first:

1. Fix the two P0 items (TOTP-disable rate limit, session invalidation on sensitive changes) —
   these are active weaknesses in a shipped security control, not missing features.
2. Phase 3 password policy + MFA hardening (password confirmation, recovery codes, deny-list,
   length bounds).
3. Phase 5 session/CSRF test coverage for the new invalidation behavior.
4. Phase 4 RBAC matrix doc + missing role-matrix tests.
5. Phase 6 encryption doc + tamper tests (mechanism already solid, mostly documentation +
   tests).
6. Phase 2 activity-logging completeness (logout, MFA, profile update, IP/UA).
7. Phase 2 personal-data export (skip import unless reference-data entities are wanted).
8. Phase 7 accessibility pass + axe tests.
9. Phase 8 Docker/CI.
