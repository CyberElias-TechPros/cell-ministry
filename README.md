# Nexus — Cell Ministry Command

A production-oriented ministry operations platform for people, cells, meetings, leadership development, and cell multiplication. Its signature genealogy view preserves where each cell came from and what it has produced.

![Status](https://img.shields.io/badge/status-foundation_release-7ce7b1) ![Frontend](https://img.shields.io/badge/frontend-React_19-61dafb) ![API](https://img.shields.io/badge/API-Cloudflare_Workers-f38020) ![Database](https://img.shields.io/badge/database-Cloudflare_D1-f38020)

## Product scope

This repository began with a detailed product plan and no implementation. The current foundation release delivers a coherent, end-to-end vertical slice:

- Secure, HTTP-only cookie authentication with PBKDF2 password verification
- Role-scoped organization context
- Ministry pulse dashboard and meeting trends
- Cell directory and cell creation
- People registry and leadership journey capture
- Meeting report submission and ledger
- Database-driven cell genealogy with interactive detail and zoom controls
- Audit events for sign-in and important record creation
- Responsive mobile navigation, loading/error/empty states, keyboard focus, and reduced-motion support
- Vercel frontend and Cloudflare Worker + D1 deployment configuration

`Resources`, configurable standards, advanced approvals, offline reporting, and notifications are visibly identified as future modules rather than represented as completed behavior.

## Architecture

```text
Browser
  └─ Vercel: React + Vite static application
       └─ same-origin /api/* rewrite
            └─ Cloudflare Worker: Hono API
                 └─ Cloudflare D1: relational records and sessions
```

The application intentionally uses only the Cloudflare service currently justified by the product: **D1**. R2, KV, Queues, and Durable Objects should only be introduced when approved resources, caching, background reminders, or real-time coordination actually require them.

### Data integrity and security

- Organization ownership is checked on every data mutation.
- User input is runtime-validated with Zod.
- SQL uses bound parameters.
- Sessions store only SHA-256 token hashes; raw tokens remain in HTTP-only, `SameSite=Strict` cookies.
- Passwords use PBKDF2-SHA256 with 120,000 iterations and per-user salts.
- D1 constraints enforce non-negative attendance, unique cell codes, and foreign-key relationships.
- Private application routes are excluded from search indexing.
- Production errors do not expose stack traces.

For a public launch, replace the seeded preview account, configure a strong secret-management process, and add rate limiting at the Cloudflare edge to the login route.

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run db:migrate:local
```

Run the API in one terminal:

```bash
npm run dev:api
```

Run the frontend in another:

```bash
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to the Worker on port `8787`.

### Preview account

- Email: `admin@nexus.demo`
- Password: `Welcome2026!`

This account is seed data for local/preview environments and must be removed or rotated before importing real ministry data.

## Validation

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm audit
```

Apply migrations locally with `npm run db:migrate:local`. The initial migration is additive because there is no preceding production schema.

## Cloudflare deployment

1. Authenticate Wrangler: `npx wrangler login`.
2. Create D1: `npx wrangler d1 create cell-ministry`.
3. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc` with the returned ID.
4. Apply the schema: `npm run db:migrate:remote`.
5. Deploy the API: `npm run deploy:api`.
6. Confirm `/api/health` on the deployed Worker.

For production, set `ENVIRONMENT=production` in Wrangler environment configuration so session cookies are marked `Secure`.

## Vercel deployment

1. Import this repository in Vercel.
2. Use the included `vercel.json` (build command `npm run build`, output `dist`).
3. Replace `YOUR_SUBDOMAIN` in the `/api` rewrite with the deployed Worker hostname.
4. Deploy a preview and verify login, dashboard, record creation, refresh persistence, and logout.
5. Promote only after the Worker migration has completed.

The SPA fallback is configured after the API rewrite so direct navigation to application routes works.

## Environment separation

- Local D1 data is held in Wrangler's ignored `.wrangler` directory.
- Preview and production should use separate D1 databases and separate Worker environments.
- Never commit `.dev.vars`, `.env`, database exports, real member data, or credentials.
- `.env.example` documents the optional frontend API path.

## Operational checklist

Before handling real personal data:

- Replace the preview user and review scoped roles with ministry leadership.
- Add account recovery, MFA for privileged roles, login throttling, and forced session revocation.
- Confirm data retention, privacy, consent, and regional compliance requirements.
- Establish D1 backup/export and tested recovery procedures.
- Connect structured Worker logs to an approved monitoring destination.
- Populate official standards only from currently authorized ministry directives.

## Repository map

```text
src/                 React application, routes, states, visual system
worker/index.ts      Cloudflare Worker API and authorization boundary
migrations/          Versioned D1 schema and preview seed
public/robots.txt    Private-product indexation policy
vercel.json          Frontend build, caching, security headers, API rewrite
wrangler.jsonc       Worker and D1 binding
rough-plan.md        Original product research and long-term product direction
```

## Product decisions

The implementation treats hierarchy and cell genealogy as related but separate concepts. Cells are first-class organizational nodes, while parent relationships preserve multiplication lineage. Leadership is represented as a journey instead of a permanent label. Historical records are never silently replaced. Financial tracking was deliberately excluded because its sensitivity and business requirements are not yet confirmed.
