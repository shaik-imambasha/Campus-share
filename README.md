# CampusShare

CampusShare is a campus-first sharing platform for students to lend, donate, exchange, and request useful items. The approved project foundation is retained: React + Vite frontend, Node.js + Express REST API, PostgreSQL with `pg`, and the existing relational schema.

## Features

- Student registration and sign in with bcrypt password hashing and signed JWT sessions.
- Searchable item shelf with category and sharing-type filters, item details, listing creation, owner editing, and removal.
- Request lifecycle with owner decisions, notifications, and transaction tracking/return.
- User reports and administrator report review/account suspension endpoints.
- Responsive layouts, server-side validation, parameterized SQL, Helmet headers, CORS, and authentication rate limiting.

## Requirements and setup

Use Node.js 18+, npm 9+, and PostgreSQL 14+.

1. Install/start PostgreSQL and create a database using your own PostgreSQL administration account. The project does not assume a PostgreSQL username or password.
2. Copy `.env.example` to `.env` in the repository root. Set either `DATABASE_URL` or all of `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`. The backend uses `DATABASE_URL` when it is nonempty; otherwise it uses the `DB_*` fields. Keep real values only in the ignored `.env` file.
3. Apply `database/schema.sql` to that database using a PostgreSQL client authenticated with your own database role. For example, in `psql`, connect to the configured database and run `\i 'database/schema.sql'`. The schema creates the tables, indexes, and starter categories; the connecting role must have permission to create the `pgcrypto` extension (or have an administrator enable it first).
4. Set a private random `JWT_SECRET` of at least 32 characters in `.env`. Never commit `.env`, and never put database credentials or JWT secrets in frontend variables.
5. Install dependencies from the repository root: `npm install`, `npm install --prefix client`, and `npm install --prefix server`.
6. Start both applications from the repository root with `npm run dev`. The server loads the root `.env` through `dotenv`.

The frontend runs at `http://localhost:5173`; the API runs at `http://localhost:5000`. The frontend defaults to `http://localhost:5000/api`, matching the backend's default port and `/api` route prefix. If the API URL differs, set `VITE_API_URL` in `client/.env.local` (for example `VITE_API_URL=https://your-api-host.example/api`); this is a public API endpoint setting, never a place for secrets. `CLIENT_URL` may contain comma-separated allowed frontend origins. In production, the backend enables verified PostgreSQL TLS by default; configure the database provider's TLS certificate chain appropriately.

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

Authenticated routes accept `Authorization: Bearer <token>`. API errors use `{ "success": false, "message": "..." }`. The PostgreSQL schema in `database/schema.sql` remains the source of truth for data relationships.

## Security notes

Keep all secrets in the server's environment. The client only stores a short-lived access token in browser storage; use HTTPS in production, configure a strong secret, and consider secure HttpOnly cookie sessions when deploying to a shared domain. Production deployments should configure PostgreSQL TLS according to their provider, set exact `CLIENT_URL` origins, and add backups and monitoring.
