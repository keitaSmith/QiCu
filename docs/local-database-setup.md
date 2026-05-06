# QiCu Local Database Setup

## Summary

QiCu can run a local PostgreSQL development database with Docker Compose. This setup runs PostgreSQL only. It does not Dockerize the Next.js app and does not change app runtime persistence.

The app still uses in-memory stores until Phase D repository internals are migrated to Drizzle-backed persistence.

## Requirements

- Docker Desktop installed.
- Docker Desktop running before `npm run db:up`.
- A local `.env.local` with `DATABASE_URL` set for development database commands.

## Local Database URL

Use this local-only value in `.env.local`:

```env
DATABASE_URL=postgres://qicu:qicu_dev_password@localhost:5431/qicu_dev
```

Do not commit `.env.local`. It is ignored by Git.

## Start PostgreSQL

Open Docker Desktop and wait until Docker is running, then run:

```bash
npm run db:up
```

This starts the `qicu-postgres-dev` PostgreSQL container on local port `5431` with a persistent Docker volume.

## Run Migrations

After the database is running and `DATABASE_URL` is configured:

```bash
npm run db:migrate
```

This applies Drizzle migrations to the local development database.

## Check Connectivity

Run the non-destructive database check:

```bash
npm run db:check
```

The check verifies that `DATABASE_URL` is present, PostgreSQL accepts a connection, `SELECT 1` works, and expected migrated tables are present. It does not create, update, truncate, or delete data.

## Seed Development Data

After migrations pass:

```bash
npm run db:seed
```

The development seed script is non-destructive and uses deterministic IDs with `on conflict do nothing`. It is for local development only and does not affect app runtime behavior until repositories are moved to database persistence in a later phase.

No real Google tokens should ever be seeded.

## Verify App Runtime Remains Unchanged

Run:

```bash
npm test
npx tsc --noEmit
npm run build
```

These checks should pass while the app continues using in-memory stores.

## Stop PostgreSQL

```bash
npm run db:down
```

This stops the local PostgreSQL container but keeps the persistent Docker volume.

## ECONNREFUSED Troubleshooting

If a database command fails with `ECONNREFUSED`:

- Confirm Docker Desktop is running.
- Run `npm run db:up`.
- Confirm `.env.local` uses port `5431`.
- Wait a few seconds for PostgreSQL health checks to pass, then retry.
- Confirm another process is not already using local port `5431`.

## Safety Notes

- This Docker Compose setup is local development only.
- It does not include production credentials.
- It does not add reset, truncate, or drop commands.
- It does not change Next.js app startup.
- It does not move runtime repositories to PostgreSQL.
