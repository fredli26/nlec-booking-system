# NLEC Booking — Dev Workflow Cheatsheet

Feature branch → staging → production

---

## 1. Start from develop
*Always pull latest first*

```bash
cd /Users/fred/Claude/NLEC/booking-system/v5
git checkout develop
git pull
```

---

## 2. Create a feature branch

```bash
git checkout -b feature/your-name
```

Name it something short and descriptive, e.g. `feature/email-template`

---

## 3. Run locally and make changes
*Points at staging DB*

```bash
npm run dev
```

→ localhost:3000 · Staging Supabase

---

## 4. Commit and push

```bash
git add -p                            # stage selectively
git commit -m "describe what changed"
git push -u origin feature/your-name
```

---

## 5. Open PR → develop on GitHub
*Triggers staging deploy*

On `github.com/nlec-it/nlec-booking-system`:
New pull request: `feature/your-name` → `develop`

Vercel builds a **preview URL** automatically — link appears in the PR within ~1 min.

---

## 6. Test on staging preview URL

→ Vercel preview URL (shown in the PR) · Staging Supabase

Test your changes. If something's wrong, fix locally → commit → push → preview rebuilds.

---

## 7. Merge develop → main
*Deploys to production*

On GitHub: New pull request: `develop` → `main`, then merge when ready.

→ `booking.nlec.org.au` · Production Supabase

---

## Quick Reference

| | |
|---|---|
| Repo | `github.com/nlec-it/nlec-booking-system` |
| Production URL | `booking.nlec.org.au` |
| Working directory | `…/booking-system/v5/` |
| Staging DB | `nlec-booking-staging` (Supabase) |
| `develop` branch | → Vercel preview (staging) |
| `main` branch | → Vercel production |

> Never commit `.env.local` or `data/`
