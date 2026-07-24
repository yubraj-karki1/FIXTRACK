# FixTrack — Security Gap Analysis (Phase 1)

Audit date: 2026-07-16 (updated 2026-07-24 — see note below)
Scope: `Backend/src/**`, `Frontend/src/**`, repo root config, `SECURITY.md`.

This document is the required Phase 1 deliverable: a full inventory of what FixTrack already
does, what is missing relative to the coursework brief, and the priority order for closing each
gap in Phases 2–8. **No functional code changes are included in this document** — it is audit
output only, per the "complete the audit before making major changes" rule.

> **2026-07-24 update:** every P0 item and nearly every P1/P2 item below has since been
> implemented (see `SECURITY.md` for the current, accurate summary). The two remaining gaps are
> CAPTCHA and a Redis-backed rate-limit store, both left as documented, intentional decisions
> (§6, §7) rather than oversights — each needs external infrastructure (a CAPTCHA provider
> account, a Redis instance) that doesn't exist for this deployment yet. This document is kept
> as-is below for its audit-trail value; row statuses were updated in place rather than rewritten.

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
| **Session invalidation on password change/reset/role change/MFA disable** | **Implemented** (doc was stale) | `Backend/src/types/index.ts` (`User.sessionVersion`), `Backend/src/services/auth.service.ts`, `Backend/src/services/totp.service.ts`, `Backend/src/services/user.service.ts`, `Backend/src/services/jwt-verification.service.ts:72` | — | — | — |
| Rotate session identifier after authentication / privilege change | Implemented (follows from above) | same as above | — | — | — |
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
| Minimum length | Implemented — 12 | `Backend/src/services/password.service.ts`, `Backend/src/middlewares/validation.middleware.ts` (`min: 12`) | — | — | — |
| Maximum length | Implemented — 128 | `password.service.ts`, validation schemas (`max: 128`) | — | — | — |
| Composition rules (upper/lower/number/special) | Implemented | `password.service.ts` | — | — | — |
| Reject password containing user's name/email | Implemented — checks each name part and the email | `password.service.ts` | — | — | — |
| Common-password deny-list | Implemented — bundled list, checked with punctuation stripped too | `password.service.ts`, `common-passwords.ts` | — | — | — |
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
| **Password confirmation before enabling/disabling MFA** | **Implemented** | `Backend/src/services/totp.service.ts` (`assertCorrectPassword`, used by `verifySetup` and `disable`), `Backend/src/controller/auth.controller.ts` | — | — | — |
| **Single-use recovery codes stored as hashes** | **Implemented** | `totp.service.ts` (`generateRecoveryCodes`, `verifyRecoveryCode`), `types/index.ts` (`User.recoveryCodeHashes`), `POST /api/auth/totp/recover` | — | — | — |
| Rate limiting on MFA setup/verify/disable/recovery | Implemented (doc was stale on `disable`) | `Backend/src/middlewares/rate-limit.middleware.ts` | — | — | — |
| Logging of MFA enable/disable/failure/recovery use | Implemented | `Backend/src/services/audit.service.ts`, `types/index.ts` (`mfa.enabled` / `mfa.disabled` / `mfa.verify_failed` / `mfa.recovery_used`), `totp.service.ts` | — | — | — |

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
| **Redis-backed limiter for multi-instance deployments** | **Missing — intentionally deferred** | `rate-limit.middleware.ts:16` (`new Map<string, RateLimitBucket>()`, module-scoped, per-process) | If FixTrack is ever deployed with more than one backend instance/replica, each instance has its own independent counters, so the effective limit is `maxRequests × instanceCount` — rate limiting is silently much weaker than configured. Not yet a real gap: today's deployment is single-instance (see `docker-compose.yml`), so there's no Redis server to build or test against. | Introduce a pluggable store: keep the in-memory `Map` for local/single-instance dev, add a Redis-backed implementation selected by an env var (`REDIS_URL`) once a multi-instance deployment is actually planned | P1 (until multi-instance is real) |
| Increasing/reasonable lockout duration | **Partial** — fixed 15 min, does not escalate on repeated lockouts | `auth.service.ts:23` | Low risk today (15 min is reasonable), but repeated lockout cycles from a persistent attacker aren't penalized more heavily | Optionally track lockout count and scale duration (e.g. 15m → 1h → 24h) | P2 |
| Tests for rate limiting/lockout | **Missing** | no test file exercises `rate-limit.middleware.ts` or the lockout branch of `auth.service.ts` | Regressions here would be undetected | Add unit tests for the limiter and an integration test for the 5-strikes lockout flow | P1 |

## 7. CAPTCHA

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| CAPTCHA after suspicious activity | **Missing — intentionally deferred** | n/a | No secondary friction after repeated failures beyond the existing lockout (which now escalates 15m → 1h → 24h); acceptable for coursework scope, but the brief explicitly asks for it. Deliberately not built as a code stub: a `CAPTCHA_PROVIDER=none` gate that can never actually block anyone is a half-finished feature, and there's no provider account (Turnstile/hCaptcha/reCAPTCHA) to test against yet. | Once a provider account exists: add a `captchaService` that verifies a token server-side via `CAPTCHA_SECRET_KEY`, trigger the requirement once an IP/account crosses a failed-attempt threshold, and add the widget to the login/forgot-password forms | P1 (once a provider is chosen) |

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
| Self-service personal data export (own profile + complaints, JSON/CSV) | **Implemented** | `Backend/src/controller/user.controller.ts` (`exportData`), `Backend/src/services/user.service.ts` (`exportUserData`), `GET /api/users/me/export?format=json\|csv` | — | — | — |
| Administrator reference-data import (rooms/buildings/categories) | **Missing** | n/a | No endpoint exists; there is currently no "reference data" model at all — buildings/rooms/categories are free-text or inline enums (`complaintTextFields.category` in `validation.middleware.ts:285-291`) | Only build this if/when reference data becomes a real entity; if implemented, gate to Administrator, validate file type/size/columns, strip formula-injection prefixes (`=,+,-,@`), use a DB transaction with rollback, and never accept role/password/MFA columns | P2 (build only if the coursework wants the full CRUD reference-data model; otherwise document as intentionally out of scope) |

## 10. Activity logging

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| Registration, login success/failure, lockout | Implemented | `auth.service.ts`, `user.service.ts` | — | — | — |
| Logout | Implemented | `auth.controller.ts` (`logout` now best-effort reads the session and records `user.logout` before clearing cookies) | — | — | — |
| Password change/reset | Implemented | `auth.service.ts` | — | — | — |
| MFA changes | Implemented (see §4) | `totp.service.ts` | — | — | — |
| Profile update | Implemented | `user.service.ts` (`updateProfile` records `user.profile_updated`) | — | — | — |
| Complaint created/assigned/status changed | Implemented | `complaint.service.ts` | — | — | — |
| Role changes | Implemented | `user.service.ts` | — | — | — |
| Data export | Implemented (see §9) — records `user.data_exported` | `user.service.ts` (`exportUserData`) | Import was scoped out as N/A in the original audit (no reference-data entity model exists) and remains out of scope | — | — |
| Safe IP/user-agent metadata on events | Implemented — via the existing `metadata` bag, not a schema change | `audit.service.ts` (`AuditContext` type), `auth.controller.ts`/`user.controller.ts` (`requestContext` helper, matching the pre-existing pattern in `upload.service.ts`) | — | — | — |
| Never log secrets | Implemented | Audit messages are hand-built strings that never include password/OTP/token values | — | — | — |

## 11. Accessibility (WCAG 2.2 AA) — preliminary scan

Full findings will land in `docs/ACCESSIBILITY_TEST_REPORT.md` (Phase 7); this is a first pass.

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| No clickable `div`s used as buttons | Implemented | grep found zero `<div onClick>` patterns in `Frontend/src` | — | — | — |
| Images have alt text | Implemented | `Frontend/src/components/FixTrackScreens.tsx:765,1453` | — | — | — |
| `<html lang>` set | Implemented | `Frontend/src/app/layout.tsx:12` | — | — | — |
| Skip-navigation link | **Implemented** | `Frontend/src/app/layout.tsx` (`.skip-link`, targets `#main-content` on every page shell) | — | — | — |
| `aria-*`/`role`/`<label>` density | **Low, needs review** | Only 24 occurrences total across the entire frontend; `Frontend/src/components/FixTrackScreens.tsx` is a 1707-line monolith carrying most of the app's screens | Forms, dashboards, and modals likely have unlabeled inputs and no `aria-live` announcements for async state (toasts, loading, errors) | Full manual + automated (axe) pass in Phase 7; likely needs `aria-describedby` on validation errors, `aria-live="polite"` on the existing toast (`FixTrackContext.tsx:206-209` already uses `role="status"`, which is good, but form-level errors likely aren't wired the same way) | P1 |
| Automated accessibility tests | **Missing** | `Frontend/tests/` does not exist | No regression protection | Add `@axe-core/playwright` or `jest-axe` smoke tests for the key pages (login, register, dashboard, complaint form, admin) | P1 |

## 12. Docker and CI/CD

| Requirement | Status | Relevant files | Security risk | Recommended fix | Priority |
|---|---|---|---|---|---|
| Dockerfiles (frontend/backend) | **Implemented** | `Backend/Dockerfile`, `Frontend/Dockerfile` — multi-stage, non-root runtime user in both | — | — | — |
| `docker-compose.yml` | **Implemented** | repo root `docker-compose.yml` (backend + frontend + Mongo, named volumes) | — | — | — |
| `.dockerignore` | **Implemented** | `Backend/.dockerignore`, `Frontend/.dockerignore` | — | — | — |
| GitHub Actions / CI pipeline | **Implemented** | `.github/workflows/ci.yml` — backend `npm ci`/`build`/`test`, frontend `npm ci`/`build`, on push/PR to `main` | — | — | — |

## 13. Existing tests and identified vulnerabilities summary

| Area | Status | Files |
|---|---|---|
| CSRF/session binding | Covered | `Backend/src/routes/csrf.integration.test.ts` (140 lines) |
| Registration/role-injection/profile field isolation | Covered | `Backend/src/routes/registration.authorization.test.ts` (200 lines) |
| Complaint ownership/assignment/status transitions | Covered | `Backend/src/routes/complaint.authorization.test.ts` (164 lines) |
| Body hardening (content-type, size, malformed JSON) + TOTP encryption round-trip | Covered | `Backend/src/routes/security.hardening.test.ts` (32 lines) |
| Session invalidation (password/role/MFA-disable) + TOTP-disable rate limit | Covered | `Backend/src/routes/session-invalidation.test.ts` |
| Password length/common-password/name policy + MFA password confirmation + recovery-code single-use | Covered | `Backend/src/routes/password-and-mfa-security.test.ts` |
| Rate limiting / lockout (general, beyond the TOTP-disable case above) | **Not covered** | — |
| Encryption tamper cases (modified ciphertext/tag/wrong key/invalid format) | **Not covered** | — |
| Frontend accessibility | **Not covered** | — |

### Vulnerabilities found (ranked) — status as of 2026-07-24

1. ~~P0 — No rate limit on `POST /api/auth/totp/disable`.~~ **Fixed.** (§4)
2. ~~P0 — No session invalidation on password change/reset, role change, or MFA disable.~~
   **Fixed.** (§1)
3. ~~P1 — Password max length (20) too restrictive, minimum (8) below the 12-char requirement.~~
   **Fixed** — now 12-128, plus name/common-password checks. (§3)
4. ~~P1 — No MFA password confirmation, no recovery codes.~~ **Fixed.** (§4)
5. **P1 — In-memory rate limiter won't scale past one backend instance.** Still open —
   intentionally deferred, no multi-instance deployment exists yet. (§6)
6. **P1 — No CAPTCHA layer.** Still open — intentionally deferred, no provider account exists
   yet. (§7)
7. ~~P1 — No self-service data export.~~ **Fixed.** (§9)
8. ~~P1 — Sparse activity logging (no logout, MFA, or profile-update events; no IP/UA metadata).~~
   **Fixed.** (§10)
9. **P1 — No accessibility automation.** Partially fixed — skip link added; aria-labeling
   density and automated axe tests remain open. (§11)
10. ~~P1 — No Docker or CI/CD.~~ **Fixed.** (§12)

### What NOT to touch

The following are already correctly implemented and should be preserved as-is per the "don't
duplicate correctly implemented features" rule: JWT/cookie session architecture, CSRF
double-token binding, CORS allow-list, Helmet CSP headers, bcrypt password hashing, password
history, complaint ownership/IDOR protections, public-registration role safety, admin
self-protection guards, the existing integration test suite, `sessionVersion`-based session
invalidation, MFA password-confirmation + single-use recovery codes, the escalating lockout
duration, self-service data export, and the audit-logging/IP-UA metadata pattern.

---

## Next steps (Phase 2 onward)

Original baseline plan preserved below for history. As of 2026-07-24, items 1–2, 6, and 9 are
done; remaining open work is the RBAC test-matrix doc, encryption tamper tests, and the full
accessibility pass (item 8 partially done — skip link only).

1. ~~Fix the two P0 items (TOTP-disable rate limit, session invalidation on sensitive changes).~~
2. ~~Phase 3 password policy + MFA hardening (password confirmation, recovery codes, deny-list,
   length bounds).~~
3. Phase 5 session/CSRF test coverage for the new invalidation behavior — done for the
   invalidation paths (`session-invalidation.test.ts`); still missing a general role-matrix
   authorization sweep (item 4).
4. Phase 4 RBAC matrix doc + missing role-matrix tests — **still open**.
5. Phase 6 encryption doc + tamper tests — **still open**.
6. ~~Phase 2 activity-logging completeness (logout, MFA, profile update, IP/UA).~~
7. ~~Phase 2 personal-data export.~~ (Import remains out of scope — no reference-data entity
   model exists to import into.)
8. Phase 7 accessibility pass + axe tests — **partially done** (skip link only; aria density and
   automated axe tests still open).
9. ~~Phase 8 Docker/CI.~~
