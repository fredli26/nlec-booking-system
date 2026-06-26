# Supabase Setup

Run this SQL in your Supabase project: **Dashboard → SQL Editor → New query**

```sql
-- 1. Bookings (replaces pending-bookings.json + archived-bookings.json)
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ NOT NULL,
  room TEXT,
  calendar_id TEXT,
  title TEXT,
  description TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  approved_at TIMESTAMPTZ,
  google_event_id TEXT,
  rejected_at TIMESTAMPTZ,
  reject_reason TEXT,
  archived_at TIMESTAMPTZ
);

-- 2. Admins (replaces admin.json)
CREATE TABLE admins (
  email TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Access codes (replaces access-codes.json) — always one row
CREATE TABLE access_codes (
  id INT PRIMARY KEY DEFAULT 1,
  guest_code TEXT NOT NULL DEFAULT 'guest',
  viewer_code TEXT NOT NULL DEFAULT 'viewer'
);

-- Seed initial data
INSERT INTO access_codes (id, guest_code, viewer_code) VALUES (1, 'guest', 'viewer');

INSERT INTO admins (email, added_at) VALUES
  ('fred.li@nlec.org.au', NOW()),
  ('fanny.liu@nlec.org.au', NOW()),
  ('tenie.leung@nlec.org.au', NOW());
```

## Get your Supabase credentials

1. Go to your Supabase project → **Settings → API**
2. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret → `SUPABASE_SERVICE_ROLE_KEY` (under "Project API keys")

> ⚠️ Use the **service_role** key (not the anon key) — it bypasses Row Level Security for server-side routes.

## Add to .env.local

```
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

## Add to Vercel

Go to your Vercel project → **Settings → Environment Variables** and add the same two variables, plus all others from your `.env.local`.
