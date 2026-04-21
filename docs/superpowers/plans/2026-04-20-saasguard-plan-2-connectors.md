# SaaSGuard Connectors & Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the BullMQ background worker and all five connector sync jobs (Google Workspace, Microsoft 365, Okta, 1Password, Card Feed) that pull data from external providers and write normalized App/AppUser/SpendRecord rows into Postgres, creating alerts for newly discovered shadow IT.

**Architecture:** A separate `worker/index.ts` Node process runs BullMQ consumers. Each connector has a thin client wrapper in `lib/connectors/` (handles auth + raw API calls) and a sync job in `worker/jobs/` (handles normalization + DB upserts). API routes in `app/api/connectors/` expose CRUD for connector records and trigger manual syncs. Risk scoring and alert creation are pure functions tested in isolation.

**Prerequisites:** Plan 1 complete — Prisma schema migrated, `lib/db.ts` and `lib/crypto.ts` in place.

**Tech Stack:** BullMQ, ioredis, `googleapis`, `@microsoft/microsoft-graph-client`, `@azure/identity`, `nodemailer` (alerts), Vitest

---

## File Map

```
~/saasguard/
├── worker/
│   ├── index.ts                          # entry point, registers consumers
│   ├── queue.ts                          # BullMQ Queue + Redis connection
│   └── jobs/
│       ├── sync-google.ts                # Google Workspace sync job
│       ├── sync-m365.ts                  # Microsoft 365 sync job
│       ├── sync-okta.ts                  # Okta sync job
│       ├── sync-onepassword.ts           # 1Password sync job
│       └── sync-cardfeed.ts              # Card feed sync job (Stripe/CSV)
├── lib/
│   ├── connectors/
│   │   ├── google.ts                     # Google Admin SDK client
│   │   ├── m365.ts                       # Microsoft Graph client
│   │   ├── okta.ts                       # Okta REST client
│   │   ├── onepassword.ts                # 1Password Connect client
│   │   └── cardfeed.ts                   # Stripe fetcher + CSV parser
│   ├── risk.ts                           # risk score calculation
│   └── alerts.ts                         # alert creation
├── app/api/connectors/
│   ├── route.ts                          # GET (list all) + POST (create/upsert)
│   ├── [id]/
│   │   └── route.ts                      # GET + PUT (update creds) + DELETE
│   └── [id]/sync/
│       └── route.ts                      # POST (enqueue manual sync)
└── __tests__/lib/
    ├── risk.test.ts
    └── connectors/
        ├── cardfeed.test.ts
        └── google.test.ts
```

---

## Task 1: Install dependencies

**Files:** `package.json`

- [ ] **Step 1: Install connector + worker dependencies**

```bash
npm install bullmq ioredis googleapis \
  @microsoft/microsoft-graph-client \
  @azure/identity \
  nodemailer
npm install -D @types/nodemailer
```

- [ ] **Step 2: Add `worker` script to `package.json`**

In the `scripts` section add:

```json
"worker": "tsx watch worker/index.ts"
```

Install `tsx` if not present:
```bash
npm install -D tsx
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install bullmq, googleapis, graph-client, and worker deps"
```

---

## Task 2: Redis connection + BullMQ queue

**Files:**
- Create: `worker/queue.ts`

- [ ] **Step 1: Add `REDIS_URL` to `.env` and `.env.example`**

In `.env`:
```
REDIS_URL="redis://localhost:6379"
```

In `.env.example`:
```
REDIS_URL="redis://localhost:6379"
```

Start Redis locally if needed:
```bash
docker run --name saasguard-redis -p 6379:6379 -d redis:7
```

- [ ] **Step 2: Create `worker/queue.ts`**

```typescript
// worker/queue.ts
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export const syncQueue = new Queue("connector-sync", { connection });

export type SyncJobData = {
  connectorId: string;
};
```

- [ ] **Step 3: Commit**

```bash
git add worker/queue.ts .env.example
git commit -m "feat: add BullMQ queue and Redis connection"
```

---

## Task 3: Risk scoring (TDD)

**Files:**
- Create: `lib/risk.ts`
- Create: `__tests__/lib/risk.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/risk.test.ts
import { describe, it, expect } from "vitest";
import { calculateRiskScore } from "@/lib/risk";

describe("calculateRiskScore", () => {
  it("returns 20 baseline for an app with no recognized scopes", () => {
    expect(calculateRiskScore(["openid", "email"])).toBe(20);
  });

  it("adds 25 for each high-risk scope, capped at 100", () => {
    const score = calculateRiskScore([
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/contacts",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/admin.directory.user",
    ]);
    expect(score).toBe(100);
  });

  it("adds 10 for medium-risk scopes", () => {
    const score = calculateRiskScore([
      "https://www.googleapis.com/auth/calendar.readonly",
    ]);
    expect(score).toBe(30);
  });

  it("stacks medium and high risk scopes", () => {
    const score = calculateRiskScore([
      "https://www.googleapis.com/auth/gmail.readonly", // +25 → 45
      "https://www.googleapis.com/auth/calendar.readonly", // +10 → 55
    ]);
    expect(score).toBe(55);
  });

  it("handles empty scopes", () => {
    expect(calculateRiskScore([])).toBe(20);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/lib/risk.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/risk'`

- [ ] **Step 3: Create `lib/risk.ts`**

```typescript
// lib/risk.ts
const HIGH_RISK_SCOPES = new Set([
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/admin.directory.user",
  "Mail.Read",
  "Mail.ReadWrite",
  "Contacts.Read",
  "Files.ReadWrite.All",
  "Directory.ReadWrite.All",
]);

const MEDIUM_RISK_SCOPES = new Set([
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "Calendars.Read",
  "Files.Read.All",
]);

export function calculateRiskScore(scopes: string[]): number {
  let score = 20;
  for (const scope of scopes) {
    if (HIGH_RISK_SCOPES.has(scope)) score = Math.min(score + 25, 100);
    else if (MEDIUM_RISK_SCOPES.has(scope)) score = Math.min(score + 10, 100);
  }
  return score;
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- __tests__/lib/risk.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/risk.ts __tests__/lib/risk.test.ts
git commit -m "feat: add risk scoring for OAuth app scopes"
```

---

## Task 4: Alert creation helper

**Files:**
- Create: `lib/alerts.ts`

- [ ] **Step 1: Add alert email vars to `.env.example`**

```bash
# Optional: email alerts via SMTP
ALERT_EMAIL_FROM="saasguard@yourcompany.com"
ALERT_EMAIL_TO="it-security@yourcompany.com"
SMTP_HOST="smtp.yourcompany.com"
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
```

- [ ] **Step 2: Create `lib/alerts.ts`**

```typescript
// lib/alerts.ts
import { db } from "@/lib/db";
import nodemailer from "nodemailer";
import type { AlertType, AlertSeverity } from "@prisma/client";

export async function createAlert(params: {
  type: AlertType;
  severity: AlertSeverity;
  payload: Record<string, unknown>;
}) {
  const alert = await db.alert.create({
    data: {
      type: params.type,
      severity: params.severity,
      payload: params.payload,
    },
  });

  if (params.severity === "high" || params.severity === "medium") {
    await sendAlertEmail(params.type, params.payload).catch((err) => {
      console.error("[alerts] email send failed:", err.message);
    });
  }

  return alert;
}

async function sendAlertEmail(
  type: AlertType,
  payload: Record<string, unknown>
) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL_FROM, ALERT_EMAIL_TO } =
    process.env;

  if (!SMTP_HOST || !ALERT_EMAIL_TO) return; // email not configured — skip silently

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  await transporter.sendMail({
    from: ALERT_EMAIL_FROM ?? "saasguard@localhost",
    to: ALERT_EMAIL_TO,
    subject: `[SaaSGuard] Alert: ${type.replace(/_/g, " ")}`,
    text: JSON.stringify(payload, null, 2),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/alerts.ts .env.example
git commit -m "feat: add alert creation with optional email notification"
```

---

## Task 5: Connector API routes (CRUD)

**Files:**
- Create: `app/api/connectors/route.ts`
- Create: `app/api/connectors/[id]/route.ts`
- Create: `app/api/connectors/[id]/sync/route.ts`

These routes let the UI manage connector records and trigger manual syncs. Credentials are encrypted before storage and never returned to the client.

- [ ] **Step 1: Create `app/api/connectors/route.ts`**

```typescript
// app/api/connectors/route.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { NextResponse } from "next/server";
import type { ConnectorType } from "@prisma/client";

// GET /api/connectors — list all connectors (credentials omitted)
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const connectors = await db.connector.findMany({
    select: {
      id: true,
      type: true,
      status: true,
      lastSyncAt: true,
      lastSyncStatus: true,
      syncFrequency: true,
      config: true,
      createdAt: true,
      updatedAt: true,
      // credentialsEnc intentionally excluded
    },
    orderBy: { type: "asc" },
  });

  return NextResponse.json(connectors);
}

// POST /api/connectors — create or update a connector
export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as {
    type: ConnectorType;
    credentials: Record<string, string>;
    config?: Record<string, unknown>;
    syncFrequency?: string;
  };

  if (!body.type || !body.credentials) {
    return NextResponse.json({ error: "type and credentials are required" }, { status: 400 });
  }

  const credentialsEnc = encrypt(JSON.stringify(body.credentials));

  const connector = await db.connector.upsert({
    where: { type: body.type },
    create: {
      type: body.type,
      status: "pending",
      credentialsEnc,
      config: body.config ?? {},
      syncFrequency: body.syncFrequency ?? "0 2 * * *",
    },
    update: {
      credentialsEnc,
      status: "pending",
      config: body.config ?? {},
      syncFrequency: body.syncFrequency ?? "0 2 * * *",
    },
    select: {
      id: true,
      type: true,
      status: true,
      syncFrequency: true,
      config: true,
    },
  });

  return NextResponse.json(connector, { status: 201 });
}
```

- [ ] **Step 2: Create `app/api/connectors/[id]/route.ts`**

```typescript
// app/api/connectors/[id]/route.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/connectors/:id — get single connector (no credentials)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const connector = await db.connector.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      type: true,
      status: true,
      lastSyncAt: true,
      lastSyncStatus: true,
      syncFrequency: true,
      config: true,
    },
  });

  if (!connector) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(connector);
}

// DELETE /api/connectors/:id
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.connector.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 3: Create `app/api/connectors/[id]/sync/route.ts`**

```typescript
// app/api/connectors/[id]/sync/route.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { syncQueue } from "@/worker/queue";
import { NextResponse } from "next/server";

// POST /api/connectors/:id/sync — enqueue a manual sync
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const connector = await db.connector.findUnique({
    where: { id: params.id },
    select: { id: true, type: true },
  });

  if (!connector) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const job = await syncQueue.add(
    connector.type,
    { connectorId: connector.id },
    { attempts: 3, backoff: { type: "exponential", delay: 60_000 } }
  );

  return NextResponse.json({ jobId: job.id, status: "queued" });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/connectors/
git commit -m "feat: add connector CRUD API routes and manual sync trigger"
```

---

## Task 6: Google Workspace connector

**Files:**
- Create: `lib/connectors/google.ts`
- Create: `worker/jobs/sync-google.ts`
- Create: `__tests__/lib/connectors/google.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/connectors/google.test.ts
import { describe, it, expect } from "vitest";
import { extractDomainFromUrl } from "@/lib/connectors/google";

describe("extractDomainFromUrl", () => {
  it("extracts domain from a full URL", () => {
    expect(extractDomainFromUrl("https://notion.so/oauth")).toBe("notion.so");
  });

  it("returns the input if it looks like a domain already", () => {
    expect(extractDomainFromUrl("github.com")).toBe("github.com");
  });

  it("handles URLs with paths and query params", () => {
    expect(extractDomainFromUrl("https://app.hubspot.com/oauth/authorize?client_id=123")).toBe("app.hubspot.com");
  });

  it("returns null for blank or invalid input", () => {
    expect(extractDomainFromUrl("")).toBeNull();
    expect(extractDomainFromUrl("not-a-url")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/lib/connectors/google.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/connectors/google'`

- [ ] **Step 3: Create `lib/connectors/google.ts`**

```typescript
// lib/connectors/google.ts
import { google } from "googleapis";
import { decrypt } from "@/lib/crypto";

export interface GoogleCredentials {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

export function createGoogleAuthClient(credentialsEnc: string) {
  const creds: GoogleCredentials = JSON.parse(decrypt(credentialsEnc));
  const auth = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
  auth.setCredentials({ refresh_token: creds.refreshToken });
  return auth;
}

export async function listDirectoryUsers(
  auth: InstanceType<typeof google.auth.OAuth2>
): Promise<Array<{ primaryEmail: string; name: { fullName: string }; orgUnitPath: string }>> {
  const admin = google.admin({ version: "directory_v1", auth });
  const response = await admin.users.list({
    customer: "my_customer",
    maxResults: 500,
    orderBy: "email",
  });
  return (response.data.users ?? []) as Array<{
    primaryEmail: string;
    name: { fullName: string };
    orgUnitPath: string;
  }>;
}

export async function listUserTokens(
  auth: InstanceType<typeof google.auth.OAuth2>,
  userEmail: string
): Promise<Array<{ displayText: string; clientId: string; scopes: string[]; userKey: string }>> {
  const admin = google.admin({ version: "reports_v1", auth });
  try {
    const response = await admin.activities.list({
      userKey: userEmail,
      applicationName: "token",
      eventName: "authorize",
      maxResults: 1000,
    });
    const grants: Array<{
      displayText: string;
      clientId: string;
      scopes: string[];
      userKey: string;
    }> = [];

    for (const activity of response.data.items ?? []) {
      for (const event of activity.events ?? []) {
        const params = event.parameters ?? [];
        const appName =
          params.find((p) => p.name === "app_name")?.value ??
          params.find((p) => p.name === "client_id")?.value ??
          "";
        const clientId = params.find((p) => p.name === "client_id")?.value ?? "";
        const scopes = params.find((p) => p.name === "scope")?.multiValue ?? [];
        if (clientId) {
          grants.push({ displayText: appName, clientId, scopes, userKey: userEmail });
        }
      }
    }
    return grants;
  } catch {
    return []; // user may not have token audit logs
  }
}

export function extractDomainFromUrl(input: string): string | null {
  if (!input) return null;
  try {
    const url = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
    const host = url.hostname;
    // Reject if it looks like an opaque string with no dot (e.g. "not-a-url")
    if (!host.includes(".")) return null;
    return host;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- __tests__/lib/connectors/google.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Create `worker/jobs/sync-google.ts`**

```typescript
// worker/jobs/sync-google.ts
import { db } from "@/lib/db";
import { createGoogleAuthClient, listDirectoryUsers, listUserTokens, extractDomainFromUrl } from "@/lib/connectors/google";
import { calculateRiskScore } from "@/lib/risk";
import { createAlert } from "@/lib/alerts";

export async function handleGoogleSync(connectorId: string) {
  const connector = await db.connector.findUniqueOrThrow({
    where: { id: connectorId },
  });

  if (!connector.credentialsEnc) throw new Error("No credentials configured");

  await db.connector.update({
    where: { id: connectorId },
    data: { status: "active" },
  });

  const auth = createGoogleAuthClient(connector.credentialsEnc);
  const users = await listDirectoryUsers(auth);

  let syncErrors = 0;

  for (const gsuiteUser of users) {
    // Ensure user exists in our DB (upsert by email)
    const dbUser = await db.user.upsert({
      where: { email: gsuiteUser.primaryEmail },
      create: {
        email: gsuiteUser.primaryEmail,
        name: gsuiteUser.name?.fullName ?? gsuiteUser.primaryEmail,
      },
      update: {
        name: gsuiteUser.name?.fullName ?? gsuiteUser.primaryEmail,
      },
    });

    const grants = await listUserTokens(auth, gsuiteUser.primaryEmail);

    for (const grant of grants) {
      // Derive a domain for the app from the clientId (often an OAuth client URL)
      const domain = extractDomainFromUrl(grant.clientId) ?? `oauth:${grant.clientId}`;
      const appName = grant.displayText || domain;

      // Check if app exists; create as shadow if new
      const existingApp = await db.app.findUnique({ where: { domain } });
      let app = existingApp;

      if (!app) {
        const riskScore = calculateRiskScore(grant.scopes);
        app = await db.app.create({
          data: {
            name: appName,
            domain,
            status: "shadow",
            riskScore,
            discoveredBy: "google_workspace",
          },
        });

        await createAlert({
          type: "new_shadow_app",
          severity: riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low",
          payload: { appId: app.id, appName, domain, discoveredFor: gsuiteUser.primaryEmail, riskScore },
        });
      }

      // Upsert AppUser
      await db.appUser.upsert({
        where: { appId_userId: { appId: app.id, userId: dbUser.id } },
        create: {
          appId: app.id,
          userId: dbUser.id,
          grantType: "oauth",
          scopes: grant.scopes,
          isActive: true,
        },
        update: {
          scopes: grant.scopes,
          lastSeen: new Date(),
          isActive: true,
        },
      });
    }
  }

  await db.connector.update({
    where: { id: connectorId },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: syncErrors === 0 ? "success" : "partial",
      status: "active",
    },
  });

  console.log(`[sync-google] Done. ${users.length} users processed.`);
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/connectors/google.ts worker/jobs/sync-google.ts __tests__/lib/connectors/google.test.ts
git commit -m "feat: add Google Workspace connector with OAuth grant sync"
```

---

## Task 7: Microsoft 365 connector

**Files:**
- Create: `lib/connectors/m365.ts`
- Create: `worker/jobs/sync-m365.ts`

- [ ] **Step 1: Create `lib/connectors/m365.ts`**

```typescript
// lib/connectors/m365.ts
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import { ClientSecretCredential } from "@azure/identity";
import { decrypt } from "@/lib/crypto";

export interface M365Credentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export function createM365Client(credentialsEnc: string): Client {
  const creds: M365Credentials = JSON.parse(decrypt(credentialsEnc));
  const credential = new ClientSecretCredential(
    creds.tenantId,
    creds.clientId,
    creds.clientSecret
  );
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });
  return Client.initWithMiddleware({ authProvider });
}

export async function listM365Users(client: Client): Promise<Array<{
  id: string;
  displayName: string;
  mail: string;
  department: string | null;
}>> {
  const response = await client
    .api("/users")
    .select("id,displayName,mail,department")
    .filter("accountEnabled eq true")
    .get();
  return response.value ?? [];
}

export async function listOAuthPermissionGrants(client: Client): Promise<Array<{
  clientId: string;   // service principal object ID
  principalId: string; // user object ID (null if admin consent)
  scope: string;
  consentType: "Principal" | "AllPrincipals";
}>> {
  const response = await client.api("/oauth2PermissionGrants").get();
  return response.value ?? [];
}

export async function listServicePrincipals(client: Client): Promise<Array<{
  id: string;
  displayName: string;
  homepage: string | null;
  appId: string;
}>> {
  const response = await client
    .api("/servicePrincipals")
    .select("id,displayName,homepage,appId")
    .get();
  return response.value ?? [];
}
```

- [ ] **Step 2: Create `worker/jobs/sync-m365.ts`**

```typescript
// worker/jobs/sync-m365.ts
import { db } from "@/lib/db";
import { createM365Client, listM365Users, listOAuthPermissionGrants, listServicePrincipals } from "@/lib/connectors/m365";
import { calculateRiskScore } from "@/lib/risk";
import { createAlert } from "@/lib/alerts";
import { extractDomainFromUrl } from "@/lib/connectors/google";

export async function handleM365Sync(connectorId: string) {
  const connector = await db.connector.findUniqueOrThrow({ where: { id: connectorId } });
  if (!connector.credentialsEnc) throw new Error("No credentials configured");

  const client = createM365Client(connector.credentialsEnc);

  const [m365Users, grants, servicePrincipals] = await Promise.all([
    listM365Users(client),
    listOAuthPermissionGrants(client),
    listServicePrincipals(client),
  ]);

  // Build lookup maps for efficiency
  const spById = new Map(servicePrincipals.map((sp) => [sp.id, sp]));
  const userById = new Map(m365Users.map((u) => [u.id, u]));

  // Ensure all users exist in our DB
  for (const m365User of m365Users) {
    if (!m365User.mail) continue;
    await db.user.upsert({
      where: { email: m365User.mail },
      create: { email: m365User.mail, name: m365User.displayName, department: m365User.department ?? undefined },
      update: { name: m365User.displayName, department: m365User.department ?? undefined },
    });
  }

  for (const grant of grants) {
    const sp = spById.get(grant.clientId);
    if (!sp) continue;

    const domain = extractDomainFromUrl(sp.homepage ?? sp.appId) ?? `msapp:${sp.appId}`;
    const scopes = grant.scope.split(" ").filter(Boolean);

    const existingApp = await db.app.findUnique({ where: { domain } });
    let app = existingApp;

    if (!app) {
      const riskScore = calculateRiskScore(scopes);
      app = await db.app.create({
        data: {
          name: sp.displayName,
          domain,
          status: "shadow",
          riskScore,
          discoveredBy: "microsoft_365",
        },
      });

      await createAlert({
        type: "new_shadow_app",
        severity: riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low",
        payload: { appId: app.id, appName: sp.displayName, domain, riskScore },
      });
    }

    // Individual user grant
    if (grant.consentType === "Principal") {
      const m365User = userById.get(grant.principalId);
      if (!m365User?.mail) continue;

      const dbUser = await db.user.findUnique({ where: { email: m365User.mail } });
      if (!dbUser) continue;

      await db.appUser.upsert({
        where: { appId_userId: { appId: app.id, userId: dbUser.id } },
        create: { appId: app.id, userId: dbUser.id, grantType: "oauth", scopes, isActive: true },
        update: { scopes, lastSeen: new Date(), isActive: true },
      });
    }
  }

  await db.connector.update({
    where: { id: connectorId },
    data: { lastSyncAt: new Date(), lastSyncStatus: "success", status: "active" },
  });

  console.log(`[sync-m365] Done. ${grants.length} grants processed.`);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/connectors/m365.ts worker/jobs/sync-m365.ts
git commit -m "feat: add Microsoft 365 connector with Graph API OAuth grant sync"
```

---

## Task 8: Okta connector

**Files:**
- Create: `lib/connectors/okta.ts`
- Create: `worker/jobs/sync-okta.ts`

- [ ] **Step 1: Create `lib/connectors/okta.ts`**

```typescript
// lib/connectors/okta.ts
import { decrypt } from "@/lib/crypto";

export interface OktaCredentials {
  domain: string;   // e.g. "yourcompany.okta.com"
  apiToken: string;
}

export function getOktaCredentials(credentialsEnc: string): OktaCredentials {
  return JSON.parse(decrypt(credentialsEnc));
}

async function oktaGet<T>(domain: string, apiToken: string, path: string): Promise<T> {
  const response = await fetch(`https://${domain}${path}`, {
    headers: {
      Authorization: `SSWS ${apiToken}`,
      Accept: "application/json",
    },
  });
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("X-Rate-Limit-Reset") ?? "60") * 1000;
    throw Object.assign(new Error("Okta rate limit hit"), { retryAfter });
  }
  if (!response.ok) throw new Error(`Okta API error ${response.status}: ${path}`);
  return response.json() as Promise<T>;
}

export interface OktaApp {
  id: string;
  label: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  settings?: { app?: { url?: string } };
  _links?: { appLinks?: Array<{ href: string }> };
}

export interface OktaUser {
  id: string;
  status: string;
  profile: { email: string; firstName: string; lastName: string; department?: string };
}

export function listApps(domain: string, apiToken: string) {
  return oktaGet<OktaApp[]>(domain, apiToken, "/api/v1/apps?limit=200&filter=status+eq+%22ACTIVE%22");
}

export function listUsers(domain: string, apiToken: string) {
  return oktaGet<OktaUser[]>(domain, apiToken, "/api/v1/users?limit=200&filter=status+eq+%22ACTIVE%22");
}

export function listAppUsers(domain: string, apiToken: string, appId: string) {
  return oktaGet<Array<{ id: string; profile: { email: string } }>>(
    domain,
    apiToken,
    `/api/v1/apps/${appId}/users?limit=200`
  );
}

export function extractAppDomain(app: OktaApp): string {
  const url =
    app._links?.appLinks?.[0]?.href ??
    app.settings?.app?.url ??
    "";
  try {
    return new URL(url).hostname || `okta:${app.id}`;
  } catch {
    return `okta:${app.id}`;
  }
}
```

- [ ] **Step 2: Create `worker/jobs/sync-okta.ts`**

```typescript
// worker/jobs/sync-okta.ts
import { db } from "@/lib/db";
import { getOktaCredentials, listApps, listUsers, listAppUsers, extractAppDomain } from "@/lib/connectors/okta";

export async function handleOktaSync(connectorId: string) {
  const connector = await db.connector.findUniqueOrThrow({ where: { id: connectorId } });
  if (!connector.credentialsEnc) throw new Error("No credentials configured");

  const { domain, apiToken } = getOktaCredentials(connector.credentialsEnc);

  const [oktaApps, oktaUsers] = await Promise.all([
    listApps(domain, apiToken),
    listUsers(domain, apiToken),
  ]);

  // Upsert all Okta users into our DB
  const dbUserByEmail = new Map<string, string>();
  for (const oktaUser of oktaUsers) {
    const email = oktaUser.profile.email;
    if (!email) continue;
    const dbUser = await db.user.upsert({
      where: { email },
      create: {
        email,
        name: `${oktaUser.profile.firstName} ${oktaUser.profile.lastName}`.trim(),
        department: oktaUser.profile.department,
      },
      update: {
        name: `${oktaUser.profile.firstName} ${oktaUser.profile.lastName}`.trim(),
        department: oktaUser.profile.department,
      },
    });
    dbUserByEmail.set(email, dbUser.id);
  }

  for (const oktaApp of oktaApps) {
    const appDomain = extractAppDomain(oktaApp);

    // Okta-managed apps are always "managed" status
    const app = await db.app.upsert({
      where: { domain: appDomain },
      create: {
        name: oktaApp.label,
        domain: appDomain,
        status: "managed",
        riskScore: 0,
        discoveredBy: "okta",
      },
      update: {
        name: oktaApp.label,
        status: "managed",
      },
    });

    const appUsers = await listAppUsers(domain, apiToken, oktaApp.id);
    for (const appUser of appUsers) {
      const email = appUser.profile?.email;
      const userId = email ? dbUserByEmail.get(email) : undefined;
      if (!userId) continue;

      await db.appUser.upsert({
        where: { appId_userId: { appId: app.id, userId } },
        create: { appId: app.id, userId, grantType: "sso", scopes: [], isActive: true },
        update: { lastSeen: new Date(), isActive: true },
      });
    }
  }

  await db.connector.update({
    where: { id: connectorId },
    data: { lastSyncAt: new Date(), lastSyncStatus: "success", status: "active" },
  });

  console.log(`[sync-okta] Done. ${oktaApps.length} apps, ${oktaUsers.length} users processed.`);
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/connectors/okta.ts worker/jobs/sync-okta.ts
git commit -m "feat: add Okta connector with app and user assignment sync"
```

---

## Task 9: 1Password connector

**Files:**
- Create: `lib/connectors/onepassword.ts`
- Create: `worker/jobs/sync-onepassword.ts`

- [ ] **Step 1: Create `lib/connectors/onepassword.ts`**

```typescript
// lib/connectors/onepassword.ts
import { decrypt } from "@/lib/crypto";

export interface OnePasswordCredentials {
  serverUrl: string;  // 1Password Connect server URL
  token: string;      // service account token
}

export function getOnePasswordCredentials(credentialsEnc: string): OnePasswordCredentials {
  return JSON.parse(decrypt(credentialsEnc));
}

async function opGet<T>(serverUrl: string, token: string, path: string): Promise<T> {
  const response = await fetch(`${serverUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`1Password API error ${response.status}: ${path}`);
  return response.json() as Promise<T>;
}

export interface OpVault {
  id: string;
  name: string;
  description?: string;
}

export interface OpItem {
  id: string;
  title: string;
  category: string;
  vault: { id: string };
  urls?: Array<{ href: string; primary?: boolean }>;
  tags?: string[];
}

export interface OpVaultUser {
  id: string;
  email: string;
  name: string;
  type: string;
}

export function listVaults(serverUrl: string, token: string) {
  return opGet<OpVault[]>(serverUrl, token, "/v1/vaults");
}

export function listVaultItems(serverUrl: string, token: string, vaultId: string) {
  return opGet<OpItem[]>(serverUrl, token, `/v1/vaults/${vaultId}/items`);
}

export function extractDomainFromItem(item: OpItem): string | null {
  const primaryUrl = item.urls?.find((u) => u.primary)?.href ?? item.urls?.[0]?.href;
  if (!primaryUrl) return null;
  try {
    return new URL(primaryUrl).hostname;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Create `worker/jobs/sync-onepassword.ts`**

```typescript
// worker/jobs/sync-onepassword.ts
import { db } from "@/lib/db";
import {
  getOnePasswordCredentials,
  listVaults,
  listVaultItems,
  extractDomainFromItem,
} from "@/lib/connectors/onepassword";

export async function handleOnePasswordSync(connectorId: string) {
  const connector = await db.connector.findUniqueOrThrow({ where: { id: connectorId } });
  if (!connector.credentialsEnc) throw new Error("No credentials configured");

  const { serverUrl, token } = getOnePasswordCredentials(connector.credentialsEnc);
  const config = (connector.config ?? {}) as { vaultIds?: string[] };

  const vaults = await listVaults(serverUrl, token);
  const targetVaults = config.vaultIds?.length
    ? vaults.filter((v) => config.vaultIds!.includes(v.id))
    : vaults;

  for (const vault of targetVaults) {
    const items = await listVaultItems(serverUrl, token, vault.id);
    const loginItems = items.filter((item) => item.category === "LOGIN");

    for (const item of loginItems) {
      const domain = extractDomainFromItem(item);
      if (!domain) continue;

      // Upsert the app — 1Password items mean it's a known, managed credential
      await db.app.upsert({
        where: { domain },
        create: {
          name: item.title,
          domain,
          status: "managed",
          riskScore: 0,
          discoveredBy: "onepassword",
        },
        update: {
          name: item.title,
        },
      });
    }
  }

  await db.connector.update({
    where: { id: connectorId },
    data: { lastSyncAt: new Date(), lastSyncStatus: "success", status: "active" },
  });

  console.log(`[sync-1password] Done. ${targetVaults.length} vaults synced.`);
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/connectors/onepassword.ts worker/jobs/sync-onepassword.ts
git commit -m "feat: add 1Password connector — syncs login items as managed apps"
```

---

## Task 10: Card feed connector (Stripe + CSV)

**Files:**
- Create: `lib/connectors/cardfeed.ts`
- Create: `worker/jobs/sync-cardfeed.ts`
- Create: `__tests__/lib/connectors/cardfeed.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/lib/connectors/cardfeed.test.ts
import { describe, it, expect } from "vitest";
import { merchantToDomain, parseCSVTransactions } from "@/lib/connectors/cardfeed";

describe("merchantToDomain", () => {
  it("matches known merchants", () => {
    expect(merchantToDomain("GITHUB*SUBSCRIPTION")).toBe("github.com");
    expect(merchantToDomain("FIGMA INC")).toBe("figma.com");
    expect(merchantToDomain("SLACK TECHNOLOGIES")).toBe("slack.com");
  });

  it("returns null for unknown merchants", () => {
    expect(merchantToDomain("COFFEE SHOP")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(merchantToDomain("Notion Labs")).toBe("notion.so");
  });
});

describe("parseCSVTransactions", () => {
  it("parses a valid CSV string into transaction objects", () => {
    const csv = `date,merchant,amount,currency,cardholder email
2026-04-01,GitHub,49.00,USD,alice@company.com
2026-04-02,Figma,45.00,USD,bob@company.com`;

    const result = parseCSVTransactions(csv);
    expect(result).toHaveLength(2);
    expect(result[0].merchantName).toBe("GitHub");
    expect(result[0].amount).toBe(49);
    expect(result[0].cardholderEmail).toBe("alice@company.com");
    expect(result[1].currency).toBe("USD");
  });

  it("handles missing cardholder email", () => {
    const csv = `date,merchant,amount,currency,cardholder email
2026-04-01,Slack,10.00,USD,`;
    const result = parseCSVTransactions(csv);
    expect(result[0].cardholderEmail).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/lib/connectors/cardfeed.test.ts
```

- [ ] **Step 3: Create `lib/connectors/cardfeed.ts`**

```typescript
// lib/connectors/cardfeed.ts
import { decrypt } from "@/lib/crypto";

export interface StripeCredentials {
  apiKey: string;
}

export function getStripeCredentials(credentialsEnc: string): StripeCredentials {
  return JSON.parse(decrypt(credentialsEnc));
}

export async function fetchStripeCharges(
  apiKey: string,
  since: Date
): Promise<Array<{
  id: string;
  amount: number;
  currency: string;
  created: number;
  description: string | null;
  billing_details: { name: string | null; email: string | null };
}>> {
  const response = await fetch(
    `https://api.stripe.com/v1/charges?created[gte]=${Math.floor(since.getTime() / 1000)}&limit=100`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!response.ok) throw new Error(`Stripe API error: ${response.status}`);
  const data = (await response.json()) as { data: unknown[] };
  return data.data as ReturnType<typeof fetchStripeCharges> extends Promise<infer T> ? T : never;
}

const MERCHANT_DOMAIN_MAP: Record<string, string> = {
  github: "github.com",
  figma: "figma.com",
  notion: "notion.so",
  linear: "linear.app",
  slack: "slack.com",
  zoom: "zoom.us",
  salesforce: "salesforce.com",
  hubspot: "hubspot.com",
  atlassian: "atlassian.com",
  jira: "atlassian.com",
  dropbox: "dropbox.com",
  loom: "loom.com",
  miro: "miro.com",
  airtable: "airtable.com",
  intercom: "intercom.com",
  zendesk: "zendesk.com",
  datadog: "datadoghq.com",
  pagerduty: "pagerduty.com",
  retool: "retool.com",
};

export function merchantToDomain(merchantName: string): string | null {
  const lower = merchantName.toLowerCase();
  for (const [key, domain] of Object.entries(MERCHANT_DOMAIN_MAP)) {
    if (lower.includes(key)) return domain;
  }
  return null;
}

export function parseCSVTransactions(csv: string): Array<{
  date: Date;
  merchantName: string;
  amount: number;
  currency: string;
  cardholderEmail: string | null;
}> {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const get = (key: string) => cols[headers.indexOf(key)] ?? "";
    const email = get("cardholder email");
    return {
      date: new Date(get("date")),
      merchantName: get("merchant"),
      amount: parseFloat(get("amount")),
      currency: get("currency") || "USD",
      cardholderEmail: email || null,
    };
  });
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- __tests__/lib/connectors/cardfeed.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Create `worker/jobs/sync-cardfeed.ts`**

```typescript
// worker/jobs/sync-cardfeed.ts
import { db } from "@/lib/db";
import { getStripeCredentials, fetchStripeCharges, merchantToDomain } from "@/lib/connectors/cardfeed";
import type { ConnectorType } from "@prisma/client";

export async function handleCardFeedSync(connectorId: string, connectorType: ConnectorType) {
  const connector = await db.connector.findUniqueOrThrow({ where: { id: connectorId } });
  if (!connector.credentialsEnc) throw new Error("No credentials configured");

  // Only Stripe is auto-fetched; CSV is handled via upload API (Plan 3)
  if (connectorType === "stripe") {
    await syncStripe(connector.id, connector.credentialsEnc, connector.lastSyncAt);
  }

  await db.connector.update({
    where: { id: connectorId },
    data: { lastSyncAt: new Date(), lastSyncStatus: "success", status: "active" },
  });
}

async function syncStripe(connectorId: string, credentialsEnc: string, since: Date | null) {
  const { apiKey } = getStripeCredentials(credentialsEnc);
  const sinceDate = since ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days back on first sync

  const charges = await fetchStripeCharges(apiKey, sinceDate);

  for (const charge of charges) {
    const merchantName = charge.description ?? charge.billing_details.name ?? "Unknown";
    const domain = merchantToDomain(merchantName);

    // Find matching app if domain is known
    let appId: string | undefined;
    if (domain) {
      const app = await db.app.findUnique({ where: { domain } });
      appId = app?.id;
    }

    // Find employee by billing email
    let employeeId: string | undefined;
    if (charge.billing_details.email) {
      const user = await db.user.findUnique({ where: { email: charge.billing_details.email } });
      employeeId = user?.id;
    }

    await db.spendRecord.create({
      data: {
        appId: appId ?? null,
        amount: charge.amount / 100, // Stripe amounts are in cents
        currency: charge.currency.toUpperCase(),
        period: new Date(charge.created * 1000),
        source: "stripe",
        merchantName,
        employeeId: employeeId ?? null,
      },
    });
  }

  console.log(`[sync-cardfeed] Stripe: ${charges.length} charges ingested.`);
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/connectors/cardfeed.ts worker/jobs/sync-cardfeed.ts __tests__/lib/connectors/cardfeed.test.ts
git commit -m "feat: add card feed connector — Stripe sync and CSV parser"
```

---

## Task 11: Worker entry point

**Files:**
- Create: `worker/index.ts`

- [ ] **Step 1: Create `worker/index.ts`**

```typescript
// worker/index.ts
import "dotenv/config";
import { Worker } from "bullmq";
import { connection } from "./queue";
import { handleGoogleSync } from "./jobs/sync-google";
import { handleM365Sync } from "./jobs/sync-m365";
import { handleOktaSync } from "./jobs/sync-okta";
import { handleOnePasswordSync } from "./jobs/sync-onepassword";
import { handleCardFeedSync } from "./jobs/sync-cardfeed";
import { db } from "@/lib/db";
import type { ConnectorType } from "@prisma/client";

const CARD_FEED_TYPES = new Set<ConnectorType>(["stripe", "brex", "ramp", "csv"]);

const worker = new Worker(
  "connector-sync",
  async (job) => {
    const { connectorId } = job.data as { connectorId: string };
    const jobName = job.name as ConnectorType;

    // Mark connector as syncing
    await db.connector.update({
      where: { id: connectorId },
      data: { status: "active" },
    }).catch(() => null); // connector may have been deleted

    if (jobName === "google_workspace") return handleGoogleSync(connectorId);
    if (jobName === "microsoft_365") return handleM365Sync(connectorId);
    if (jobName === "okta") return handleOktaSync(connectorId);
    if (jobName === "onepassword") return handleOnePasswordSync(connectorId);
    if (CARD_FEED_TYPES.has(jobName)) return handleCardFeedSync(connectorId, jobName);

    throw new Error(`Unknown connector type: ${jobName}`);
  },
  {
    connection,
    concurrency: 2,
    limiter: { max: 5, duration: 60_000 },
  }
);

worker.on("completed", (job) => {
  console.log(`[worker] ✓ ${job.name} (job ${job.id}) completed`);
});

worker.on("failed", async (job, err) => {
  console.error(`[worker] ✗ ${job?.name} failed: ${err.message}`);
  if (job?.data?.connectorId) {
    await db.connector.update({
      where: { id: job.data.connectorId },
      data: { status: "error", lastSyncStatus: "failed" },
    }).catch(() => null);
  }
});

process.on("SIGTERM", async () => {
  await worker.close();
  await connection.quit();
  process.exit(0);
});

console.log("[worker] SaaSGuard worker started. Waiting for jobs...");
```

- [ ] **Step 2: Commit**

```bash
git add worker/index.ts
git commit -m "feat: add BullMQ worker entry point with all connector consumers"
```

---

## Task 12: Run all tests + smoke test

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests passing (crypto × 3, risk × 5, cardfeed × 5, google × 4 = 17 tests).

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start the worker in one terminal**

```bash
npm run worker
```

Expected: `[worker] SaaSGuard worker started. Waiting for jobs...`

- [ ] **Step 4: Start the web server in another terminal**

```bash
npm run dev
```

- [ ] **Step 5: Trigger a manual Google Workspace sync via API**

First get the connector ID (after creating one via the Connectors UI or directly in Prisma Studio):

```bash
npx prisma studio
# Insert a Connector row with type=google_workspace, status=pending
# Copy the id
```

Then trigger a sync:
```bash
curl -X POST http://localhost:3000/api/connectors/<connector-id>/sync \
  -H "Cookie: <your session cookie from browser>"
```

Expected: `{"jobId":"...","status":"queued"}`

Check the worker terminal — you should see the job execute.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: plan 2 complete — all 5 connectors and BullMQ worker operational"
```

---

## What's Next

**Plan 3** — Feature UI: Discovery approve/deny flow, Spend charts, Access matrix and offboarding queue, App Inventory table, Dashboard stat cards, Connectors setup wizard, Settings page.
