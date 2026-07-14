# FixTrack

FixTrack is a full-stack hostel maintenance complaint system with role-based workflows for students, maintenance staff, and administrators.

## Working features

- Student registration with server-enforced `Student` role.
- Email/password login using bcrypt password hashes.
- Optional TOTP authenticator two-factor authentication.
- Signed JWT sessions in HttpOnly cookies and session-bound CSRF protection.
- Persistent complaints using MongoDB or the local JSON fallback.
- Student complaint submission, listing, detail view, and pending cancellation.
- Maintenance assignment filtering, status transitions, and repair notes.
- Administrator complaint assignment, priority/status management, user creation, role changes, and activation controls.
- Persisted user profile updates.
- Server-side ownership and role authorization on every protected API workflow.
- Input validation, XSS/NoSQL sanitization, request-size limits, rate limiting, CORS, HTTPS enforcement, and security headers.
- Nineteen backend integration/security tests.

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
