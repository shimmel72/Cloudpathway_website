# Reseller applications: how the flow works

An application submitted at `/resellers/apply` is stored, emailed to you through
Telnyx, and the email carries a button that opens the PhoneSystem portal with the
applicant's details already in the reseller form.

```
/resellers/apply ──▶ POST /api/reseller-application
                          │
                          ├─▶ SQLite  (reseller_applications)   ← always, first
                          │
                          └─▶ Telnyx  POST /v2/email_messages
                                    │
                                    └─▶ your inbox
                                          │
                                          └─▶ [Import into the portal →]
                                                    │
                                                    ▼
                                        portal /resellers?import=<token>
                                        form pre-filled · you review · you save
```

## Configuration

Set these on the website deployment. `TELNYX_API_KEY` is the same key the phone
system already uses for numbers and SMS — one account, one bill.

```bash
TELNYX_API_KEY=KEY0123...            # same key as the portal
MAIL_FROM=Cloudpathway <no-reply@cloudpathway.org>
PORTAL_URL=https://portal.cloudpathway.org
RESELLER_APPLICATION_TO=12shimmel@gmail.com   # optional; this is the default
TELNYX_API_URL=                      # optional override, defaults to api.telnyx.com
```

`MAIL_FROM` must be an address on a domain **verified under Email → Domains in
the Telnyx portal**. Telnyx sends only as a domain it has verified, so a key
alone is not enough — the site reports mail as *not configured* rather than
sending from an address that will bounce. The phone system repo's
`docs/telnyx-email.md` walks the whole DNS chain, and
`node scripts/telnyx-email.mjs --domain cloudpathway.org --create` does it
interactively. That setup covers this site too; nothing extra is needed here.

### The request shape is deliberately identical to the portal's

`lib/telnyx-mail.ts` is a port of `server/src/lib/telnyx-mail.js` from the
PhoneSystem repo, field for field, including two quirks learned there from real
refusals on a live account:

- `from` takes the **bare address**; the display name goes in `from_name`.
  Sending `Cloudpathway <no-reply@…>` whole in `from` is rejected with
  *"from_email has invalid format"*.
- The bodies are `text_body` and `html_body`, not nodemailer's `text`/`html`.
  Getting that wrong sends an empty message that is accepted and delivered.

If Telnyx ever rejects `from_name` by name, the message is sent again without it —
same fallback the portal has.

## An application is never lost to a mail failure

The row is committed before any mail is attempted, and a send failure is recorded
on the row in `mail_status` rather than returned to the applicant. Somebody who
filled in a five-minute form should not be told to try again because our SMTP
credentials are wrong.

Find applications whose email did not go out:

```bash
node -e "const D=require('better-sqlite3');console.table(new D('data/cloudpathway.db',{readonly:true}).prepare(\"SELECT id,company_name,contact_email,mail_status,created_at FROM reseller_applications WHERE mail_status IS NULL OR mail_status NOT LIKE 'accepted%' ORDER BY id DESC\").all())"
```

## The import button

The button links to `{PORTAL_URL}/resellers?import=<base64url JSON>`. Following it
**creates nothing**. It opens the portal's existing Resellers page — which is
already super-admin gated — with the create form pre-filled, for you to review,
set the commercial terms, and save.

Only these fields travel:

| Application field | Portal field |
| --- | --- |
| Company name | `name` |
| Brand name, or company name | `brand_name` |
| Support email, or contact email | `support_email` |
| Support phone, or contact phone | `support_phone` |
| Contact name | `admin_name` |
| Contact email | `admin_email` |

**Not** `reseller_plan_id`, `wholesale_discount_pct` or `margin_cents`. The portal's
own code says the agreement is "picked with them; it is not self-serve", and a
margin arriving in a URL is a margin somebody could propose for themselves. Not
`admin_password` either — a credential does not belong in a URL or an inbox. The
portal side re-applies that whitelist when decoding, so a hand-crafted link cannot
widen it.

### Why the website does not create the reseller itself

The portal has no machine authentication. Every request needs a JWT tied to a
login session that `authenticate()` re-reads per request; there is no API key or
service account. Creating resellers automatically from here would mean storing a
super-admin credential in a public marketing site — a credential that administers
every reseller and customer on the platform. Pre-filling a form the admin then
saves gets the same minute of typing back without that trade.

### Applying the portal patch

`PORTAL_URL` can be set before the portal understands `?import=` — the link simply
lands on the Resellers page, and every field is in the email body to copy from. To
make the button pre-fill the form, apply the patch in this directory:

```bash
cd /path/to/PhoneSystem
git apply /path/to/Cloudpathway_website/docs/phonesystem-reseller-import.patch
```

It touches one file, `web/src/pages/Resellers.tsx` (+60 −2), and follows the
`useSearchParams` pattern already used by Quotes, Customers and Plans in that
codebase. It typechecks against the portal's own `tsconfig.json`. The token is
read once and removed from the URL, so a refresh does not reopen the form and the
applicant's details do not linger in the address bar.

## Abuse handling

Same two measures as the contact form: a hidden `website2` honeypot (a filled one
gets a fake success so bots learn nothing), and a limit of two applications per
email address per thirty minutes.

Everything an applicant types reaches your inbox as HTML, so every value in the
email is escaped, and the website field is rendered as a link only when it parses
as a real http(s) URL with a dotted hostname — otherwise it is shown as plain
text. There is no path that writes applicant input into the message raw.
