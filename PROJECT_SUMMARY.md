# NLEC Room Booking System — Project Summary

## Overview
A room booking web app for New Life Evangelical Church (NLEC). Staff submit booking requests, admins approve/reject them. Built in Next.js, hosted on Vercel with Supabase PostgreSQL as the database.

- **GitHub**: `https://github.com/nlec-it/nlec-booking-system`
- **Production URL**: `https://booking.nlec.org.au`
- **Working directory**: `/Users/fred/Claude/NLEC/booking-system/v5`
- **CI/CD**: `main` branch → Vercel production, `develop` branch → Vercel preview (staging)

---

## Accounts & Services

| Service | Account | Notes |
|---|---|---|
| GitHub | `nlec-it` org | repo: nlec-it/nlec-booking-system |
| Vercel | `it@nlec.org.au` (NLEC IT team) | Hobby plan |
| Supabase | `it@nlec.org.au` | 2 projects, free tier |
| Cloudflare | NLEC account | DNS for booking.nlec.org.au |
| Azure / Entra ID | NLEC M365 tenant | App registration for SSO |

---

## Tech Stack
- **Framework**: Next.js 16.2.9 (App Router, Turbopack)
- **Language**: TypeScript + Tailwind CSS
- **Calendar UI**: FullCalendar v6 (`@fullcalendar/resource-timeline`, `@fullcalendar/resource`)
- **Google Calendar**: googleapis JWT service account (read + write events)
- **Auth**: Cookie-based (`nlec_role` httpOnly + `nlec_role_pub` client-readable) + NextAuth v5 beta for SSO
- **SSO**: Microsoft Entra ID (M365) via `next-auth@beta` + `next-auth/providers/microsoft-entra-id`
- **Email**: nodemailer via Gmail SMTP (App Password)
- **Database**: Supabase PostgreSQL (`@supabase/supabase-js`, service_role key bypasses RLS)
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

## Environments

| Environment | Branch | URL | Supabase |
|---|---|---|---|
| Local dev | any feature branch | localhost:3000 | Staging DB |
| Staging | `develop` | Vercel preview URL | Staging DB |
| Production | `main` | booking.nlec.org.au | Production DB |

### Supabase projects (AU region — ap-southeast-2, free tier)
- **nlec-booking-production** — used by Vercel Production environment
- **nlec-booking-staging** — used by Vercel Preview environment + local dev

### Local dev setup
- `v5/.env.local` must point `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the **staging** project
- `NEXTAUTH_URL=http://localhost:3000`
- Run: `cd /Users/fred/Claude/NLEC/booking-system/v5 && npm run dev`

### Day-to-day workflow
```
# New work
git checkout develop && git pull
git checkout -b feature/name
# make changes, test locally
git add -p && git commit -m "description"
git push -u origin feature/name
# Open PR → develop on GitHub → test on staging preview URL
# When happy → PR develop → main → auto-deploys to production
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
- Login page is the first screen (unauthenticated users are redirected to `/login`)
- Shows two options: "Sign in with NLEC Email" (SSO) and "Use Access Code"
- If `nlec_sso_email` cookie is present (previous SSO login), page defaults to SSO screen and hides back button. A faint "Use access code instead" link is still shown for admins.

### Azure App Registration
- **Client ID**: `8949070b-d38f-4e16-8789-eacf53824d36`
- **Tenant ID**: `ed65b7e2-943d-4dd5-bcaf-53c359a7883e`
- Redirect URIs registered (Web platform):
  - `http://localhost:3000/api/auth/callback/microsoft-entra-id`
  - `https://booking.nlec.org.au/api/auth/callback/microsoft-entra-id`

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
│   │   └── AdminClient.tsx       # Admin UI — 3 tabs: Bookings, Accounts, Access Codes
│   ├── api/
│   │   ├── access-codes/route.ts # GET/POST — manage guest/viewer codes (admin only)
│   │   ├── admin-list/route.ts   # GET/POST/DELETE — manage admin emails (admin only)
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
├── .npmrc                        # legacy-peer-deps=true (required for Vercel builds)
├── config.json                   # { deleteRequestsOlderThanDays, timezone }
├── vercel.json                   # Vercel cron: /api/ping daily at 8am UTC
└── SUPABASE_SETUP.md             # SQL to run in Supabase + how to get credentials
```

---

## Key Features

### Main Schedule Page (`ResourceScheduler.tsx`)
- FullCalendar resource-timeline view (day view, zoom levels)
- Left sidebar: room list with toggle checkboxes, filter input
- Toolbar: Today / ← → navigation, date picker, zoom, role badge, Admin Panel button with pending-count badge (admin only), Sign Out
- Guest booking: 2-step modal (pick slot → fill name/phone/title/description)
- Admin booking: same modal + Advanced section for repeat events (Daily/Weekly/Monthly)
- Overlap detection during drag — blocks selection if room already booked
- Pending bookings shown as amber ⏳ events on the calendar

### Admin Panel (`AdminClient.tsx`) — 3 tabs
1. **Bookings** — list pending/approved/rejected requests, approve (editable title/date/time + optional repeat), reject with reason, delete, bulk delete
2. **Accounts** — view/add/remove `@nlec.org.au` emails that get admin SSO access
3. **Access Codes** — view/update guest and viewer access codes (show/hide toggle)

### Booking Flow
1. Guest selects time slot → fills in details → POST `/api/bookings` → saved to Supabase → receipt email sent to guest (BCC admin)
2. Admin approves → PATCH `/api/bookings` → creates Google Calendar event → confirmation email to guest (BCC admin)
3. Admin deletes → DELETE `/api/bookings` → sets `archived_at` (soft delete)

### Repeat Events
RRULE strings built server-side from `freq` / `endType` / `count` / `until` params. Requires `timeZone` in GCal event start/end (from `config.json`, default `Australia/Melbourne`).

### Supabase Free Tier Keep-Alive
`/api/ping` called daily by Vercel cron to prevent the production Supabase project from pausing.

---

## `lib/supabase.ts` — Key Helpers
- `rowToEntry(row)` — converts flat Supabase row to nested UI shape: `{ id, status, submittedAt, booking: { room, calendarId, title, start, end }, guest: { name, email, phone } }`
- `toISO(ts)` — normalises Supabase TIMESTAMPTZ strings (`"2026-06-25 23:00:00+00:00"`) to ISO 8601 for correct FullCalendar and date parsing

---

## Environment Variables (`.env.local` — never commit)
```
# Supabase — use STAGING values for local dev
SUPABASE_URL=https://wojwvoevlripscmaoprx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<staging service-role-key>

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

### Vercel Environment Variables
Same variables, but Supabase credentials split by environment:
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → **Production** env = production Supabase project
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → **Preview** env = staging Supabase project
- `NEXTAUTH_URL` → `https://booking.nlec.org.au` (Production)
- All other vars → same for both environments

---

## Bug Fixes Applied
- **AADSTS50194** (SSO error): Fixed by adding `issuer: https://login.microsoftonline.com/${tenantId}/v2.0` to `auth.ts`
- **Supabase TIMESTAMPTZ format**: `toISO()` normalises PostgreSQL timestamp format to ISO 8601
- **Midnight-crossing approval**: `endDT` advanced by 24h if `≤ startDT` — prevents Google Calendar error
- **Vercel build failure**: Added `.npmrc` with `legacy-peer-deps=true` to resolve next-auth/nodemailer peer dependency conflict

---

## Important Notes for Next AI
- `proxy.ts` must export a function named `proxy` (not `middleware`) — Next.js 16 breaking change
- `next.config.ts` needs `turbopack: { root: path.resolve(__dirname) }` to fix workspace root issues
- `@fullcalendar/resource` must be installed separately alongside `@fullcalendar/resource-timeline`
- Install with `--legacy-peer-deps` for next-auth@beta and FullCalendar packages
- Use Supabase **service_role** key (not anon key) — bypasses RLS for server-side routes
- `auth.ts` has `// @ts-expect-error` on `tenantId` — valid option but missing from next-auth beta types
- `.env.local` and `data/` are gitignored — never commit
- DST-safe date comparison: use `getFullYear()/getMonth()/getDate()` local methods on Date objects
- Pending events filter in `ResourceScheduler.tsx` uses local date methods — intentional for timezone correctness
- GitHub repo is under `nlec-it` org, NOT the personal `fredli26` account
