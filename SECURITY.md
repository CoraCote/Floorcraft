# Security Policy

## Reporting a Vulnerability

Do not report security vulnerabilities through public GitHub issues.

Email security findings to the maintainer with subject line **"Security: Floorcraft"**. We will respond within 72 hours and aim to patch confirmed vulnerabilities within 14 days.

## Scope

**In scope:**
- The Floorcraft web app at [floorcraft.space](https://floorcraft.space)
- Authentication and session handling (Supabase Auth)
- Row-level security (RLS) policy bypasses
- Team workspace access control and sharing permission escalation
- Data export/import vulnerabilities

**Out of scope:**
- Supabase infrastructure (report to [Supabase security](https://supabase.com/docs/guides/platform/security))
- Third-party dependencies (report to the respective maintainers)
- Denial of service attacks

## Supported Versions

| Version | Supported |
|---|---|
| Latest (main) | Yes |
| Older commits | No |