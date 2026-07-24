# FixTrack

FixTrack is a full-stack hostel maintenance complaint system with role-based workflows for students, maintenance staff, and administrators.

## Working features

- Student registration with server-enforced `Student` role.
- Email/password login using bcrypt password hashes, with escalating lockout after repeated failures.
- Optional TOTP authenticator two-factor authentication, gated by the account password on enable/disable, with single-use recovery codes for lost-authenticator recovery.
- Signed JWT sessions in HttpOnly cookies, session-bound CSRF protection, and immediate session invalidation on password reset/change, role change, or MFA disable.
- Persistent complaints using MongoDB or the local JSON fallback.
- Student complaint submission, listing, detail view, and pending cancellation.
- Maintenance assignment filtering, status transitions, and repair notes.
- Administrator complaint assignment, priority/status management, user creation, role changes, and activation controls.
- Persisted user profile updates and self-service personal data export (JSON/CSV).
- Server-side ownership and role authorization on every protected API workflow.
- Input validation, XSS/NoSQL sanitization, request-size limits, rate limiting, CORS, HTTPS enforcement, and security headers.
- Activity logging across auth, MFA, profile, complaint, and upload events, with IP/user-agent metadata.
- Backend integration/security test suite (35 tests) and a CI workflow running it on every push/PR.
- Docker/`docker-compose` for a one-command local stack (backend + frontend + MongoDB).

## Roles

| Role | Access |
|---|---|
| Student | Own complaints, profile, and personal 2FA settings. |
| Maintenance Staff | Complaints assigned to their user ID, repair notes, and controlled status transitions. |
| Administrator | All complaints, assignments, priorities, statuses, users, and privileged account creation. |

## Local development

Requirements: Node.js, npm, and optionally MongoDB.

### Backend

```powershell
cd Backend
Copy-Item .env.example .env
npm install
npm run dev
```

The API runs on `http://localhost:4000` by default. Without `MONGODB_URI`, users and complaints persist in `Backend/data/*.json`.

### Frontend

```powershell
cd Frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

The web application runs on `http://localhost:3000`.

### Docker (alternative to the two steps above)

```powershell
docker compose up --build
```

Runs the backend, frontend, and MongoDB together with dev-only default secrets (see
`docker-compose.yml`). Override `JWT_SECRET`/`TOTP_ENCRYPTION_KEY` via a root `.env` file before
using this for anything beyond a local machine.

## Verification

```powershell
cd Backend
npm test
npm run build

cd ../Frontend
npm run build
```

## Production

Build and start the backend:

```powershell
cd Backend
npm run build
npm start
```

Build and start the frontend:

```powershell
cd Frontend
npm run build
npm start
```

Before production, configure unique `JWT_SECRET` and `TOTP_ENCRYPTION_KEY` values, an HTTPS `PUBLIC_ORIGIN`, exact HTTPS `CORS_ORIGIN` values, trusted proxy/TLS settings, and a secured MongoDB connection. Production disables demo seeding and refuses to start without MongoDB.

See [SECURITY.md](SECURITY.md) for the security model and remaining operational considerations.
