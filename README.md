# Pro Support Command Centre

A starter internal dashboard for support operations built with Next.js, TypeScript, Tailwind CSS, Recharts, and a Google Apps Script + Google Sheets backend.

## What this starter includes

- Dashboard overview with summary cards
- Issue explorer with search and filters
- Analytics page with trends and aging buckets
- Typed API client for your Apps Script web app
- Analytics helpers for resolution time and issue aging
- Example upgraded Apps Script backend file

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Recharts
- Google Apps Script
- Google Sheets

## 1) Install

```bash
npm install
```

## 2) Configure environment

Copy `.env.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_APPS_SCRIPT_URL=your_apps_script_web_app_url
SUPPORT_EDIT_PASSWORD=optional_server_side_only
```

## 3) Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## 4) Deploy

Recommended: deploy the frontend to Vercel and the backend as a Google Apps Script Web App.

## Apps Script notes

The included `apps-script/Code.gs` upgrades your current script with:

- analytics endpoint
- sorting by newest first
- pagination
- more filters
- safer response payloads

## Suggested roadmap

### MVP
- Dashboard
- Filters
- Issue details drawer
- Basic analytics

### Next
- Authentication
- Role-based editing
- SLA alerts
- CSV export
- Dev ticket deep links
- Slack/Email notifications

## Security warning

Do not expose a shared edit password in a client-side app. If you need browser-based updates, move updates behind a protected backend or restrict the web app to trusted internal Google accounts.
