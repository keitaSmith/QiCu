# QiCu Auth Production Readiness Checklist

This checkpoint documents the current strict-mode browser auth flow and the remaining work before real production onboarding.

## Current Strict Browser Flow

Status: smoke-tested locally with `QICU_AUTH_ENFORCEMENT=strict`.

- `/login` renders the email/password form and submits to `POST /api/auth/login`.
- Successful login relies on the server-set `qicu_session` HttpOnly cookie.
- Successful login redirects to `/dashboard` or a safe local `next` path.
- Failed login shows a generic invalid-credentials message.
- Unauthenticated dashboard visits in strict mode redirect to `/login` instead of leaving the dashboard in a broken `401` data-loading state.
- Dashboard session-mode requests include cookies and omit `x-qicu-practitioner-id`.
- Profile-menu logout posts to `POST /api/auth/logout`, clears the session cookie, and redirects to `/login`.
- Demo mode remains available when `QICU_AUTH_ENFORCEMENT` is not `strict`.

## Local Development Auth Fixture

Command:

```bash
npm run db:seed
npm run db:seed:auth-dev
```

Local-only credentials:

- Email: `dev@qicu.local`
- Password: `ChangeMe123!`
- Linked practitioner: `prac-keita-smith`

Safety notes:

- The fixture refuses to run when `NODE_ENV=production`.
- The password is hashed through the existing password helper.
- The database stores the bcrypt hash, not the plaintext password.
- The script is idempotent and links the user to the existing seeded practitioner.
- This fixture is not production onboarding and must not be used for real accounts.

## Required Production Settings

- Set `QICU_AUTH_ENFORCEMENT=strict`.
- Serve the app over HTTPS so `Secure` cookies work correctly.
- Configure `DATABASE_URL` for managed or otherwise production-grade PostgreSQL.
- Set `GOOGLE_TOKEN_ENCRYPTION_KEY` before using Google token persistence paths.
- Use strong database credentials and restricted network access.
- Do not run or rely on `npm run db:seed:auth-dev` in production.
- Do not rely on demo practitioner fallback in production.

## Security Checkpoint

- Password credentials store hashes only.
- Auth sessions store SHA-256 hashes of opaque session tokens only.
- `qicu_session` is HttpOnly, SameSite=Lax, Path=/, and Secure in production.
- The session cookie does not contain user IDs, practitioner IDs, DB UUIDs, email, or claims.
- Public auth responses do not expose DB UUIDs, password hashes, session token hashes, or cookie values.
- Strict-mode practitioner scope is derived from the authenticated session and does not trust `x-qicu-practitioner-id`.
- Session-mode client fetches omit `x-qicu-practitioner-id`.
- Demo-mode client fetches still include `x-qicu-practitioner-id` for local development and tests.
- Google token fields remain encrypted at rest and hidden from public responses.

## Remaining Production Work

- Add real signup, invite, or admin user provisioning.
- Add password reset and email verification flows.
- Add a broader CSRF/origin strategy for cookie-authenticated mutating domain routes.
- Decide whether to add middleware/page-level redirects for protected dashboard pages.
- Disable or hard-guard demo fallback in production builds.
- Add production account management and operator runbooks.

