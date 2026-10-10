# Cloudpathway Website

Marketing and lead-capture site for Cloudpathway — SIP trunking and hosted PBX services.

> **On claims:** Cloudpathway is pre-launch, and the copy says so plainly. The site asserts no
> uptime percentages, response times, customer counts, or reference logos. The only capabilities
> claimed anywhere are four that were confirmed to exist today: geographic redundancy, round-the-clock
> on-call, TLS/SRTP encryption, and STIR/SHAKEN attestation. Everything else on the page is either a
> product feature or a policy commitment the company controls. Please keep it that way — add a metric
> only once it is measured and defensible.

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

## Deploying

To a server that already runs nginx (built for the same CentOS Stream 10 host as the
PhoneSystem portal, behind its Cloudflare tunnel):

```bash
sudo bash deploy/install.sh install --domain info.cloudpathway.org --dry-run   # look first
sudo bash deploy/install.sh install --domain info.cloudpathway.org --import-phonesystem-env
```

It takes over `info.cloudpathway.org` (and nothing else — the bare `cloudpathway.org` is
left alone) from whatever serves it today, and serves it the same way:
through the tunnel when there is one, with the current site's certificate when it has
one, never adding HTTPS or relying on a certificate that cannot renew itself. It checks
the result from the internet's side, puts nginx back if that fails, and can be undone
with `rollback` or `restore-old-site`. Full guide: **[`docs/deploy.md`](docs/deploy.md)**.

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
| `/resellers` | Reseller programme: what a reseller does, what we handle, FAQ |
| `/resellers/apply` | Reseller application form (noindex) |
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
| `201` | Stored, then emailed to `NOTIFY_TO`. Returns `{ ok: true, reference: "CP-000001" }` |
| `202` | Honeypot triggered — faked success, nothing stored |
| `400` | Malformed JSON |
| `422` | Validation failed. Returns `fieldErrors` keyed by field name |
| `429` | More than 3 submissions from one email in 10 minutes |
| `500` | Storage failure |

Abuse handling: a hidden `website` honeypot field (bots fill it, humans never see it) and a
per-email rate limit. Honeypot hits get a fake success so bots do not learn they were caught.

## Reseller applications

Every email the site sends goes to one address, `NOTIFY_TO` (default `12shimmel@gmail.com`);
the site never emails visitors, and each notification's Reply-To is the visitor. Early-access
signups (`/api/contact`) arrive as "Early-access signup — Company (Name)".

`POST /api/reseller-application` stores the application, then emails it to `NOTIFY_TO`
through **Telnyx** — the same
transport and the same API key the PhoneSystem portal uses. The email carries an
**Import into the portal** button that opens the portal's Resellers page with the
applicant's details pre-filled.

```bash
TELNYX_API_KEY=...                   # same key the phone system uses
MAIL_FROM=Cloudpathway <no-reply@cloudpathway.org>
PORTAL_URL=https://portal.cloudpathway.org
NOTIFY_TO=12shimmel@gmail.com        # optional; every email the site sends goes here
```

The application row is committed **before** mail is attempted, and a send failure is
recorded in `mail_status` rather than shown to the applicant — a filled-in form is never
lost to a mail misconfiguration.

Full detail, including the one-file patch the portal needs to consume the import link:
**[`docs/reseller-applications.md`](docs/reseller-applications.md)**.

## Data

Leads land in the `leads` table in `data/cloudpathway.db`, and reseller applications in
`reseller_applications`. Both are created automatically on first submission. The path is overridable with `CLOUDPATHWAY_DB_PATH`. The `data/` directory is
gitignored — this is real customer data, so back it up wherever this is deployed.

Read recent leads:

```bash
node -e "const D=require('better-sqlite3');console.table(new D('data/cloudpathway.db',{readonly:true}).prepare('SELECT id,name,company,email,service,created_at FROM leads ORDER BY id DESC LIMIT 20').all())"
```

## Before going live

These are stand-in values, all in one place:

- **`lib/site.ts`** — phone number, sales/support email addresses, and postal address are still
  placeholders and need replacing. The headline statistics that used to live here have been removed
  entirely; `startupNote` replaces them with a plain statement that the company is new.
- **Lead delivery** — submissions are only written to SQLite. Nothing emails or notifies anyone
  yet. Wire `app/api/contact/route.ts` to email, a CRM, or a webhook so enquiries reach a person.
- **Content review** — copy in `lib/content.ts` describes SIP/PBX capabilities. Confirm each one
  matches what Cloudpathway actually delivers before publishing, and re-check it as the product
  changes. The FAQ answer about what "enterprise-grade" means is the load-bearing one: it names
  four specific capabilities a buyer can test, so it must stay accurate.

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
