# SaaSGuard Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the SaaSGuard Next.js app with Prisma schema, NextAuth login (Google + Okta), role-based middleware, and the sidebar shell — producing a working app you can log into and see role-scoped empty pages.

**Architecture:** Next.js 15 App Router + TypeScript. Auth via NextAuth v5 (Auth.js) with Google Workspace and Okta as providers; email domain allowlist enforced in the `signIn` callback. Prisma + PostgreSQL for all persistence. Connector credentials stored AES-256 encrypted. Role (`admin | finance | manager`) lives in `User.role` and is injected into the NextAuth session; middleware checks it server-side.

**Tech Stack:** Next.js 15, TypeScript 5, Tailwind CSS 4, shadcn/ui, Prisma 6, PostgreSQL 16, NextAuth v5 (`next-auth@5`), `@auth/prisma-adapter`, Vitest, `@testing-library/react`, jsdom

> **Note:** SaaSGuard is a standalone repo — create it at `~/saasguard` (or wherever you keep projects). This plan doc lives in the Floocraft2 repo for reference only.

---

## File Map

```
~/saasguard/
├── .env                              # local secrets (gitignored)
├── .env.example                      # template committed to repo
├── .gitignore
├── next.config.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── vitest.setup.ts
├── auth.ts                           # NextAuth v5 config
├── middleware.ts                     # route protection + role gating
├── prisma/
│   └── schema.prisma                 # all 7 domain models + NextAuth models
├── lib/
│   ├── db.ts                         # Prisma client singleton
│   └── crypto.ts                     # AES-256 GCM encrypt/decrypt
├── types/
│   └── next-auth.d.ts                # session type augmentation
├── app/
│   ├── layout.tsx                    # root layout (SessionProvider)
│   ├── globals.css
│   ├── api/
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.ts          # NextAuth handler
│   ├── login/
│   │   └── page.tsx                  # sign-in page
│   └── (dashboard)/
│       ├── layout.tsx                # sidebar shell (reads session role)
│       ├── dashboard/page.tsx        # placeholder
│       ├── discovery/page.tsx        # placeholder
│       ├── inventory/page.tsx        # placeholder
│       ├── spend/page.tsx            # placeholder
│       ├── access/page.tsx           # placeholder
│       ├── connectors/page.tsx       # placeholder
│       └── settings/page.tsx         # placeholder
├── components/
│   ├── sidebar.tsx                   # role-scoped nav
│   └── session-provider.tsx          # client wrapper for NextAuth SessionProvider
└── __tests__/
    └── lib/
        └── crypto.test.ts
```

---

## Task 1: Scaffold the project

**Files:**
- Create: `~/saasguard/` (new repo)
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.example`

- [ ] **Step 1: Bootstrap with create-next-app**

```bash
cd ~
npx create-next-app@latest saasguard \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir no \
  --import-alias "@/*"
cd saasguard
```

- [ ] **Step 2: Install project dependencies**

```bash
npm install next-auth@5 @auth/prisma-adapter @prisma/client
npm install @radix-ui/react-slot class-variance-authority clsx tailwind-merge lucide-react
npm install -D prisma vitest @vitejs/plugin-react jsdom \
  @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event vite-tsconfig-paths
```

- [ ] **Step 3: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```

When prompted: Style = Default, Base color = Slate, CSS variables = yes.

Then add the components we need:

```bash
npx shadcn@latest add button badge avatar tooltip separator
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
```

- [ ] **Step 5: Create `vitest.setup.ts`**

```typescript
// vitest.setup.ts
import "@testing-library/jest-dom";
```

- [ ] **Step 6: Update `package.json` scripts**

Add to the `scripts` section:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 7: Create `.env.example`**

```bash
# .env.example
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saasguard"

# 64 hex chars = 32 bytes = 256-bit key
# Generate with: openssl rand -hex 32
CREDENTIAL_ENCRYPTION_KEY="your-64-hex-char-key-here"

NEXTAUTH_SECRET="your-nextauth-secret-here"
NEXTAUTH_URL="http://localhost:3000"
ALLOWED_EMAIL_DOMAIN="yourcompany.com"

# Google Workspace OAuth app (needs Admin SDK scope)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Okta OIDC app
OKTA_CLIENT_ID=""
OKTA_CLIENT_SECRET=""
OKTA_ISSUER="https://yourcompany.okta.com"
```

- [ ] **Step 8: Create `.env` from example (fill in real values later)**

```bash
cp .env.example .env
```

- [ ] **Step 9: Update `.gitignore`**

Ensure these lines exist (create-next-app adds most, verify `.env` is there):

```
.env
.env.local
```

- [ ] **Step 10: Initialize git and commit**

```bash
git init
git add .
git commit -m "chore: scaffold Next.js 15 project with shadcn and Vitest"
```

---

## Task 2: Prisma schema

**Files:**
- Create: `prisma/schema.prisma`
- Create: `lib/db.ts`

- [ ] **Step 1: Initialize Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and adds `DATABASE_URL` to `.env`.

- [ ] **Step 2: Replace `prisma/schema.prisma` with the full schema**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum AppStatus {
  shadow
  review
  managed
  denied
}

enum ConnectorType {
  google_workspace
  microsoft_365
  okta
  onepassword
  stripe
  brex
  ramp
  csv
}

enum ConnectorStatus {
  active
  error
  disconnected
  pending
}

enum GrantType {
  oauth
  sso
  manual
}

enum SpendSource {
  stripe
  brex
  ramp
  csv
}

enum UserRole {
  admin
  finance
  manager
}

enum AlertType {
  new_shadow_app
  offboarding_risk
  high_spend
  stale_access
  connector_error
}

enum AlertSeverity {
  high
  medium
  low
}

enum SyncStatus {
  success
  partial
  failed
}

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  name          String    @default("")
  role          UserRole  @default(admin)
  department    String?
  managerId     String?
  manager       User?     @relation("UserManager", fields: [managerId], references: [id])
  reports       User[]    @relation("UserManager")
  appUsers      AppUser[]
  spendRecords  SpendRecord[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // NextAuth required fields
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
}

model App {
  id           String      @id @default(uuid())
  name         String
  domain       String      @unique
  category     String?
  status       AppStatus   @default(shadow)
  riskScore    Int         @default(50)
  discoveredAt DateTime    @default(now())
  discoveredBy String?
  appUsers     AppUser[]
  spendRecords SpendRecord[]
  licenses     License[]
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
}

model AppUser {
  id        String    @id @default(uuid())
  appId     String
  app       App       @relation(fields: [appId], references: [id], onDelete: Cascade)
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  grantType GrantType @default(oauth)
  scopes    String[]
  firstSeen DateTime  @default(now())
  lastSeen  DateTime  @default(now())
  isActive  Boolean   @default(true)

  @@unique([appId, userId])
}

model SpendRecord {
  id           String      @id @default(uuid())
  appId        String?
  app          App?        @relation(fields: [appId], references: [id])
  amount       Decimal
  currency     String      @default("USD")
  period       DateTime
  source       SpendSource
  merchantName String
  department   String?
  employeeId   String?
  employee     User?       @relation(fields: [employeeId], references: [id])
  createdAt    DateTime    @default(now())
}

model License {
  id             String    @id @default(uuid())
  appId          String
  app            App       @relation(fields: [appId], references: [id], onDelete: Cascade)
  seatsPurchased Int
  seatsUsed      Int       @default(0)  // updated by worker from AppUser count (isActive=true)
  costPerSeat    Decimal?
  renewalDate    DateTime?
  vendor         String?
  notes          String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

model Connector {
  id             String          @id @default(uuid())
  type           ConnectorType   @unique
  status         ConnectorStatus @default(pending)
  credentialsEnc String?
  lastSyncAt     DateTime?
  lastSyncStatus SyncStatus?
  syncFrequency  String          @default("0 2 * * *")
  config         Json?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
}

model Alert {
  id         String        @id @default(uuid())
  type       AlertType
  severity   AlertSeverity
  payload    Json
  resolvedAt DateTime?
  createdAt  DateTime      @default(now())
}

// --- NextAuth required models ---

model Account {
  id                String  @id @default(uuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(uuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

- [ ] **Step 3: Start a local Postgres instance (if not running)**

```bash
# Using Docker:
docker run --name saasguard-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=saasguard \
  -p 5432:5432 \
  -d postgres:16
```

Set `DATABASE_URL` in `.env`:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saasguard"
```

- [ ] **Step 4: Run the initial migration**

```bash
npx prisma migrate dev --name init
```

Expected output:
```
✓ Generated Prisma Client
✓ Applied migration `20260420000000_init`
```

- [ ] **Step 5: Create `lib/db.ts`**

```typescript
// lib/db.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

- [ ] **Step 6: Verify Prisma client generates cleanly**

```bash
npx prisma generate
```

Expected: `✓ Generated Prisma Client`

- [ ] **Step 7: Commit**

```bash
git add prisma/ lib/db.ts
git commit -m "feat: add Prisma schema with all domain models and NextAuth tables"
```

---

## Task 3: Crypto lib (AES-256-GCM)

**Files:**
- Create: `lib/crypto.ts`
- Create: `__tests__/lib/crypto.test.ts`

- [ ] **Step 1: Generate a test encryption key and add to `.env`**

```bash
openssl rand -hex 32
```

Copy the output. Add to `.env`:
```
CREDENTIAL_ENCRYPTION_KEY="<output from above>"
```

- [ ] **Step 2: Write the failing test**

```typescript
// __tests__/lib/crypto.test.ts
import { describe, it, expect } from "vitest";

// Set env before importing the module
process.env.CREDENTIAL_ENCRYPTION_KEY = "a".repeat(64); // 32 bytes as hex

const { encrypt, decrypt } = await import("@/lib/crypto");

describe("crypto", () => {
  it("round-trips a string through encrypt/decrypt", () => {
    const plaintext = JSON.stringify({ token: "secret-refresh-token", expiresAt: 1234567890 });
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces different ciphertext for the same input (random IV)", () => {
    const plaintext = "same-input";
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  it("throws if ciphertext is tampered", () => {
    const ciphertext = encrypt("valid");
    const tampered = ciphertext.slice(0, -4) + "0000";
    expect(() => decrypt(tampered)).toThrow();
  });
});
```

- [ ] **Step 3: Run test — expect FAIL**

```bash
npm test -- __tests__/lib/crypto.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/crypto'`

- [ ] **Step 4: Create `lib/crypto.ts`**

```typescript
// lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
```

- [ ] **Step 5: Run test — expect PASS**

```bash
npm test -- __tests__/lib/crypto.test.ts
```

Expected:
```
✓ round-trips a string through encrypt/decrypt
✓ produces different ciphertext for the same input (random IV)
✓ throws if ciphertext is tampered
```

- [ ] **Step 6: Commit**

```bash
git add lib/crypto.ts __tests__/lib/crypto.test.ts
git commit -m "feat: add AES-256-GCM encrypt/decrypt for connector credentials"
```

---

## Task 4: NextAuth v5 configuration

**Files:**
- Create: `auth.ts`
- Create: `types/next-auth.d.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Create `types/next-auth.d.ts` — extend the session type**

```typescript
// types/next-auth.d.ts
import type { UserRole } from "@prisma/client";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string | null;
      role: UserRole;
      department: string | null;
    };
  }
  interface User {
    role?: UserRole;
    department?: string | null;
  }
}
```

- [ ] **Step 2: Create `auth.ts`**

```typescript
// auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Okta from "next-auth/providers/okta";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN!;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Okta({
      clientId: process.env.OKTA_CLIENT_ID!,
      clientSecret: process.env.OKTA_CLIENT_SECRET!,
      issuer: process.env.OKTA_ISSUER!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      return user.email.endsWith(`@${ALLOWED_DOMAIN}`);
    },
    async session({ session, user }) {
      const dbUser = await db.user.findUnique({
        where: { id: user.id },
        select: { role: true, department: true },
      });
      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
          role: dbUser?.role ?? "admin",
          department: dbUser?.department ?? null,
        },
      };
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "database" },
});
```

- [ ] **Step 3: Create `app/api/auth/[...nextauth]/route.ts`**

```typescript
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add auth.ts types/ app/api/auth/
git commit -m "feat: add NextAuth v5 with Google and Okta providers, email domain allowlist"
```

---

## Task 5: Middleware — route protection

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create `middleware.ts`**

```typescript
// middleware.ts
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // Public routes
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    // Redirect already-logged-in users away from login
    if (isLoggedIn && pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // All other routes require login
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)",
  ],
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add middleware for auth-guarded routes"
```

---

## Task 6: Root layout + session provider

**Files:**
- Create: `components/session-provider.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Create `components/session-provider.tsx`**

NextAuth v5's `SessionProvider` must be a client component wrapper:

```typescript
// components/session-provider.tsx
"use client";

import { SessionProvider } from "next-auth/react";

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

- [ ] **Step 2: Replace `app/layout.tsx`**

```typescript
// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthSessionProvider } from "@/components/session-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SaaSGuard",
  description: "Internal SaaS management platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/session-provider.tsx app/layout.tsx
git commit -m "feat: add root layout with NextAuth session provider"
```

---

## Task 7: Sidebar + dashboard shell layout

**Files:**
- Create: `components/sidebar.tsx`
- Create: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create `components/sidebar.tsx`**

The sidebar reads the user's role from the session and only renders nav items the role can access.

```typescript
// components/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Shield, Search, Package, DollarSign, Key, Plug, Settings, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
  badge?: number;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "finance", "manager"] },
  { href: "/discovery", label: "Discovery", icon: Search, roles: ["admin", "manager"] },
  { href: "/inventory", label: "App Inventory", icon: Package, roles: ["admin", "finance", "manager"] },
  { href: "/spend", label: "Spend", icon: DollarSign, roles: ["admin", "finance", "manager"] },
  { href: "/access", label: "Access", icon: Key, roles: ["admin", "manager"] },
  { href: "/connectors", label: "Connectors", icon: Plug, roles: ["admin"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role ?? "admin";

  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <aside className="flex flex-col w-52 min-h-screen bg-slate-900 text-slate-400 shrink-0">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-800">
        <Shield className="w-5 h-5 text-indigo-400" />
        <span className="text-white font-bold text-base">SaaSGuard</span>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1 py-2">
        {visible.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between gap-2 px-4 py-2 text-sm transition-colors hover:text-white hover:bg-slate-800",
                active && "bg-slate-800 text-white"
              )}
            >
              <span className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {item.label}
              </span>
              {item.badge != null && item.badge > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-4">
        <p className="text-xs text-slate-500 truncate">{session?.user?.email}</p>
        <p className="text-xs text-slate-600 capitalize">{role}</p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create `app/(dashboard)/layout.tsx`**

```typescript
// app/(dashboard)/layout.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-slate-50 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/sidebar.tsx app/\(dashboard\)/layout.tsx
git commit -m "feat: add role-scoped sidebar and dashboard shell layout"
```

---

## Task 8: Login page

**Files:**
- Create: `app/login/page.tsx`

- [ ] **Step 1: Create `app/login/page.tsx`**

```typescript
// app/login/page.tsx
import { signIn } from "@/auth";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-xl border border-slate-200 p-8 w-full max-w-sm shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="w-6 h-6 text-indigo-500" />
          <span className="text-xl font-bold text-slate-900">SaaSGuard</span>
        </div>

        <h1 className="text-lg font-semibold text-slate-900 mb-1">Sign in</h1>
        <p className="text-sm text-slate-500 mb-6">
          Use your company account to continue.
        </p>

        {searchParams.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            Access denied. Make sure you&apos;re using your company email.
          </div>
        )}

        <div className="flex flex-col gap-3">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <Button type="submit" variant="outline" className="w-full">
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </Button>
          </form>

          <form
            action={async () => {
              "use server";
              await signIn("okta", { redirectTo: "/dashboard" });
            }}
          >
            <Button type="submit" variant="outline" className="w-full">
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="#00297A">
                <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm0 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
              </svg>
              Sign in with Okta
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/login/
git commit -m "feat: add login page with Google and Okta sign-in buttons"
```

---

## Task 9: Placeholder dashboard pages

**Files:**
- Create: `app/(dashboard)/dashboard/page.tsx`
- Create: `app/(dashboard)/discovery/page.tsx`
- Create: `app/(dashboard)/inventory/page.tsx`
- Create: `app/(dashboard)/spend/page.tsx`
- Create: `app/(dashboard)/access/page.tsx`
- Create: `app/(dashboard)/connectors/page.tsx`
- Create: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create all placeholder pages**

Each page is identical in structure — just a heading and "coming soon" note:

```typescript
// app/(dashboard)/dashboard/page.tsx
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">Dashboard</h1>
      <p className="text-sm text-slate-500">Overview coming in Plan 3.</p>
    </div>
  );
}
```

```typescript
// app/(dashboard)/discovery/page.tsx
export default function DiscoveryPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">Discovery</h1>
      <p className="text-sm text-slate-500">Shadow IT discovery coming in Plan 3.</p>
    </div>
  );
}
```

```typescript
// app/(dashboard)/inventory/page.tsx
export default function InventoryPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">App Inventory</h1>
      <p className="text-sm text-slate-500">App catalog coming in Plan 3.</p>
    </div>
  );
}
```

```typescript
// app/(dashboard)/spend/page.tsx
export default function SpendPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">Spend</h1>
      <p className="text-sm text-slate-500">Spend tracking coming in Plan 3.</p>
    </div>
  );
}
```

```typescript
// app/(dashboard)/access/page.tsx
export default function AccessPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">Access</h1>
      <p className="text-sm text-slate-500">Access governance coming in Plan 3.</p>
    </div>
  );
}
```

```typescript
// app/(dashboard)/connectors/page.tsx
export default function ConnectorsPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">Connectors</h1>
      <p className="text-sm text-slate-500">Connector management coming in Plan 2.</p>
    </div>
  );
}
```

```typescript
// app/(dashboard)/settings/page.tsx
export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">Settings</h1>
      <p className="text-sm text-slate-500">Org settings and user management coming in Plan 3.</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(dashboard\)/
git commit -m "feat: add placeholder pages for all dashboard sections"
```

---

## Task 10: Smoke test — verify full flow

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: 3 passing (crypto tests).

- [ ] **Step 2: Run the dev server**

Make sure `.env` has real Google OAuth credentials (or use Okta). For a quick check with test credentials you can temporarily set `ALLOWED_EMAIL_DOMAIN` to your own domain and use a real Google OAuth app in dev mode.

```bash
npm run dev
```

Expected: `Ready on http://localhost:3000`

- [ ] **Step 3: Verify the login redirect**

Open `http://localhost:3000` — should redirect to `http://localhost:3000/login`.

- [ ] **Step 4: Verify role-scoped sidebar**

After logging in (with a real account), you should see:
- IT admin (`role = admin`) — all 7 nav items visible
- Finance user — Dashboard, App Inventory, Spend visible
- Manager — Dashboard, Discovery (team-scoped), App Inventory, Spend, Access visible

To test different roles without a full auth flow, temporarily update `User.role` directly in Postgres:

```sql
UPDATE "User" SET role = 'finance' WHERE email = 'yourname@company.com';
```

Then reload — sidebar should update.

- [ ] **Step 5: Verify type-check passes**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: plan 1 complete — foundation, auth, schema, shell all working"
```

---

## What's Next

- **Plan 2** — BullMQ worker process + all 5 connector sync jobs (Google Workspace, Microsoft 365, Okta, 1Password, Card Feed) writing real data to Postgres.
- **Plan 3** — Feature UI: Discovery approve/deny flow, Spend charts, Access matrix, App Inventory table, Dashboard stats, Connectors setup wizard, Settings.
