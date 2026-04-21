# SaaSGuard — Design Spec

**Date:** 2026-04-20  
**Status:** Approved  

---

## Overview

SaaSGuard is a standalone internal web application that gives IT, Finance, and Department Managers a unified view of the company's SaaS estate. It combines three capabilities:

1. **Shadow IT discovery** — detect apps employees are using via OAuth grants scanned from Google Workspace and Microsoft 365
2. **Spend management** — track and trend SaaS costs sourced from corporate card feeds
3. **Access governance** — see who has access to what, manage offboarding, and surface stale access

The app is internal-only: login is restricted to company email domain via SSO.

---

## Architecture

### Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Single deployable, API routes handle OAuth callbacks and connector syncs |
| Styling | Tailwind CSS + shadcn/ui | Consistent component library, fast to build |
| Charts | Recharts | Spend trend and breakdown charts |
| Tables | TanStack Table | Virtualized, filterable app inventory |
| ORM | Prisma + PostgreSQL | Type-safe queries, managed migrations |
| Queue | BullMQ + Redis | Background connector syncs, retry logic |
| Auth | NextAuth.js | SSO login (Google or Okta), JWT session cookie |
| Deploy | Railway | Web service + Worker service + Postgres + Redis add-ons |

### Services

Two processes run from the same repo:

- **Web** (`next start`) — serves the UI and API routes
- **Worker** (`node worker/index.ts`) — runs BullMQ consumers for connector syncs, token refresh, and alerting

### System Flow

```
[Google Workspace] [Microsoft 365] [Okta] [1Password] [Card Feed]
        ↓                 ↓           ↓        ↓           ↓
                    BullMQ Worker (sync jobs)
                            ↓
                       PostgreSQL
                            ↓
                     Next.js API routes
                            ↓
                       React UI
```

---

## Data Model

### Core Tables

**`App`**
```
id              uuid PK
name            text
domain          text (unique)
category        text (e.g. "Productivity", "Security", "Dev Tools")
status          enum: shadow | review | managed | denied
riskScore       int (0–100, auto-calculated)
discoveredAt    timestamp
discoveredBy    text (connector type that first found it)
```

**`AppUser`** — who uses a given app
```
id          uuid PK
appId       uuid FK → App
userId      uuid FK → User
grantType   enum: oauth | sso | manual
scopes      text[] (OAuth scopes granted)
firstSeen   timestamp
lastSeen    timestamp
isActive    bool
```

**`SpendRecord`**
```
id          uuid PK
appId       uuid FK → App (nullable until matched)
amount      decimal
currency    text
period      date (month start, e.g. 2026-04-01)
source      enum: stripe | brex | ramp | csv
merchantName text
department  text (from cardholder mapping)
employeeId  uuid FK → User (nullable)
```

**`License`**
```
id            uuid PK
appId         uuid FK → App
seatsPurchased int
seatsUsed      int  -- auto-calculated from AppUser count (isActive=true) for this app
costPerSeat    decimal
renewalDate    date
vendor         text
notes          text
```

**`Connector`**
```
id              uuid PK
type            enum: google_workspace | microsoft_365 | okta | onepassword | stripe | brex | ramp | csv
status          enum: active | error | disconnected | pending
credentialsEnc  text (AES-256 encrypted JSON)
lastSyncAt      timestamp
lastSyncStatus  enum: success | partial | failed
syncFrequency   text (cron expression)
config          jsonb (tenant ID, domain, vault IDs, etc.)
```

**`User`** — internal users of SaaSGuard
```
id          uuid PK
email       text (unique)
name        text
role        enum: admin | finance | manager
department  text
managerId   uuid FK → User (nullable)
```

**`Alert`**
```
id          uuid PK
type        enum: new_shadow_app | offboarding_risk | high_spend | stale_access | connector_error
severity    enum: high | medium | low
payload     jsonb
resolvedAt  timestamp (nullable)
createdAt   timestamp
```

---

## Features

### Discovery (Shadow IT)

- BullMQ worker syncs OAuth app grants from Google Workspace (Admin SDK) and Microsoft 365 (Graph API) on a daily schedule, hourly incremental
- Any app not already in the `App` table is created with `status = shadow`
- Risk score auto-calculated based on OAuth scopes (read email/contacts/drive = high) and vendor reputation
- Alert created + email sent to IT admin for each new shadow app
- IT admin actions: **Approve** (status → managed) | **Deny** (status → denied, user notified) | **Snooze**
- Timeline view shows new app adoption over time per connector

### Spend Management

- Card feed connectors (Stripe API, Brex API, Ramp API, CSV upload) ingest transactions
- Merchant name auto-matched to `App` via domain lookup; unmatched transactions shown for manual tagging
- Monthly spend per app, trend chart (12 months), breakdown by department
- License vs. actual-usage gap flag: if `seatsUsed / seatsPurchased < 0.6` for 2+ months, flag for review
- Renewal date tracker with 60-day and 30-day alerts

### Access Governance

- User→app matrix sourced from Okta (SSO assignments) and Google Workspace (OAuth grants)
- **Offboarding queue**: when a user is deactivated in Okta/GWS, surface all their active app access for IT to revoke
- 1Password vault membership synced to show which employees have access to shared credentials
- Stale access flag: `AppUser.lastSeen > 90 days` and `isActive = true`
- Access review export as CSV or PDF (audit trail)

---

## Connectors

### Google Workspace

- **Auth:** OAuth 2.0 with admin scope (`https://www.googleapis.com/auth/admin.reports.audit.readonly` + directory)
- **Setup:** IT admin clicks Connect → Google consent → refresh token stored encrypted
- **Sync:** Admin SDK `tokens.list()` per user, normalized into `AppUser` rows

### Microsoft 365 / Entra ID

- **Auth:** OAuth 2.0, requires Global Admin or Application Administrator role
- **Setup:** Same redirect pattern; tenant ID + client secret stored encrypted
- **Sync:** Graph API `/oauth2PermissionGrants` + `/users` directory

### Okta

- **Auth:** API token (no OAuth redirect)
- **Setup:** Paste domain + API token in connector form
- **Sync:** `/api/v1/apps`, `/api/v1/users`, `/api/v1/groups` — user→app assignments normalized

### 1Password

- **Auth:** Service account token (1Password Connect or Events API)
- **Setup:** Paste token, select which vaults to index
- **Sync:** Vault items (login type) → app name/URL extracted; vault members → `AppUser` rows

### Card Feed

- **Stripe:** Webhook or API key → transactions ingested in real time or daily batch
- **Brex / Ramp:** API key → daily transaction pull
- **CSV upload:** Fallback; columns: date, merchant, amount, currency, cardholder email

---

## Authentication & Security

- Login via NextAuth.js — providers: Google Workspace OAuth or Okta OIDC (whichever is the company's primary IdP)
- Email domain allowlist enforced at login — only `@company.com` addresses admitted
- Role stored in `User.role`, checked server-side on every API route via middleware
- Connector credentials encrypted at rest with AES-256; encryption key from `CREDENTIAL_ENCRYPTION_KEY` env var, never stored in DB
- No connector credentials ever returned to the client or written to logs
- Session via `httpOnly` encrypted JWT cookie (NextAuth default)

---

## Role-Based Access

| Section | IT Admin | Finance | Dept Manager |
|---|---|---|---|
| Dashboard | Full | Spend-only stats | Team-scoped stats |
| Discovery | Full + approve/deny | — | Team apps only (read) |
| App Inventory | Full + edit | Read-only | Team apps only |
| Spend | Full | Full | Team budget only |
| Access | Full + offboarding | — | Team members only |
| Connectors | Full | — | — |
| Settings | Full | — | — |

Department scoping for managers: all queries filtered by `User.department` matching the manager's own department.

---

## Error Handling

**Connector sync failures**
- BullMQ retries failed jobs 3× with exponential backoff (1 min, 5 min, 25 min)
- After all retries exhausted: `Connector.status = error`, alert created, IT admin emailed
- Connector card in UI shows last-success timestamp and error message

**OAuth token expiry**
- Worker checks token expiry 24 hours ahead and proactively refreshes
- If refresh fails: connector flagged, admin prompted to reconnect in UI

**API rate limits**
- Rate limit responses (429) cause job to pause and reschedule after the `Retry-After` header window
- GWS and M365 quota tracked per connector; syncs spread across off-peak hours

**Client-facing errors**
- All API routes return `{ error: string, code: string }` on failure
- Client shows toast notification for user-facing errors
- 401 → redirect to login; 403 → "you don't have access" inline message

---

## Testing Strategy

**Unit tests (Vitest)**
- Risk scoring logic
- App/domain matching from card transaction merchant names
- Connector data normalization (raw API response → Prisma upsert input)
- Role-based access middleware

**Integration tests**
- API routes against a real test PostgreSQL database (seeded fixtures)
- BullMQ job execution with connector clients mocked (no real API calls)
- OAuth callback flow with mocked provider responses

**E2E tests (Playwright)**
- Login + role-based redirect
- Approve and deny a shadow IT app
- Spend drill-down by department
- Connector setup wizard (Google Workspace)
- Offboarding queue action

---

## Project Structure

```
saasguard/
├── app/                     # Next.js App Router
│   ├── (auth)/              # Login pages
│   ├── (dashboard)/         # Protected routes (dashboard, discovery, spend, access, inventory)
│   ├── api/                 # API routes
│   │   ├── connectors/
│   │   ├── apps/
│   │   ├── spend/
│   │   ├── access/
│   │   └── auth/            # NextAuth handler
├── worker/                  # BullMQ worker process
│   ├── index.ts             # Entry point, registers consumers
│   ├── jobs/
│   │   ├── sync-google.ts
│   │   ├── sync-m365.ts
│   │   ├── sync-okta.ts
│   │   ├── sync-onepassword.ts
│   │   └── sync-cardfeed.ts
├── lib/
│   ├── connectors/          # Connector client wrappers
│   ├── crypto.ts            # AES-256 encrypt/decrypt
│   ├── risk.ts              # Risk scoring logic
│   └── db.ts                # Prisma client singleton
├── prisma/
│   └── schema.prisma
├── components/              # shadcn/ui + custom components
└── middleware.ts            # Auth + role enforcement
```

---

## Out of Scope (v1)

- Browser extension for discovery (network-level shadow IT detection)
- Automated app provisioning / deprovisioning via connectors
- Vendor negotiation workflows or contract storage
- Multi-tenant (this is a single-org internal tool)
- Mobile app
