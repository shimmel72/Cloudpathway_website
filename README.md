# Cloudpathway Website

Marketing and lead-capture site for Cloudpathway — SIP trunking and hosted PBX services.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) | Static marketing pages and API routes in one deployable |
| Language | TypeScript (strict) | Type safety across UI and API |
| Styling | Tailwind CSS v4 | Design tokens in `app/globals.css`, no runtime CSS-in-JS |
| Backend | Next.js Route Handlers | `POST /api/contact` for quote requests |
| Database | SQLite (better-sqlite3) | Zero-ops lead storage; swap for Postgres when volume warrants |
| Validation | Zod | One schema drives server validation and field-level error messages |

Marketing pages are statically prerendered; only `/api/contact` runs per-request.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm start          # serve the production build
npm run typecheck  # tsc --noEmit
```

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Hero, service overview, feature preview, differentiators |
| `/services` | SIP trunking and hosted PBX in depth, comparison table, migration process |
| `/features` | Full feature catalogue across five categories |
| `/about` | Who we are, values, network infrastructure, how we work |
| `/contact` | Quote request form and FAQ |

## Contact API

`POST /api/contact`

```jsonc
{
  "name": "Dana Whitfield",
  "company": "Northgate Property Group",
  "email": "dana@northgate.example",
  "phone": "(555) 555-0142",          // optional
  "service": "hosted-pbx",            // sip-trunking | hosted-pbx | both | not-sure
  "seats": "45 users, 2 sites",       // optional
  "message": "What we run today and what is not working."
}
```

Responses:

| Status | Meaning |
| --- | --- |
| `201` | Stored. Returns `{ ok: true, reference: "CP-000001" }` |
| `202` | Honeypot triggered — faked success, nothing stored |
| `400` | Malformed JSON |
| `422` | Validation failed. Returns `fieldErrors` keyed by field name |
| `429` | More than 3 submissions from one email in 10 minutes |
| `500` | Storage failure |

Abuse handling: a hidden `website` honeypot field (bots fill it, humans never see it) and a
per-email rate limit. Honeypot hits get a fake success so bots do not learn they were caught.

## Data

Leads land in the `leads` table in `data/cloudpathway.db`, created automatically on first
submission. The path is overridable with `CLOUDPATHWAY_DB_PATH`. The `data/` directory is
gitignored — this is real customer data, so back it up wherever this is deployed.

Read recent leads:

```bash
node -e "const D=require('better-sqlite3');console.table(new D('data/cloudpathway.db',{readonly:true}).prepare('SELECT id,name,company,email,service,created_at FROM leads ORDER BY id DESC LIMIT 20').all())"
```

## Before going live

These are stand-in values, all in one place:

- **`lib/site.ts`** — phone number, sales/support email addresses, postal address, support hours,
  and the headline statistics (uptime SLA, pickup time, data centers, countries). Every one of
  these is currently a placeholder and needs replacing with real figures you can stand behind.
- **Lead delivery** — submissions are only written to SQLite. Nothing emails or notifies anyone
  yet. Wire `app/api/contact/route.ts` to email, a CRM, or a webhook so enquiries reach a person.
- **Content review** — copy in `lib/content.ts` describes typical SIP/PBX capabilities. Confirm
  each claim matches what Cloudpathway actually delivers before publishing.

## Project layout

```
app/
  layout.tsx          root layout, metadata, header/footer
  page.tsx            home
  services/           services page
  features/           features page
  about/              about page
  contact/            contact page
  api/contact/        POST route handler
  globals.css         design tokens, light/dark palette
components/
  Header.tsx          sticky nav (client)
  Footer.tsx
  ContactForm.tsx     quote form (client)
  ui.tsx              Section, Card, Button, Stat, CtaBand
  Icons.tsx           inline SVG icon set
lib/
  site.ts             company details and nav — placeholders live here
  content.ts          services, features, values, FAQ copy
  db.ts               SQLite schema and queries
```
