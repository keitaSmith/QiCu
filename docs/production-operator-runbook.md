# QiCu Production Operator Runbook

This runbook is for operators deploying and maintaining QiCu in production. It focuses on safe setup, real user provisioning, smoke testing, Google Calendar recovery, and first-response troubleshooting.

For the broader auth readiness background, see `docs/auth-production-readiness-checklist.md` and `docs/phase-h-auth-readiness.md`.

## 1. Required Production Environment Variables

Set these before deploying QiCu in production:

- `DATABASE_URL`
- `QICU_AUTH_ENFORCEMENT=strict`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `NODE_ENV=production`

Notes:

- `DATABASE_URL` should point to production PostgreSQL.
- `QICU_AUTH_ENFORCEMENT=strict` is the explicit production setting, even though production now defaults to strict auth if the variable is missing.
- `GOOGLE_TOKEN_ENCRYPTION_KEY` must be present before any Google token persistence or decryption path is used.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` are required for Google OAuth and Calendar integration.
- QiCu does not currently require a separate app base URL env var in runtime code. If your deployment platform uses one for proxying or redirects, keep it aligned with the deployed public HTTPS origin.

## 2. Production Deploy Checklist

Use this order when bringing up a production environment:

1. Provision a production PostgreSQL database.
2. Set the environment variables listed above.
3. Deploy the application over HTTPS.
4. Run database migrations.
5. Run the database consistency check.
6. Verify the app starts cleanly and connects to the production database.
7. Confirm strict auth is active.
8. Confirm demo fallback is not used in production behavior.
9. Provision at least one real user with `npm run auth:create-user`.
10. Perform the manual production smoke test below.

Do not run `npm run db:seed:auth-dev` in production. That seed is local-development only.

## 3. User Provisioning Runbook

Create a real login user with the operator command:

```bash
QICU_CREATE_USER_EMAIL="operator@example.com" \
QICU_CREATE_USER_PASSWORD="ReplaceWithARealStrongPassword123!" \
QICU_CREATE_USER_NAME="Operator Name" \
QICU_CREATE_USER_PRACTITIONER_ID="prac-keita-smith" \
npm run auth:create-user
```

Optional intentional relinking:

```bash
QICU_CREATE_USER_ALLOW_RELINK=true
```

Safety guidance:

- Keep passwords out of committed files.
- Be careful with shell history and shared terminals.
- Use a password manager or secure operator process for real credentials.
- Never paste production credentials into docs, tickets, or chat logs.

Expected success output should confirm only safe public details such as the email address and practitioner public ID. It must not print the password, password hash, or database UUIDs.

If the target practitioner is already linked to another user, the command refuses by default. Re-run only with `QICU_CREATE_USER_ALLOW_RELINK=true` when the relink is intentional and approved.

## 4. Manual Production Smoke Test

Use a provisioned user and a browser session in production or staging:

1. Visit `/dashboard` while logged out.
2. Confirm the app redirects to `/login`.
3. Log in with the provisioned user credentials.
4. Confirm the browser uses the server-set `qicu_session` cookie.
5. Open `/api/auth/me` and confirm authenticated state is returned.
6. Load the main dashboard pages.
7. Verify patients, bookings, sessions, services, and Trash load without `401`.
8. Confirm the session-mode client does not require `x-qicu-practitioner-id`.
9. Test logout from the profile menu.
10. Confirm logout clears the session and returns to `/login`.
11. Confirm unauthenticated dashboard access is blocked again after logout.

If you need a safe mutation test, create a clearly disposable booking or use a staging database first.

## 5. Google Calendar Setup and Smoke Test

Before using Google Calendar features:

1. Set `GOOGLE_TOKEN_ENCRYPTION_KEY`.
2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`.
3. Connect a Google account through the dashboard.
4. Select a calendar.
5. Confirm Google status and calendar listing load.
6. Create a test booking and confirm Google sync behaves as expected if the account and calendar are configured.
7. Disconnect and confirm the dashboard shows the integration as disconnected.

Operational reminders:

- Google access and refresh tokens are stored only as encrypted payloads.
- Public status never returns plaintext tokens or encrypted token payloads.
- If the encryption key is missing or changed, previously stored tokens may become undecryptable.
- If a Google integration appears disconnected after deploy, check the encryption key first, then the OAuth configuration, then the persisted integration row.

## 6. Security Operations Notes

- Strict auth is the production default and should remain enabled.
- Demo fallback is for local development and tests only.
- Mutating API routes use the shared origin guard; clearly cross-origin requests are rejected.
- SameSite cookies are still useful, but they are not the only browser protection QiCu uses.
- The current protection model is SameSite plus same-origin/fetch-metadata checks. A fuller CSRF-token strategy is still future work if the deployment needs it.
- Never log passwords, session cookies, authorization headers, or Google token values.
- DB UUIDs remain internal. Public IDs remain the external API/UI boundary.

## 7. Recovery and Troubleshooting

### Login returns invalid credentials

- Confirm the user exists.
- Confirm the password was provisioned correctly.
- Confirm the password credential row exists for that user.
- Confirm the environment is pointed at the intended database.

### Dashboard keeps redirecting to `/login`

- Confirm the browser accepted the `qicu_session` cookie.
- Confirm the site is served over HTTPS in production.
- Confirm the login request and dashboard request are on the same site/origin expected by the browser.
- Check whether the session expired or was revoked.

### API routes return `401` or `403`

- `401` usually means the session is missing, invalid, expired, or revoked.
- `403` usually means the authenticated user is not linked to a practitioner or the request was rejected by the origin guard.
- Confirm `QICU_AUTH_ENFORCEMENT=strict` is set.
- Confirm the authenticated user is linked to the intended practitioner.

### `qicu_session` is not being sent

- Confirm HTTPS is in use.
- Confirm the cookie is marked `Secure` in production.
- Confirm the browser is not blocking third-party cookies or a mismatched origin path.
- Confirm the login and dashboard are using the same site origin.

### Google integration says disconnected after deploy

- Confirm `GOOGLE_TOKEN_ENCRYPTION_KEY` matches the key used when the tokens were stored.
- Confirm `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` are set correctly.
- Confirm the integration row still exists and belongs to the authenticated practitioner.

### `GOOGLE_TOKEN_ENCRYPTION_KEY` is missing or changed

- Missing key: Google token persistence and decryption paths fail closed.
- Changed key: previously encrypted tokens may no longer decrypt.
- Restore the original key if you need to keep using the existing encrypted token rows.

### `auth:create-user` relink errors

- The target practitioner is already linked to another user, or the existing user is already linked to a different practitioner.
- Re-run only with `QICU_CREATE_USER_ALLOW_RELINK=true` after operator approval.

### `db:seed:auth-dev` was attempted in production

- Stop and do not use it.
- That command is local-development only and refuses under `NODE_ENV=production`.

### `DATABASE_URL` or migration issues

- Confirm `DATABASE_URL` points at the intended database.
- Run migrations before attempting auth provisioning.
- Run the database check to confirm the connection and expected tables.

## 8. Remaining Future Production Work

- Invite/admin UI for routine account provisioning
- Password reset
- Email verification
- Optional CSRF-token strategy
- Optional middleware or page-level redirects for dashboard protection
- Account management UI
- Backup and restore procedures
- A production operator handbook for escalation and rollback

