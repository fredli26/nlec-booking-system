# NLEC Room Booking System — Project Summary

## Overview
A room booking web app for New Life Evangelical Church (NLEC). Staff submit booking requests, admins approve/reject them. Built in Next.js, currently at v5 (working directory). Hosted on **Vercel** (free Hobby plan) with **Supabase** PostgreSQL as the database (free tier).

- **GitHub**: `https://github.com/fredli26/nlec-booking-system`
- **Working directory**: `/Users/fred/Claude/NLEC/booking-system/v5`
- **CI/CD**: `main` branch → Vercel production, `develop` branch → Vercel preview URL

---

## Tech Stack
- **Framework**: Next.js 16.2.9 (App Router, Turbopack)
- **Language**: TypeScript + Tailwind CSS
- **Calendar UI**: FullCalendar v6 (`@fullcalendar/resource-timeline`, `@fullcalendar/resource`)
- **Google Calendar**: googleapis JWT service account (read + write events)
- **Auth**: Cookie-based (`nlec_role` httpOnly + `nlec_role_pub` client-readable) + NextAuth v5 beta for SSO
- **SSO**: Microsoft Entra ID (M365) via `next-auth@beta` + `next-auth/providers/microsoft-entra-id`
- **Email**: nodemailer via Gmail SMTP (App Password)
- **Database**: Supabase PostgreSQL — replaces all local JSON file storage (`@supabase/supabase-js`, service_role key bypasses RLS)
- **Middleware**: `proxy.ts` (must be named `proxy`, not `middleware` — Next.js 16 requirement)

---

## Brand Colours
```
teal:      #66c6bb
tealDark:  #088a97
tealLight: #e8f7f6
grey:      #768081
navy:      #003462
terracotta:#C28064
```

---

## Roles & Auth
Three roles stored in `nlec_role` cookie (httpOnly, 8hr expiry):
- **admin** — full access, approve/reject bookings, admin panel
- **viewer** — read-only schedule view
- **guest** — can submit booking requests

### Login methods
1. **Access code** (`/api/auth/login`) — reads codes from Supabase `access_codes` table
   - Default codes: guest=`"guest"`, viewer=`"viewer"` (changeable via Admin Panel)
   - Admin code is hardcoded as `"admin"` (not in the database)
2. **Microsoft SSO** (`/api/auth/sso-bridge`) — NextAuth handles OAuth, bridge route sets cookie
   - Only `@nlec.org.au` emails are allowed
   - If email is in Supabase `admins` table → role = `admin`, otherwise → role = `guest`
   - SSO cookies `nlec_sso_name` + `nlec_sso_email` are stored (client-readable) for profile info

### Login page behaviour
- Shows two options: "Sign in with NLEC Email" (SSO) and "Use Access Code"
- If `nlec_sso_email` cookie is present (previous SSO login), page defaults to SSO screen and hides back button. A faint "Use access code instead" link is still shown for admins.

---

## Supabase Database — 3 Tables

### `bookings`
Merges pending + archived into one table. `archived_at = NULL` means active.
```sql
id TEXT PRIMARY KEY, status TEXT ('pending'|'approved'|'rejected'),
submitted_at TIMESTAMPTZ, room TEXT, calendar_id TEXT,
title TEXT, description TEXT, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ,
guest_name TEXT, guest_email TEXT, guest_phone TEXT,
approved_at TIMESTAMPTZ, google_event_id TEXT,
rejected_at TIMESTAMPTZ, reject_reason TEXT, archived_at TIMESTAMPTZ
```

### `admins`
```sql
email TEXT PRIMARY KEY, added_at TIMESTAMPTZ DEFAULT NOW()
```
Seed: fred.li, fanny.liu, tenie.leung @nlec.org.au

### `access_codes`
```sql
id INT PRIMARY KEY DEFAULT 1, guest_code TEXT, viewer_code TEXT
```
Always one row (id=1).

> Full setup SQL is in `SUPABASE_SETUP.md`.

---

## File Structure
```
v5/
├── app/
│   ├── admin/
│   │   ├── page.tsx              # Server page (passes role to AdminClient)
│   │   └── AdminClient.tsx       # Admin UI — 3 tabs: Bookings, Manage Admins, Access Codes
│   ├── api/
│   │   ├── access-codes/route.ts # GET/POST — manage guest/viewer codes (admin only, Supabase)
│   │   ├── admin-list/route.ts   # GET/POST/DELETE — manage admin emails (admin only, Supabase)
│   │   ├── auth/
│   │   │   ├── [...nextauth]/route.ts  # NextAuth handler
│   │   │   ├── login/route.ts    # Access code login (reads from Supabase)
│   │   │   ├── logout/route.ts   # Clears nlec_role + nlec_role_pub cookies
│   │   │   └── sso-bridge/route.ts     # Post-SSO: checks Supabase admins table, sets role cookie
│   │   ├── bookings/route.ts     # GET/POST/PATCH/DELETE bookings + email (Supabase)
│   │   ├── calendars/route.ts    # GET Google Calendar events, POST create GCal event
│   │   └── ping/route.ts         # GET — queries Supabase to keep free tier alive (Vercel cron)
│   ├── components/
│   │   ├── ResourceScheduler.tsx # Main scheduler UI (FullCalendar, booking form, toolbar)
│   │   └── ClientWrapper.tsx     # Thin client wrapper reading role cookie
│   ├── login/page.tsx            # Login page (SSO + access code)
│   └── page.tsx                  # Home — renders ClientWrapper → ResourceScheduler
├── lib/
│   └── supabase.ts               # Supabase client + BookingRow interface + rowToEntry() helper
├── auth.ts                       # NextAuth config (MicrosoftEntraID provider)
├── proxy.ts                      # Middleware: protects all routes, allows /login + /api/auth/*
├── config.json                   # { deleteRequestsOlderThanDays, timezone }
├── vercel.json                   # Vercel cron: /api/ping daily at 8am UTC
├── SUPABASE_SETUP.md             # SQL to run in Supabase + how to get credentials
└── data/                         # Gitignored — only used locally if not using Supabase
```

---

## Key Features

### Main Schedule Page (`ResourceScheduler.tsx`)
- FullCalendar resource-timeline view (day view, zoom levels)
- Left sidebar: room list with toggle checkboxes, filter input
- Toolbar: Today / ← → navigation (Prev/Next adjacent to Today), date picker, zoom, role badge, **Admin Panel** button with pending-count badge (admin only), Sign Out (rightmost)
- Guest booking: 2-step modal (pick slot → fill name/phone/title/description)
- Admin booking: same modal + Advanced section for repeat events (Daily/Weekly/Monthly)
- Overlap detection during drag — blocks selection if room already booked
- Pending bookings shown as amber striped ⏳ events on the calendar (visible to all roles)

### Admin Panel (`AdminClient.tsx`) — 3 tabs
1. **Bookings** — list pending/approved/rejected requests, approve (with editable title/date/time + optional repeat), reject with reason, delete, bulk delete
2. **Manage Admins** — view/add/remove `@nlec.org.au` emails that get admin SSO access
3. **Access Codes** — view/update guest and viewer access codes (show/hide toggle)

### Booking Flow
1. Guest selects time slot → fills in details → POST `/api/bookings` → saved to Supabase → receipt email sent to guest (BCC admin)
2. Admin approves → PATCH `/api/bookings` → creates Google Calendar event → confirmation email to guest (BCC admin)
3. Admin deletes → DELETE `/api/bookings` → sets `archived_at` (soft delete, disappears from active list)

### Repeat Events
RRULE strings built server-side from `freq` / `endType` / `count` / `until` params. Requires `timeZone` in GCal event start/end (from `config.json`, default `Australia/Melbourne`).

### Supabase Free Tier Keep-Alive
`/api/ping` is called daily by Vercel cron (configured in `vercel.json`) to prevent the Supabase project from pausing after 1 week of inactivity.

---

## `lib/supabase.ts` — Key Helper

`rowToEntry(row)` converts a flat Supabase row to the nested UI shape:
```ts
{ id, status, submittedAt, booking: { room, calendarId, title, start, end }, guest: { name, email, phone } }
```
`toISO(ts)` normalises Supabase TIMESTAMPTZ strings (which may use space separator, e.g. `"2026-06-25 23:00:00+00:00"`) to standard ISO 8601 `"2026-06-25T23:00:00.000Z"` for correct browser and FullCalendar parsing.

---

## Environment Variables (`.env.local` — never commit)
```
# Supabase
SUPABASE_URL=https://mfqdrgetzwdbhydoezrq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Google Calendar
CALENDAR_ACCOUNT=nlec.rm.booking@gmail.com
CALENDAR_IDS=<comma-separated Google Calendar IDs>
GOOGLE_SERVICE_ACCOUNT_KEY=<full JSON of service account key>

# Microsoft SSO
AUTH_MICROSOFT_CLIENT_ID=8949070b-d38f-4e16-8789-eacf53824d36
AUTH_MICROSOFT_CLIENT_SECRET=<secret>
AUTH_MICROSOFT_TENANT_ID=ed65b7e2-943d-4dd5-bcaf-53c359a7883e
AUTH_SECRET=<random string>
NEXTAUTH_URL=http://localhost:3000

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=nlec.rm.booking@gmail.com
SMTP_PASS=<gmail app password, 16 chars no spaces>
```
Same variables must be added to **Vercel → Settings → Environment Variables** for production.

---

## Bug Fixes Applied
- **AADSTS50194** (SSO error): Fixed by adding `issuer: https://login.microsoftonline.com/${tenantId}/v2.0` to `auth.ts` to force tenant-specific endpoint instead of `/common`
- **Supabase TIMESTAMPTZ format**: `toISO()` in `lib/supabase.ts` normalises PostgreSQL timestamp format (`"2026-06-25 23:00:00+00:00"`) to ISO 8601 so FullCalendar and date comparisons work correctly
- **Midnight-crossing approval**: In `submitPendingAction`, if `endDT ≤ startDT`, end is advanced by 24 hours — prevents Google Calendar "time range is empty" error for events that cross midnight

---

## Recent UI Changes (2026-06-27)
- **Viewer-first UX**: Unauthenticated users now land on the schedule as a viewer (no login required). `proxy.ts` allows `/` and `/api/calendars` without auth.
- **Sign in button**: Top-right toolbar shows a teal "Sign in" button (links to `/login`) when not authenticated. Authenticated users see role badge + "Sign out" as before. Sign out now redirects to `/` instead of `/login`.
- **"Manage Admins" renamed to "Accounts"**: Tab label and page heading in `AdminClient.tsx` updated.

---

## Dev / Staging / Production Setup (in progress as of 2026-06-29)

### Environment map
| Environment | Branch | Vercel | Supabase |
|---|---|---|---|
| Local dev | any feature branch | localhost:3000 | Staging DB |
| Staging | `develop` | Vercel preview URL | Staging DB |
| Production | `main` | Live site | Production DB |

### Supabase projects (both created AU region, free tier)
- **Production**: new project created 2026-06-29 — tables + seed SQL run ✅
- **Staging**: new project created 2026-06-29 — tables + seed SQL run ✅
- SQL to run on each is in `SUPABASE_SETUP.md`

### Completed so far
- [x] Both Supabase projects created and SQL run on both
- [x] Credentials (URL + service_role key) obtained for both projects

### Still to do
- [ ] Update `v5/.env.local` — set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to **staging** values
- [ ] Vercel → Settings → Environment Variables:
  - Add `SUPABASE_URL` twice: production value (Production env), staging value (Preview env)
  - Add `SUPABASE_SERVICE_ROLE_KEY` twice: production value (Production env), staging value (Preview env)
  - Add all other env vars (Google Calendar, SSO, Email) — same value for both environments
- [ ] Verify Vercel root directory is set to `v5`
- [ ] Set `NEXTAUTH_URL` in Vercel to the correct production and preview URLs
- [ ] Test: push to `develop` → confirm Vercel preview deploys and hits staging Supabase
- [ ] Test: merge to `main` → confirm Vercel production deploys and hits production Supabase

### All required env vars (for Vercel + .env.local)
```
# Supabase (DIFFERENT per environment)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Google Calendar (same for both)
CALENDAR_ACCOUNT=nlec.rm.booking@gmail.com
CALENDAR_IDS=<comma-separated calendar IDs>
GOOGLE_SERVICE_ACCOUNT_KEY=<full service account JSON>

# Microsoft SSO (same for both)
AUTH_MICROSOFT_CLIENT_ID=8949070b-d38f-4e16-8789-eacf53824d36
AUTH_MICROSOFT_CLIENT_SECRET=<secret>
AUTH_MICROSOFT_TENANT_ID=ed65b7e2-943d-4dd5-bcaf-53c359a7883e
AUTH_SECRET=<any random string>
NEXTAUTH_URL=<deployment URL — different per environment>

# Email (same for both)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=nlec.rm.booking@gmail.com
SMTP_PASS=<gmail app password, 16 chars no spaces>
```

---

## Important Notes for Next AI
- `proxy.ts` must export a function named `proxy` (not `middleware`) — Next.js 16 breaking change
- `next.config.ts` needs `turbopack: { root: path.resolve(__dirname) }` to fix workspace root issues
- `@fullcalendar/resource` must be installed separately alongside `@fullcalendar/resource-timeline`
- Install with `--legacy-peer-deps` for next-auth@beta and FullCalendar packages
- Use Supabase **service_role** key (not anon key) — bypasses RLS for server-side routes
- `auth.ts` has `// @ts-expect-error` on `tenantId` — valid option but missing from next-auth beta types
- `data/` directory is gitignored — contains personal info; `.env.local` is gitignored — never commit
- DST-safe date comparison: use `getFullYear()/getMonth()/getDate()` local methods on Date objects
- Pending events filter in `ResourceScheduler.tsx` uses local date methods — this is intentional for timezone correctness
