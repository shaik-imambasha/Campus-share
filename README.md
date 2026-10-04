# CampusShare

CampusShare is a campus-first sharing platform for students to lend, donate, exchange, and request useful items. The approved project foundation is retained: React + Vite frontend, Node.js + Express REST API, PostgreSQL with `pg`, and the existing relational schema.

## Features

- Student registration with email verification; sign in completes only after a short-lived, single-use email approval link is opened.
- Short-lived, single-use password reset links; password resets invalidate existing JWT sessions.
- Searchable item shelf with category, condition, availability, sharing-mode, and rental-price filters.
- Borrow, rent, donate, and exchange requests with date ranges, rental estimates, owner decisions, and two-party handoff/return confirmation.
- Request-scoped messaging, notifications, public trust profiles, post-completion reviews, and database-backed CampusShare impact totals.
- Item details, listing creation, owner availability controls, and listing removal.
- Item photo selection from a camera, gallery, or computer, with a preview before posting.
- Private pre-request owner inquiries alongside the existing request-scoped conversations.
- User reports and administrator report review/account suspension endpoints.
- Responsive layouts, server-side validation, parameterized SQL, Helmet headers, CORS, and authentication rate limiting.

## Requirements and setup

Use Node.js 20.19+ and PostgreSQL 14+. The repository is a pnpm workspace.

1. Install/start PostgreSQL and create a database using your own PostgreSQL administration account. The project does not assume a PostgreSQL username or password.
2. Copy `.env.example` to `.env` in the repository root. Set either `DATABASE_URL` or all of `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`. The backend uses `DATABASE_URL` when it is nonempty; otherwise it uses the `DB_*` fields. Keep real values only in the ignored `.env` file.
3. Apply `database/schema.sql` to that database using a PostgreSQL client authenticated with your own database role. For example, in `psql`, connect to the configured database and run `\i 'database/schema.sql'`. The schema creates the tables, indexes, starter categories, and additive Rent & Reuse workflow fields/tables. The backend does not automatically change the database schema. For an existing deployment that already ran the original schema, apply `database/migrations/001_rent_reuse_features.sql` once; it adds fields and tables without deleting production data. The connecting role must have permission to create the `pgcrypto` extension (or have an administrator enable it first).
4. Set a private random `JWT_SECRET` of at least 32 characters in `.env`. Never commit `.env`, and never put database credentials or JWT secrets in frontend variables.
5. Set `APP_URL` to the public frontend origin and `CLIENT_URL` to the allowed frontend origin(s). Email links use `APP_URL` and are required for registration, login approval, and password reset. Set backend-only `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD`, and `EMAIL_FROM`. For Gmail, use `smtp.gmail.com`, port `465`, secure TLS, and a Google App Password (never your account password). Login and registration remain unavailable until email delivery is configured; the app never bypasses approval.
6. Install workspace dependencies from the repository root with `pnpm install`.
7. Start both applications from the repository root with `pnpm dev`. The server loads the root `.env` through `dotenv`.

The frontend runs at `http://localhost:5173`; the API runs at `http://localhost:5000`. The frontend defaults to `http://localhost:5000/api` in local development. Set the public API endpoint in `VITE_API_URL` at frontend build time (for example `https://your-api-host.example/api`); never place secrets in Vite variables. `CLIENT_URL` may contain comma-separated allowed frontend origins. In production, the backend enables verified PostgreSQL TLS by default; configure the database provider's TLS certificate chain appropriately.

Item photos selected from a device are stored as validated JPG, PNG, or WebP data URLs in the existing `item_images.image_url` PostgreSQL field (maximum 600 KB per image). Existing HTTPS image URLs remain supported. This uses the current storage model and does not require frontend storage credentials.

For an existing Supabase database, apply `database/migrations/002_email_auth_and_item_inquiries.sql` once before deploying this version. It adds verification/session fields, hashed short-lived auth-link records, and inquiry conversation support without deleting existing rows. Existing accounts are considered verified to preserve access; new registrations must verify their email.

## Sharing workflow

Listings can be offered for borrowing, renting, both, donation, or exchange. Sharing requests require a date range and can include an optional note. Rental prices are recorded per day and the expected total is shown before a request is sent. Request participants can message each other within their authorized request conversation. Once a share is completed, each participant can leave one 1–5 star review of the other participant. Home page impact totals are live counts from PostgreSQL and show zero when no matching activity exists.

Apply database schema changes before deploying the matching backend. For existing production data, apply only the additive SQL migrations above; do not rerun destructive/reset scripts. Back up production before any database maintenance.

## Render deployment

- Frontend static site root directory: repository root (`.`)
- Frontend build command: `pnpm install --frozen-lockfile && pnpm --filter campusshare-client build`
- Frontend publish directory: `client/dist`
- Frontend environment: `VITE_API_URL=https://campusshare-api-dbk0.onrender.com/api`
- Backend build command: `pnpm install --frozen-lockfile`
- Backend start command: `pnpm --filter campusshare-server start`
- Backend environment: `NODE_ENV=production`, `CLIENT_URL` and `APP_URL` set to the deployed frontend origin, a private random `JWT_SECRET` of at least 32 characters, SMTP settings (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`), and either `DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; configure `DB_SSL=true` and provide the provider root certificate with `DB_SSL_CA_BASE64` when required. Keep every password/secret in Render's backend environment only.
- Configure a Render Static Site rewrite `/*` → `/index.html` with status `200` so React Router routes survive direct navigation and refresh.

## Administrator provisioning

New registrations always receive the `student` role. Promote a trusted account through a protected database session, for example:

```sql
UPDATE users SET role = 'admin' WHERE email = 'trusted-admin@college.edu';
```

Do not expose database credentials to the client or promote users through a public endpoint. Admin API endpoints are `GET /api/admin/reports`, `PATCH /api/admin/reports/:id`, `GET /api/admin/users`, and `PATCH /api/admin/users/:id/status`.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/categories`, `GET /api/items`, `GET /api/items/:id`
- Authenticated item, request, transaction, notification, and report routes
- `GET /api/health` checks PostgreSQL connectivity

Authenticated routes accept `Authorization: Bearer <token>`. `POST /api/auth/login` starts email approval and returns no JWT; `POST /api/auth/approval/approve` issues a JWT only after validating the emailed one-time link. New accounts activate through `POST /api/auth/verification/verify`. Password recovery uses `POST /api/auth/password/forgot` and `/api/auth/password/reset`. API errors use `{ "success": false, "message": "...", "code": "..." }`. The PostgreSQL schema in `database/schema.sql` and additive migrations remain the source of truth for data relationships.

## Security notes

Keep all secrets in the server's environment. The client only stores a short-lived access token in browser storage; use HTTPS in production, configure a strong secret, and consider secure HttpOnly cookie sessions when deploying to a shared domain. Production deployments should configure PostgreSQL TLS according to their provider, set exact `CLIENT_URL` origins, and add backups and monitoring.
