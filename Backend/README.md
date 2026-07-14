# FixTrack Backend

TypeScript API for FixTrack authentication, users, profiles, and role-authorized complaint workflows.

## Structure

- `config/` - runtime configuration.
- `controller/` - HTTP response handlers.
- `data/` - local JSON persistence and development seeds.
- `database/` - MongoDB/local persistence adapter.
- `dtos/` - request payload types.
- `errors/` - reusable API errors.
- `middlewares/` - HTTP middleware helpers.
- `model/` - domain models.
- `repositories/` - data access.
- `routes/` - URL routing.
- `services/` - business logic.
- `types/` - shared API types.

## Run

```bash
npm run dev
```

API runs on `http://localhost:4000`.

## Test and production build

```bash
npm test
npm run build
npm start
```
