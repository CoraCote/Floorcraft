# SaaSGuard Feature UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all feature pages and their backing API routes — Dashboard, Discovery (approve/deny shadow IT), App Inventory (filterable table), Spend (charts + CSV upload), Access (user matrix + offboarding queue), Connectors (setup wizard), and Settings (user/role management).

**Architecture:** Each feature area has an API route layer (server-side auth + Prisma queries) and a page component that fetches from those routes. Shared UI components (table, chart, badges) live in `components/`. All data fetching is `async` server components where possible; interactive parts (approve/deny buttons, forms) are client components. Role-based data scoping happens in the API routes — managers only see their department's data.

**Prerequisites:** Plans 1 and 2 complete. Prisma schema migrated. At least one connector synced so there is data to display.

**Tech Stack:** TanStack Table v8, Recharts, shadcn/ui (Dialog, Select, Badge, Table, Form), React Hook Form, Zod

---

## File Map

```
~/saasguard/
├── app/
│   ├── api/
│   │   ├── apps/
│   │   │   ├── route.ts                  # GET (list + filter by status/category/search)
│   │   │   └── [id]/route.ts             # PATCH (status change: approve/deny)
│   │   ├── spend/
│   │   │   ├── route.ts                  # GET (monthly summary + records list)
│   │   │   └── upload/route.ts           # POST (CSV card transaction upload)
│   │   ├── access/
│   │   │   ├── route.ts                  # GET (user → apps list, dept-scoped for managers)
│   │   │   └── offboarding/route.ts      # GET (deactivated users with active AppUser rows)
│   │   ├── alerts/
│   │   │   ├── route.ts                  # GET (unresolved alerts, count)
│   │   │   └── [id]/route.ts             # PATCH (resolve)
│   │   └── users/
│   │       ├── route.ts                  # GET (all users, admin only)
│   │       └── [id]/route.ts             # PUT (update role + department)
│   └── (dashboard)/
│       ├── dashboard/page.tsx            # stat cards + recent shadow apps + top spend
│       ├── discovery/page.tsx            # shadow app list + approve/deny
│       ├── inventory/page.tsx            # full app table (TanStack Table)
│       ├── spend/
│       │   └── page.tsx                  # spend trend chart + records table
│       ├── access/page.tsx               # user-app matrix + offboarding queue tab
│       ├── connectors/page.tsx           # connector cards + credential form
│       └── settings/page.tsx             # user list + role assignment
├── components/
│   ├── app-status-badge.tsx              # colored badge for shadow/review/managed/denied
│   ├── risk-badge.tsx                    # red/yellow/green risk score chip
│   ├── apps-table.tsx                    # TanStack Table for App Inventory
│   ├── spend-chart.tsx                   # Recharts monthly bar chart
│   ├── connector-card.tsx                # status card for each connector
│   └── connector-form.tsx                # credential form (per connector type)
└── __tests__/
    └── api/
        ├── apps.test.ts
        └── spend.test.ts
```

---

## Task 1: Install UI dependencies

**Files:** `package.json`

- [ ] **Step 1: Install TanStack Table, Recharts, React Hook Form, Zod**

```bash
npm install @tanstack/react-table recharts react-hook-form zod @hookform/resolvers
```

- [ ] **Step 2: Add shadcn/ui components needed for forms and dialogs**

```bash
npx shadcn@latest add dialog select form input label textarea alert tabs card
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json components/ui/
git commit -m "chore: install TanStack Table, Recharts, React Hook Form, Zod"
```

---

## Task 2: Shared badge components

**Files:**
- Create: `components/app-status-badge.tsx`
- Create: `components/risk-badge.tsx`

- [ ] **Step 1: Create `components/app-status-badge.tsx`**

```typescript
// components/app-status-badge.tsx
import { Badge } from "@/components/ui/badge";
import type { AppStatus } from "@prisma/client";

const STATUS_CONFIG: Record<AppStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  shadow: { label: "Shadow IT", variant: "destructive" },
  review: { label: "In Review", variant: "secondary" },
  managed: { label: "Managed", variant: "default" },
  denied: { label: "Denied", variant: "outline" },
};

export function AppStatusBadge({ status }: { status: AppStatus }) {
  const { label, variant } = STATUS_CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
```

- [ ] **Step 2: Create `components/risk-badge.tsx`**

```typescript
// components/risk-badge.tsx
import { cn } from "@/lib/utils";

export function RiskBadge({ score }: { score: number }) {
  const label = score >= 70 ? "High" : score >= 40 ? "Medium" : "Low";
  const color =
    score >= 70
      ? "bg-red-100 text-red-700 border-red-200"
      : score >= 40
      ? "bg-yellow-100 text-yellow-700 border-yellow-200"
      : "bg-green-100 text-green-700 border-green-200";

  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", color)}>
      {label} ({score})
    </span>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/app-status-badge.tsx components/risk-badge.tsx
git commit -m "feat: add AppStatusBadge and RiskBadge shared components"
```

---

## Task 3: Apps API routes

**Files:**
- Create: `app/api/apps/route.ts`
- Create: `app/api/apps/[id]/route.ts`
- Create: `__tests__/api/apps.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/api/apps.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma and auth before importing route handlers
vi.mock("@/lib/db", () => ({
  db: {
    app: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { GET } from "@/app/api/apps/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(db.app.findMany);

describe("GET /api/apps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "u1", email: "admin@co.com", role: "admin", department: null, name: "Admin", image: null },
      expires: "",
    } as never);
  });

  it("returns 403 if not logged in", async () => {
    mockAuth.mockResolvedValueOnce(null as never);
    const response = await GET(new Request("http://localhost/api/apps"));
    expect(response.status).toBe(403);
  });

  it("calls findMany and returns apps", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "a1", name: "Notion", domain: "notion.so", status: "shadow", riskScore: 60 },
    ] as never);
    const response = await GET(new Request("http://localhost/api/apps"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Notion");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/api/apps.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/apps/route'`

- [ ] **Step 3: Create `app/api/apps/route.ts`**

```typescript
// app/api/apps/route.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import type { AppStatus } from "@prisma/client";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as AppStatus | null;
  const category = searchParams.get("category");
  const search = searchParams.get("search");

  // Managers only see apps used by their department
  const deptFilter =
    session.user.role === "manager" && session.user.department
      ? {
          appUsers: {
            some: {
              user: { department: session.user.department },
              isActive: true,
            },
          },
        }
      : {};

  const apps = await db.app.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(search
        ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { domain: { contains: search, mode: "insensitive" } }] }
        : {}),
      ...deptFilter,
    },
    select: {
      id: true,
      name: true,
      domain: true,
      category: true,
      status: true,
      riskScore: true,
      discoveredAt: true,
      discoveredBy: true,
      _count: { select: { appUsers: { where: { isActive: true } } } },
    },
    orderBy: [{ status: "asc" }, { riskScore: "desc" }],
  });

  return NextResponse.json(apps);
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- __tests__/api/apps.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Create `app/api/apps/[id]/route.ts`**

```typescript
// app/api/apps/[id]/route.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import type { AppStatus } from "@prisma/client";

const ALLOWED_STATUS_TRANSITIONS: Record<AppStatus, AppStatus[]> = {
  shadow: ["review", "managed", "denied"],
  review: ["managed", "denied", "shadow"],
  managed: ["denied"],
  denied: ["managed", "review"],
};

// PATCH /api/apps/:id — update status (approve/deny/review)
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { status?: AppStatus; category?: string; notes?: string };

  const app = await db.app.findUnique({ where: { id: params.id } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.status) {
    const allowed = ALLOWED_STATUS_TRANSITIONS[app.status];
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Cannot transition from ${app.status} to ${body.status}` },
        { status: 400 }
      );
    }
  }

  const updated = await db.app.update({
    where: { id: params.id },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(body.category ? { category: body.category } : {}),
    },
    select: { id: true, name: true, status: true, category: true, riskScore: true },
  });

  return NextResponse.json(updated);
}

// GET /api/apps/:id — single app with users
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const app = await db.app.findUnique({
    where: { id: params.id },
    include: {
      appUsers: {
        where: { isActive: true },
        include: { user: { select: { id: true, email: true, name: true, department: true } } },
        orderBy: { lastSeen: "desc" },
      },
      licenses: true,
      spendRecords: { orderBy: { period: "desc" }, take: 12 },
    },
  });

  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(app);
}
```

- [ ] **Step 6: Commit**

```bash
git add app/api/apps/ __tests__/api/apps.test.ts
git commit -m "feat: add /api/apps list and approve/deny PATCH route"
```

---

## Task 4: Spend API routes

**Files:**
- Create: `app/api/spend/route.ts`
- Create: `app/api/spend/upload/route.ts`
- Create: `__tests__/api/spend.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/spend.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    spendRecord: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { GET } from "@/app/api/spend/route";

const mockAuth = vi.mocked(auth);

describe("GET /api/spend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "u1", email: "admin@co.com", role: "finance", department: null, name: "Fin", image: null },
      expires: "",
    } as never);
  });

  it("returns 403 if not logged in", async () => {
    mockAuth.mockResolvedValueOnce(null as never);
    const response = await GET(new Request("http://localhost/api/spend"));
    expect(response.status).toBe(403);
  });

  it("returns 200 for finance role", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.spendRecord.findMany).mockResolvedValue([] as never);
    const response = await GET(new Request("http://localhost/api/spend"));
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/api/spend.test.ts
```

- [ ] **Step 3: Create `app/api/spend/route.ts`**

```typescript
// app/api/spend/route.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/spend?months=12&department=Engineering
export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role === "manager" && !session.user.department) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const months = Number(searchParams.get("months") ?? "12");
  const department = searchParams.get("department");

  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const deptFilter =
    session.user.role === "manager"
      ? { department: session.user.department ?? undefined }
      : department
      ? { department }
      : {};

  const records = await db.spendRecord.findMany({
    where: {
      period: { gte: since },
      ...deptFilter,
    },
    include: {
      app: { select: { id: true, name: true, domain: true, category: true } },
    },
    orderBy: { period: "desc" },
  });

  // Group into monthly totals for chart
  const monthlyTotals = records.reduce<Record<string, number>>((acc, r) => {
    const key = r.period.toISOString().slice(0, 7); // "2026-03"
    acc[key] = (acc[key] ?? 0) + Number(r.amount);
    return acc;
  }, {});

  // Group by app for top-spend table
  const byApp = records.reduce<Record<string, { name: string; total: number }>>((acc, r) => {
    const key = r.appId ?? r.merchantName;
    const name = r.app?.name ?? r.merchantName;
    acc[key] = { name, total: (acc[key]?.total ?? 0) + Number(r.amount) };
    return acc;
  }, {});

  const topApps = Object.entries(byApp)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 20)
    .map(([id, data]) => ({ id, ...data }));

  return NextResponse.json({ records, monthlyTotals, topApps });
}
```

- [ ] **Step 4: Create `app/api/spend/upload/route.ts`**

```typescript
// app/api/spend/upload/route.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { parseCSVTransactions, merchantToDomain } from "@/lib/connectors/cardfeed";
import { NextResponse } from "next/server";

// POST /api/spend/upload — accept CSV card transaction file
export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const text = await file.text();
  const transactions = parseCSVTransactions(text);

  let imported = 0;
  let skipped = 0;

  for (const tx of transactions) {
    if (isNaN(tx.amount) || !tx.merchantName) { skipped++; continue; }

    const domain = merchantToDomain(tx.merchantName);
    let appId: string | null = null;
    if (domain) {
      const app = await db.app.findUnique({ where: { domain } });
      appId = app?.id ?? null;
    }

    let employeeId: string | null = null;
    if (tx.cardholderEmail) {
      const user = await db.user.findUnique({ where: { email: tx.cardholderEmail } });
      employeeId = user?.id ?? null;
    }

    await db.spendRecord.create({
      data: {
        appId,
        amount: tx.amount,
        currency: tx.currency,
        period: tx.date,
        source: "csv",
        merchantName: tx.merchantName,
        employeeId,
      },
    });
    imported++;
  }

  return NextResponse.json({ imported, skipped });
}
```

- [ ] **Step 5: Run test — expect PASS**

```bash
npm test -- __tests__/api/spend.test.ts
```

Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add app/api/spend/ __tests__/api/spend.test.ts
git commit -m "feat: add spend API routes — monthly summary and CSV upload"
```

---

## Task 5: Access + Alerts + Users API routes

**Files:**
- Create: `app/api/access/route.ts`
- Create: `app/api/access/offboarding/route.ts`
- Create: `app/api/alerts/route.ts`
- Create: `app/api/alerts/[id]/route.ts`
- Create: `app/api/users/route.ts`
- Create: `app/api/users/[id]/route.ts`

- [ ] **Step 1: Create `app/api/access/route.ts`**

```typescript
// app/api/access/route.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/access?userId=&appId= — user→app matrix
export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role === "finance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const appId = searchParams.get("appId");

  const deptFilter =
    session.user.role === "manager" && session.user.department
      ? { user: { department: session.user.department } }
      : {};

  const appUsers = await db.appUser.findMany({
    where: {
      isActive: true,
      ...(userId ? { userId } : {}),
      ...(appId ? { appId } : {}),
      ...deptFilter,
    },
    include: {
      user: { select: { id: true, email: true, name: true, department: true } },
      app: { select: { id: true, name: true, domain: true, status: true } },
    },
    orderBy: { lastSeen: "desc" },
    take: 200,
  });

  // Flag stale access: lastSeen > 90 days ago
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const withStaleFlag = appUsers.map((au) => ({
    ...au,
    isStale: au.lastSeen < ninetyDaysAgo,
  }));

  return NextResponse.json(withStaleFlag);
}
```

- [ ] **Step 2: Create `app/api/access/offboarding/route.ts`**

```typescript
// app/api/access/offboarding/route.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/access/offboarding
// Returns users who have no active session in Okta/GWS (isActive=false on User)
// but still have active AppUser rows — these need access revocation.
// We detect "departed" users as those where ALL their AppUser rows have isActive=true
// but they have not been seen in any connector sync in the last 30 days.
export async function GET() {
  const session = await auth();
  if (!session || !["admin", "manager"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Find users who have active AppUser rows but their lastSeen is old across ALL their apps
  const staleUsers = await db.user.findMany({
    where: {
      appUsers: {
        some: {
          isActive: true,
          lastSeen: { lt: thirtyDaysAgo },
        },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      department: true,
      appUsers: {
        where: { isActive: true },
        select: {
          id: true,
          lastSeen: true,
          grantType: true,
          app: { select: { id: true, name: true, domain: true } },
        },
      },
    },
    take: 50,
  });

  return NextResponse.json(staleUsers);
}
```

- [ ] **Step 3: Create `app/api/alerts/route.ts`**

```typescript
// app/api/alerts/route.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/alerts — unresolved alerts for admin
export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const countOnly = searchParams.get("count") === "true";

  if (countOnly) {
    const count = await db.alert.count({ where: { resolvedAt: null } });
    return NextResponse.json({ count });
  }

  const alerts = await db.alert.findMany({
    where: { resolvedAt: null },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  return NextResponse.json(alerts);
}
```

- [ ] **Step 4: Create `app/api/alerts/[id]/route.ts`**

```typescript
// app/api/alerts/[id]/route.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// PATCH /api/alerts/:id — resolve alert
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await db.alert.update({
    where: { id: params.id },
    data: { resolvedAt: new Date() },
  });

  return NextResponse.json(updated);
}
```

- [ ] **Step 5: Create `app/api/users/route.ts`**

```typescript
// app/api/users/route.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/users — list all users (admin only)
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      department: true,
      createdAt: true,
      _count: { select: { appUsers: { where: { isActive: true } } } },
    },
    orderBy: { email: "asc" },
  });

  return NextResponse.json(users);
}
```

- [ ] **Step 6: Create `app/api/users/[id]/route.ts`**

```typescript
// app/api/users/[id]/route.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";

// PUT /api/users/:id — update role and/or department
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { role?: UserRole; department?: string };

  const updated = await db.user.update({
    where: { id: params.id },
    data: {
      ...(body.role ? { role: body.role } : {}),
      ...(body.department !== undefined ? { department: body.department } : {}),
    },
    select: { id: true, email: true, name: true, role: true, department: true },
  });

  return NextResponse.json(updated);
}
```

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/api/access/ app/api/alerts/ app/api/users/
git commit -m "feat: add access, alerts, and users API routes"
```

---

## Task 6: Dashboard page

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Replace `app/(dashboard)/dashboard/page.tsx`**

```typescript
// app/(dashboard)/dashboard/page.tsx
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppStatusBadge } from "@/components/app-status-badge";
import { RiskBadge } from "@/components/risk-badge";
import { formatDistanceToNow } from "date-fns";

async function getStats() {
  const [totalApps, shadowApps, unresolvedAlerts, offboardingCount] = await Promise.all([
    db.app.count(),
    db.app.count({ where: { status: "shadow" } }),
    db.alert.count({ where: { resolvedAt: null } }),
    db.user.count({
      where: {
        appUsers: {
          some: {
            isActive: true,
            lastSeen: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
      },
    }),
  ]);

  const monthlySpend = await db.spendRecord.aggregate({
    _sum: { amount: true },
    where: {
      period: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
    },
  });

  return {
    totalApps,
    shadowApps,
    unresolvedAlerts,
    offboardingCount,
    monthlySpend: Number(monthlySpend._sum.amount ?? 0),
  };
}

async function getRecentShadowApps() {
  return db.app.findMany({
    where: { status: { in: ["shadow", "review"] } },
    orderBy: { discoveredAt: "desc" },
    take: 5,
    select: {
      id: true,
      name: true,
      domain: true,
      status: true,
      riskScore: true,
      discoveredAt: true,
      _count: { select: { appUsers: { where: { isActive: true } } } },
    },
  });
}

async function getTopSpend() {
  const records = await db.spendRecord.findMany({
    where: { period: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    include: { app: { select: { name: true } } },
  });
  const byApp = records.reduce<Record<string, { name: string; total: number }>>((acc, r) => {
    const key = r.appId ?? r.merchantName;
    const name = r.app?.name ?? r.merchantName;
    acc[key] = { name, total: (acc[key]?.total ?? 0) + Number(r.amount) };
    return acc;
  }, {});
  return Object.values(byApp).sort((a, b) => b.total - a.total).slice(0, 5);
}

export default async function DashboardPage() {
  const [stats, recentShadow, topSpend] = await Promise.all([
    getStats(),
    getRecentShadowApps(),
    getTopSpend(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Your SaaS estate at a glance</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Apps", value: stats.totalApps, sub: "Discovered" },
          { label: "Shadow IT", value: stats.shadowApps, sub: "Needs review", warn: stats.shadowApps > 0 },
          { label: "Monthly Spend", value: `$${(stats.monthlySpend / 1000).toFixed(1)}k`, sub: "This month" },
          { label: "Offboarding Risk", value: stats.offboardingCount, sub: "Active access", warn: stats.offboardingCount > 0 },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.warn ? "text-red-600" : "text-slate-900"}`}>
              {card.value}
            </p>
            <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent shadow apps */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Recent Shadow IT</h2>
          {recentShadow.length === 0 ? (
            <p className="text-sm text-slate-400">No shadow apps found — great!</p>
          ) : (
            <div className="space-y-2">
              {recentShadow.map((app) => (
                <div key={app.id} className="flex items-center justify-between p-2 rounded-md bg-slate-50">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{app.name}</p>
                    <p className="text-xs text-slate-500">
                      {app._count.appUsers} users · {formatDistanceToNow(app.discoveredAt, { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <RiskBadge score={app.riskScore} />
                    <AppStatusBadge status={app.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top spend */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Top Spend This Month</h2>
          {topSpend.length === 0 ? (
            <p className="text-sm text-slate-400">No spend data yet. Connect a card feed in Connectors.</p>
          ) : (
            <div className="space-y-3">
              {topSpend.map((item) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="text-sm text-slate-700 flex-1 truncate">{item.name}</span>
                  <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${(item.total / topSpend[0].total) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-slate-900 w-20 text-right">
                    ${item.total.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Install `date-fns`**

```bash
npm install date-fns
```

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/dashboard/page.tsx package.json package-lock.json
git commit -m "feat: build dashboard page with stat cards, shadow IT feed, top spend"
```

---

## Task 7: Discovery page

**Files:**
- Create: `components/approve-deny-buttons.tsx`
- Modify: `app/(dashboard)/discovery/page.tsx`

- [ ] **Step 1: Create `components/approve-deny-buttons.tsx`**

This is a client component — it calls the PATCH API and refreshes the router.

```typescript
// components/approve-deny-buttons.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, X, Clock } from "lucide-react";

export function ApproveDenyButtons({ appId, currentStatus }: { appId: string; currentStatus: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function transition(status: "managed" | "denied" | "review") {
    setLoading(true);
    try {
      const res = await fetch(`/api/apps/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (currentStatus === "managed") {
    return <span className="text-xs text-slate-400">Approved</span>;
  }
  if (currentStatus === "denied") {
    return (
      <Button size="sm" variant="outline" disabled={loading} onClick={() => transition("review")}>
        <Clock className="w-3 h-3 mr-1" /> Re-review
      </Button>
    );
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={loading} onClick={() => transition("managed")}>
        <Check className="w-3 h-3 mr-1" /> Approve
      </Button>
      <Button size="sm" variant="destructive" disabled={loading} onClick={() => transition("denied")}>
        <X className="w-3 h-3 mr-1" /> Deny
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Replace `app/(dashboard)/discovery/page.tsx`**

```typescript
// app/(dashboard)/discovery/page.tsx
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { RiskBadge } from "@/components/risk-badge";
import { AppStatusBadge } from "@/components/app-status-badge";
import { ApproveDenyButtons } from "@/components/approve-deny-buttons";
import { formatDistanceToNow } from "date-fns";

export default async function DiscoveryPage() {
  const session = await auth();

  const apps = await db.app.findMany({
    where: { status: { in: ["shadow", "review"] } },
    orderBy: [{ riskScore: "desc" }, { discoveredAt: "desc" }],
    select: {
      id: true,
      name: true,
      domain: true,
      status: true,
      riskScore: true,
      discoveredAt: true,
      discoveredBy: true,
      appUsers: {
        where: { isActive: true },
        select: { user: { select: { email: true, department: true } }, scopes: true, lastSeen: true },
        take: 3,
      },
      _count: { select: { appUsers: { where: { isActive: true } } } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Discovery</h1>
        <p className="text-sm text-slate-500">{apps.length} apps awaiting review</p>
      </div>

      {apps.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg font-medium">No shadow apps found</p>
          <p className="text-sm mt-1">Connect Google Workspace or Microsoft 365 to start discovering apps.</p>
        </div>
      )}

      <div className="space-y-3">
        {apps.map((app) => (
          <div key={app.id} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-semibold text-slate-900">{app.name}</h2>
                  <AppStatusBadge status={app.status} />
                  <RiskBadge score={app.riskScore} />
                </div>
                <p className="text-xs text-slate-500">{app.domain}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Found via {app.discoveredBy?.replace("_", " ")} ·{" "}
                  {formatDistanceToNow(app.discoveredAt, { addSuffix: true })} ·{" "}
                  {app._count.appUsers} active {app._count.appUsers === 1 ? "user" : "users"}
                </p>
                {app.appUsers.length > 0 && (
                  <div className="mt-2 flex gap-1 flex-wrap">
                    {app.appUsers.map((au) => (
                      <span key={au.user.email} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {au.user.email}
                      </span>
                    ))}
                    {app._count.appUsers > 3 && (
                      <span className="text-xs text-slate-400">+{app._count.appUsers - 3} more</span>
                    )}
                  </div>
                )}
              </div>
              {session?.user.role === "admin" && (
                <ApproveDenyButtons appId={app.id} currentStatus={app.status} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/discovery/ components/approve-deny-buttons.tsx
git commit -m "feat: build Discovery page with approve/deny actions"
```

---

## Task 8: App Inventory page

**Files:**
- Create: `components/apps-table.tsx`
- Modify: `app/(dashboard)/inventory/page.tsx`

- [ ] **Step 1: Create `components/apps-table.tsx`**

```typescript
// components/apps-table.tsx
"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { AppStatusBadge } from "./app-status-badge";
import { RiskBadge } from "./risk-badge";
import { Input } from "@/components/ui/input";

type AppRow = {
  id: string;
  name: string;
  domain: string;
  category: string | null;
  status: "shadow" | "review" | "managed" | "denied";
  riskScore: number;
  _count: { appUsers: number };
  discoveredAt: string;
};

const col = createColumnHelper<AppRow>();

const columns = [
  col.accessor("name", { header: "App", cell: (i) => (
    <div>
      <p className="font-medium text-slate-900">{i.getValue()}</p>
      <p className="text-xs text-slate-400">{i.row.original.domain}</p>
    </div>
  )}),
  col.accessor("status", { header: "Status", cell: (i) => <AppStatusBadge status={i.getValue()} /> }),
  col.accessor("riskScore", { header: "Risk", cell: (i) => <RiskBadge score={i.getValue()} /> }),
  col.accessor("_count.appUsers", { header: "Users", cell: (i) => i.getValue() }),
  col.accessor("category", { header: "Category", cell: (i) => i.getValue() ?? "—" }),
  col.accessor("discoveredAt", {
    header: "Discovered",
    cell: (i) => new Date(i.getValue()).toLocaleDateString(),
  }),
];

export function AppsTable({ data }: { data: AppRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search apps..."
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        className="max-w-xs"
      />
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide cursor-pointer select-none"
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === "asc" ? " ↑" : h.column.getIsSorted() === "desc" ? " ↓" : ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {table.getRowModel().rows.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">No apps found</div>
        )}
      </div>
      <p className="text-xs text-slate-400">{table.getFilteredRowModel().rows.length} apps</p>
    </div>
  );
}
```

- [ ] **Step 2: Replace `app/(dashboard)/inventory/page.tsx`**

```typescript
// app/(dashboard)/inventory/page.tsx
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { AppsTable } from "@/components/apps-table";

export default async function InventoryPage() {
  const session = await auth();

  const deptFilter =
    session?.user.role === "manager" && session.user.department
      ? { appUsers: { some: { user: { department: session.user.department }, isActive: true } } }
      : {};

  const apps = await db.app.findMany({
    where: deptFilter,
    select: {
      id: true,
      name: true,
      domain: true,
      category: true,
      status: true,
      riskScore: true,
      discoveredAt: true,
      _count: { select: { appUsers: { where: { isActive: true } } } },
    },
    orderBy: [{ status: "asc" }, { riskScore: "desc" }],
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">App Inventory</h1>
        <p className="text-sm text-slate-500">{apps.length} apps discovered</p>
      </div>
      <AppsTable data={apps.map((a) => ({ ...a, discoveredAt: a.discoveredAt.toISOString() }))} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/inventory/ components/apps-table.tsx
git commit -m "feat: build App Inventory page with sortable/searchable TanStack Table"
```

---

## Task 9: Spend page

**Files:**
- Create: `components/spend-chart.tsx`
- Modify: `app/(dashboard)/spend/page.tsx`

- [ ] **Step 1: Create `components/spend-chart.tsx`**

```typescript
// components/spend-chart.tsx
"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type MonthlyData = { month: string; total: number };

export function SpendChart({ data }: { data: MonthlyData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        No spend data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
        <YAxis
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          formatter={(value: number) => [`$${value.toLocaleString()}`, "Spend"]}
          contentStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Replace `app/(dashboard)/spend/page.tsx`**

```typescript
// app/(dashboard)/spend/page.tsx
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { SpendChart } from "@/components/spend-chart";

export default async function SpendPage() {
  const session = await auth();

  const deptFilter =
    session?.user.role === "manager" && session?.user.department
      ? { department: session.user.department }
      : {};

  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const records = await db.spendRecord.findMany({
    where: { period: { gte: since }, ...deptFilter },
    include: { app: { select: { name: true } } },
    orderBy: { period: "desc" },
  });

  // Monthly totals for chart
  const monthlyMap = records.reduce<Record<string, number>>((acc, r) => {
    const key = r.period.toISOString().slice(0, 7);
    acc[key] = (acc[key] ?? 0) + Number(r.amount);
    return acc;
  }, {});
  const chartData = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total }));

  // Top apps by total spend
  const byApp = records.reduce<Record<string, { name: string; total: number }>>((acc, r) => {
    const key = r.appId ?? r.merchantName;
    const name = r.app?.name ?? r.merchantName;
    acc[key] = { name, total: (acc[key]?.total ?? 0) + Number(r.amount) };
    return acc;
  }, {});
  const topApps = Object.values(byApp).sort((a, b) => b.total - a.total).slice(0, 10);

  const totalSpend = records.reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Spend</h1>
          <p className="text-sm text-slate-500">
            ${totalSpend.toLocaleString()} total in the last 12 months
          </p>
        </div>
        {session?.user.role === "admin" && (
          <a
            href="/spend/upload"
            className="text-sm text-indigo-600 hover:underline"
          >
            Upload CSV
          </a>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Monthly Trend</h2>
        <SpendChart data={chartData} />
      </div>

      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Top Apps by Spend</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">App</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {topApps.map((app) => (
              <tr key={app.name} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-900">{app.name}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">
                  ${app.total.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {topApps.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            No spend data yet. Connect a card feed or upload a CSV.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/spend/ components/spend-chart.tsx
git commit -m "feat: build Spend page with monthly bar chart and top-apps table"
```

---

## Task 10: Access page

**Files:**
- Modify: `app/(dashboard)/access/page.tsx`

- [ ] **Step 1: Replace `app/(dashboard)/access/page.tsx`**

```typescript
// app/(dashboard)/access/page.tsx
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { formatDistanceToNow } from "date-fns";

export default async function AccessPage() {
  const session = await auth();

  const deptFilter =
    session?.user.role === "manager" && session?.user.department
      ? { user: { department: session.user.department } }
      : {};

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [activeAccess, offboardingRisk] = await Promise.all([
    db.appUser.findMany({
      where: { isActive: true, ...deptFilter },
      include: {
        user: { select: { id: true, email: true, name: true, department: true } },
        app: { select: { id: true, name: true, domain: true, status: true } },
      },
      orderBy: { lastSeen: "desc" },
      take: 100,
    }),
    db.user.findMany({
      where: {
        appUsers: { some: { isActive: true, lastSeen: { lt: thirtyDaysAgo }, ...deptFilter } },
      },
      select: {
        id: true,
        email: true,
        name: true,
        department: true,
        appUsers: {
          where: { isActive: true },
          select: { app: { select: { name: true, domain: true } }, lastSeen: true },
        },
      },
      take: 20,
    }),
  ]);

  const staleAccess = activeAccess.filter((au) => au.lastSeen < ninetyDaysAgo);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Access</h1>
        <p className="text-sm text-slate-500">
          {activeAccess.length} active grants · {staleAccess.length} stale · {offboardingRisk.length} offboarding risk
        </p>
      </div>

      {/* Offboarding queue */}
      {offboardingRisk.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-red-800 mb-3">
            Offboarding Risk ({offboardingRisk.length})
          </h2>
          <div className="space-y-2">
            {offboardingRisk.map((user) => (
              <div key={user.id} className="bg-white rounded-md p-3 border border-red-100">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </div>
                  <span className="text-xs text-red-600 font-medium">
                    {user.appUsers.length} active apps
                  </span>
                </div>
                <div className="mt-2 flex gap-1 flex-wrap">
                  {user.appUsers.map((au) => (
                    <span key={au.app.name} className="text-xs bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-full">
                      {au.app.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active access table */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Active Access</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">User</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">App</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">Last Seen</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">Grant</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activeAccess.map((au) => (
              <tr key={au.id} className={`hover:bg-slate-50 ${au.lastSeen < ninetyDaysAgo ? "bg-yellow-50" : ""}`}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{au.user.name}</p>
                  <p className="text-xs text-slate-400">{au.user.email}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-slate-900">{au.app.name}</p>
                  <p className="text-xs text-slate-400">{au.app.domain}</p>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {formatDistanceToNow(au.lastSeen, { addSuffix: true })}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">
                    {au.grantType}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {au.lastSeen < ninetyDaysAgo ? (
                    <span className="text-xs text-yellow-700 font-medium">Stale</span>
                  ) : (
                    <span className="text-xs text-green-700">Active</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(dashboard\)/access/
git commit -m "feat: build Access page with offboarding queue and stale access flags"
```

---

## Task 11: Connectors page

**Files:**
- Create: `components/connector-card.tsx`
- Create: `components/connector-form.tsx`
- Modify: `app/(dashboard)/connectors/page.tsx`

- [ ] **Step 1: Create `components/connector-card.tsx`**

```typescript
// components/connector-card.tsx
import type { ConnectorType, ConnectorStatus } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";

const CONNECTOR_META: Record<ConnectorType, { label: string; description: string }> = {
  google_workspace: { label: "Google Workspace", description: "OAuth app grants via Admin SDK" },
  microsoft_365: { label: "Microsoft 365", description: "OAuth grants via Microsoft Graph API" },
  okta: { label: "Okta", description: "SSO app assignments and user directory" },
  onepassword: { label: "1Password", description: "Shared vault items as managed apps" },
  stripe: { label: "Stripe", description: "Card charges as SaaS spend records" },
  brex: { label: "Brex", description: "Corporate card transactions" },
  ramp: { label: "Ramp", description: "Corporate card transactions" },
  csv: { label: "CSV Upload", description: "Manual card transaction import" },
};

const STATUS_COLOR: Record<ConnectorStatus, string> = {
  active: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  disconnected: "bg-slate-100 text-slate-500",
  pending: "bg-yellow-100 text-yellow-700",
};

type ConnectorRow = {
  id: string;
  type: ConnectorType;
  status: ConnectorStatus;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
};

export function ConnectorCard({ connector }: { connector: ConnectorRow }) {
  const meta = CONNECTOR_META[connector.type];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-slate-900">{meta.label}</h3>
          <p className="text-xs text-slate-400">{meta.description}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[connector.status]}`}>
          {connector.status}
        </span>
      </div>
      {connector.lastSyncAt && (
        <p className="text-xs text-slate-400 mt-2">
          Last synced {formatDistanceToNow(new Date(connector.lastSyncAt), { addSuffix: true })}
          {connector.lastSyncStatus === "failed" && " — sync failed"}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/connector-form.tsx`**

```typescript
// components/connector-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConnectorType } from "@prisma/client";

type FieldDef = { key: string; label: string; placeholder: string; type?: string };

const CONNECTOR_FIELDS: Record<string, FieldDef[]> = {
  google_workspace: [
    { key: "clientId", label: "OAuth Client ID", placeholder: "1234567890-abc.apps.googleusercontent.com" },
    { key: "clientSecret", label: "OAuth Client Secret", placeholder: "GOCSPX-..." },
    { key: "refreshToken", label: "Refresh Token", placeholder: "1//0g...", type: "password" },
  ],
  microsoft_365: [
    { key: "tenantId", label: "Tenant ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
    { key: "clientId", label: "Application (client) ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
    { key: "clientSecret", label: "Client Secret", placeholder: "~abc...", type: "password" },
  ],
  okta: [
    { key: "domain", label: "Okta Domain", placeholder: "yourcompany.okta.com" },
    { key: "apiToken", label: "API Token", placeholder: "00Abc...", type: "password" },
  ],
  onepassword: [
    { key: "serverUrl", label: "Connect Server URL", placeholder: "https://my1password.example.com" },
    { key: "token", label: "Service Account Token", placeholder: "eyJ...", type: "password" },
  ],
  stripe: [
    { key: "apiKey", label: "Stripe Secret Key", placeholder: "sk_live_...", type: "password" },
  ],
  brex: [
    { key: "apiKey", label: "Brex API Key", placeholder: "...", type: "password" },
  ],
  ramp: [
    { key: "apiKey", label: "Ramp API Key", placeholder: "...", type: "password" },
  ],
  csv: [],
};

export function ConnectorForm({ connectorType }: { connectorType: ConnectorType }) {
  const router = useRouter();
  const fields = CONNECTOR_FIELDS[connectorType] ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: connectorType, credentials: values }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (connectorType === "csv") {
    return (
      <p className="text-sm text-slate-500">
        CSV uploads are done from the{" "}
        <a href="/spend" className="text-indigo-600 hover:underline">
          Spend page
        </a>
        .
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {fields.map((field) => (
        <div key={field.key}>
          <Label className="text-xs">{field.label}</Label>
          <Input
            type={field.type ?? "text"}
            placeholder={field.placeholder}
            value={values[field.key] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            required
            className="mt-1"
          />
        </div>
      ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button type="submit" disabled={saving} size="sm">
        {saving ? "Saving..." : "Save connector"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Replace `app/(dashboard)/connectors/page.tsx`**

```typescript
// app/(dashboard)/connectors/page.tsx
import { db } from "@/lib/db";
import { ConnectorCard } from "@/components/connector-card";
import { ConnectorForm } from "@/components/connector-form";
import type { ConnectorType } from "@prisma/client";

const ALL_TYPES: ConnectorType[] = [
  "google_workspace",
  "microsoft_365",
  "okta",
  "onepassword",
  "stripe",
  "brex",
  "ramp",
  "csv",
];

export default async function ConnectorsPage() {
  const connectors = await db.connector.findMany({
    select: { id: true, type: true, status: true, lastSyncAt: true, lastSyncStatus: true },
  });

  const connectedTypes = new Set(connectors.map((c) => c.type));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Connectors</h1>
        <p className="text-sm text-slate-500">Manage your SaaS data sources</p>
      </div>

      {/* Connected */}
      {connectors.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Connected</h2>
          <div className="grid grid-cols-2 gap-3">
            {connectors.map((c) => (
              <ConnectorCard
                key={c.id}
                connector={{ ...c, lastSyncAt: c.lastSyncAt?.toISOString() ?? null }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Available to connect */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Add Connector</h2>
        <div className="space-y-3">
          {ALL_TYPES.filter((t) => !connectedTypes.has(t)).map((type) => (
            <details key={type} className="bg-white rounded-lg border border-slate-200">
              <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-slate-900 list-none flex items-center justify-between">
                {type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                <span className="text-xs text-indigo-600">+ Configure</span>
              </summary>
              <div className="px-4 pb-4 pt-2 border-t border-slate-100">
                <ConnectorForm connectorType={type} />
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/connectors/ components/connector-card.tsx components/connector-form.tsx
git commit -m "feat: build Connectors page with setup wizard for all 8 connector types"
```

---

## Task 12: Settings page

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`
- Create: `components/role-select.tsx`

- [ ] **Step 1: Create `components/role-select.tsx`**

```typescript
// components/role-select.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UserRole } from "@prisma/client";

export function RoleSelect({ userId, currentRole }: { userId: string; currentRole: UserRole }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleChange(role: UserRole) {
    setSaving(true);
    await fetch(`/api/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <Select value={currentRole} onValueChange={(v) => handleChange(v as UserRole)} disabled={saving}>
      <SelectTrigger className="w-28 h-7 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">Admin</SelectItem>
        <SelectItem value="finance">Finance</SelectItem>
        <SelectItem value="manager">Manager</SelectItem>
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Replace `app/(dashboard)/settings/page.tsx`**

```typescript
// app/(dashboard)/settings/page.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { RoleSelect } from "@/components/role-select";

export default async function SettingsPage() {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/dashboard");

  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      department: true,
      _count: { select: { appUsers: { where: { isActive: true } } } },
    },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Manage users and their roles</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Users ({users.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">User</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">Department</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">Apps</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{user.name}</p>
                  <p className="text-xs text-slate-400">{user.email}</p>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{user.department ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{user._count.appUsers}</td>
                <td className="px-4 py-3">
                  {user.id === session?.user.id ? (
                    <span className="text-xs text-slate-400 capitalize">{user.role} (you)</span>
                  ) : (
                    <RoleSelect userId={user.id} currentRole={user.role} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/settings/ components/role-select.tsx
git commit -m "feat: build Settings page with role management table"
```

---

## Task 13: Full test suite + smoke test

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all tests passing (crypto × 3, risk × 5, cardfeed × 5, google × 4, apps API × 3, spend API × 2 = 22+ tests).

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: successful build with no errors.

- [ ] **Step 4: Start worker + web server**

In terminal 1:
```bash
npm run worker
```

In terminal 2:
```bash
npm run dev
```

- [ ] **Step 5: Manual smoke test checklist**

Open `http://localhost:3000` and verify:

| Check | Expected |
|---|---|
| Visit `/` | Redirects to `/login` |
| Sign in with Google (admin email) | Redirects to `/dashboard` |
| Dashboard | Shows stat cards, empty state messages if no data |
| Discovery | Shows empty state or shadow app list |
| App Inventory | Table renders with search + sort working |
| Spend | Chart renders (empty or with data) |
| Access | Offboarding queue + access table visible |
| Connectors | All 8 connector types listed, form expands on click |
| Settings | User table with role dropdowns |
| Sign in with a `finance` role user | Discovery and Access tabs hidden in sidebar |
| Sign in with a `manager` role user | Connectors and Settings tabs hidden |

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: plan 3 complete — all feature pages and API routes operational"
```

---

## What's Next

All three plans complete. SaaSGuard is now a fully working internal SaaS management platform with:
- Shadow IT discovery via Google Workspace and Microsoft 365 OAuth scanning
- Spend tracking via Stripe, Brex, Ramp, or CSV upload
- Access governance with offboarding queue and stale access detection
- Okta and 1Password integration for SSO-managed apps and credential vaults
- Role-scoped views for IT Admins, Finance, and Department Managers

Deploy to Railway: create a project, add Postgres and Redis add-ons, deploy the web service and worker service from the same repo with the appropriate start commands.
