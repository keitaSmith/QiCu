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
- Demo mode remains available only in local development and tests when demo fallback is allowed.

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

## Admin Provisioning Command

Operator command:

```bash
QICU_CREATE_USER_EMAIL="practitioner@example.com" \
QICU_CREATE_USER_PASSWORD="StrongPassword123!" \
QICU_CREATE_USER_NAME="Practitioner Name" \
QICU_CREATE_USER_PRACTITIONER_ID="prac-keita-smith" \
npm run auth:create-user
```

Optional override for intentional relinking:

```bash
QICU_CREATE_USER_ALLOW_RELINK=true
```

Behavior and guardrails:

- Requires `DATABASE_URL` and all `QICU_CREATE_USER_*` inputs.
- Resolves the practitioner from the existing public practitioner ID.
- Hashes the password with the existing password helper.
- Stores no plaintext password and prints no DB UUIDs, hashes, or password values.
- Is idempotent for the same email and practitioner.
- Rejects unknown practitioner IDs.
- Rejects weak passwords.
- Rejects relinking a practitioner or moving an already-linked user by default.
- Allows relinking only when `QICU_CREATE_USER_ALLOW_RELINK=true` is set intentionally.

This is an operator/admin path, not public signup or invite onboarding. Do not paste real passwords into committed files, shell history that is shared, or production docs.

## Required Production Settings

- Set `QICU_AUTH_ENFORCEMENT=strict`.
- Serve the app over HTTPS so `Secure` cookies work correctly.
- Configure `DATABASE_URL` for managed or otherwise production-grade PostgreSQL.
- Set `GOOGLE_TOKEN_ENCRYPTION_KEY` before using Google token persistence paths.
- Use strong database credentials and restricted network access.
- Do not run or rely on `npm run db:seed:auth-dev` in production.
- Do not rely on demo practitioner fallback in production.
- Provision real users intentionally with `npm run auth:create-user` or a future invite/admin flow.

Production auth hardening note:

- QiCu now treats `NODE_ENV=production` as strict auth by default even if `QICU_AUTH_ENFORCEMENT` is missing or misconfigured.
- That means production does not fall back to `x-qicu-practitioner-id` or the demo practitioner switcher path by accident.
- You should still set `QICU_AUTH_ENFORCEMENT=strict` explicitly in production for clarity and operational consistency.

## Security Checkpoint

- Password credentials store hashes only.
- Auth sessions store SHA-256 hashes of opaque session tokens only.
- `qicu_session` is HttpOnly, SameSite=Lax, Path=/, and Secure in production.
- The session cookie does not contain user IDs, practitioner IDs, DB UUIDs, email, or claims.
- Public auth responses do not expose DB UUIDs, password hashes, session token hashes, or cookie values.
- Strict-mode practitioner scope is derived from the authenticated session and does not trust `x-qicu-practitioner-id`.
- Session-mode client fetches omit `x-qicu-practitioner-id`.
- Demo-mode client fetches still include `x-qicu-practitioner-id` only when demo fallback is allowed in local development and tests.
- Mutating API routes use a shared origin guard. Requests with a clearly cross-origin `Origin` header return `403`, and strict/production mode also rejects browser fetch metadata marked `cross-site` when `Origin` is absent.
- Missing `Origin` without browser cross-site fetch metadata remains allowed for non-browser clients and local tooling.
- Google token fields remain encrypted at rest and hidden from public responses.

## Remaining Production Work

- Add real signup, invite, or admin user provisioning.
- Expand from the operator CLI to a fuller invite/admin provisioning workflow.
- Add password reset and email verification flows.
- Add a full CSRF-token strategy if the product needs stronger browser form protections beyond SameSite cookies and the shared origin/fetch-metadata guard.
- Decide whether to add middleware/page-level redirects for protected dashboard pages.
- Add production account management and operator runbooks.
- See `docs/production-operator-runbook.md` for the operator checklist, provisioning steps, smoke tests, Google setup, and troubleshooting guidance.
