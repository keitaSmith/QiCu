# QiCu Development Seeds

These files define deterministic development seed data for the Drizzle/PostgreSQL schema.

They are development-only. The current QiCu app runtime still uses the existing in-memory stores under `src/data/` and `src/lib/`, so running these seeds does not change application behavior until a later repository/database persistence phase moves routes to PostgreSQL.

## Files

- `ids.ts`: stable UUID mappings from current human-readable demo IDs to database IDs.
- `demoPractitioners.ts`: database-ready demo practitioner rows.
- `demoPatients.ts`: database-ready demo patient rows with extracted columns and FHIR-like JSON.
- `demoServices.ts`: database-ready service rows.
- `demoBookings.ts`: database-ready booking rows with service snapshots.
- `demoSessions.ts`: database-ready session rows.
- `seedDev.ts`: safe, non-destructive development seed runner.

## Running

```bash
npm run db:seed
```

`DATABASE_URL` is required. The script loads local Next.js environment files, blocks `NODE_ENV=production`, and uses non-destructive inserts with `on conflict do nothing`.

No reset or truncate behavior is included. Do not add destructive reset behavior without explicit local-only protections.

## Guardrails

- Do not seed real Google tokens.
- Do not seed `oauth_states` by default.
- Keep test fixtures separate from development seeds.
- Keep runtime demo string IDs unchanged in the in-memory stores.
- Use deterministic UUIDs from `ids.ts` for database seed rows.
- `sessions.booking_id` is canonical for linked sessions.
- `bookings.session_id` is not seeded and should not exist in database seed rows.

