# CampusShare

CampusShare is a campus Rent & Reuse platform: borrow what you need, rent what you don't, share what you have, and reuse instead of buying. The approved project foundation is retained: React + Vite frontend, Node.js + Express REST API, PostgreSQL with `pg`, and the existing relational schema.

## Features

- Immediate student registration and sign-in with bcrypt password hashing and JWT sessions.
- Saved items, verified request actions, and a real-data student dashboard.
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
3. Apply `database/schema.sql` to a new database. For an existing database, apply the additive migrations in order: `001_rent_reuse_features.sql`, `002_email_auth_and_item_inquiries.sql`, then `003_favorites.sql`. They preserve existing accounts and listings; do not reset or drop production data. `pgcrypto` must already be enabled or created by a role allowed to do so.
4. Set a private random `JWT_SECRET` of at least 32 characters in `.env`. Never commit `.env`, and never put database credentials or JWT secrets in frontend variables.
5. Set `CLIENT_URL` to the allowed frontend origin(s). Registration and login authenticate directly with an email and password, then issue a JWT upon success.
6. Install workspace dependencies from the repository root with `pnpm install`.
7. Start both applications from the repository root with `pnpm dev`. The server loads the root `.env` through `dotenv`.

The frontend runs at `http://localhost:5173`; the API runs at `http://localhost:5000`. The frontend defaults to `http://localhost:5000/api` in local development. Set the public API endpoint in `VITE_API_URL` at frontend build time (for example `https://your-api-host.example/api`); never place secrets in Vite variables. `CLIENT_URL` may contain comma-separated allowed frontend origins. In production, the backend enables verified PostgreSQL TLS by default; configure the database provider's TLS certificate chain appropriately.

Item photos selected from a device are stored as validated JPG, PNG, or WebP data URLs in the existing `item_images.image_url` PostgreSQL field (maximum 600 KB per image). Existing HTTPS image URLs remain supported. This uses the current storage model and does not require frontend storage credentials.

For a database that already ran the earlier CampusShare schema, apply `database/migrations/003_favorites.sql` once. It adds saved listings without deleting existing rows.

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
- Backend environment: `NODE_ENV=production`, `CLIENT_URL` set to the deployed frontend origin, a private random `JWT_SECRET` of at least 32 characters, and either `DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; configure `DB_SSL=true` and provide the provider root certificate with `DB_SSL_CA_BASE64` when required. Keep every password/secret in Render's backend environment only.
- In the frontend Render Static Site service only, add a rewrite from `/*` to `/index.html` with status `200`. This keeps item details and other React Router pages working on refresh; do not apply the rewrite to the backend API.

## Administrator provisioning

New registrations always receive the `student` role. Promote a trusted account through a protected database session, for example:

```sql
UPDATE users SET role = 'admin' WHERE email = 'trusted-admin@college.edu';
```

Do not expose database credentials to the client or promote users through a public endpoint. Admin API endpoints are `GET /api/admin/reports`, `PATCH /api/admin/reports/:id`, `GET /api/admin/users`, and `PATCH /api/admin/users/:id/status`.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/categories`, `GET /api/items`, `GET /api/items/:id`, and authenticated `GET/POST/DELETE /api/favorites`
- Authenticated item, favorite, inquiry, request, transaction, notification, and report routes
- `GET /api/health` checks PostgreSQL connectivity

Authenticated routes accept `Authorization: Bearer <token>`. Registration and login return a JWT after valid input and credentials. API errors use `{ "success": false, "message": "...", "code": "..." }`. The PostgreSQL schema and additive migrations define the data model.

## Security notes

Keep all secrets in the server's environment. The client only stores a short-lived access token in browser storage; use HTTPS in production, configure a strong secret, and consider secure HttpOnly cookie sessions when deploying to a shared domain. Production deployments should configure PostgreSQL TLS according to their provider, set exact `CLIENT_URL` origins, and add backups and monitoring.
