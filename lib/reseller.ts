/**
 * Reseller programme content and the mapping from an application to the
 * PhoneSystem portal's reseller fields.
 *
 * Same rule as the rest of the site: no invented numbers. Cloudpathway is
 * pre-launch, so the programme is described in terms of what a reseller
 * *does* and what we commit to, never in terms of a partner count or an
 * average margin nobody has earned yet.
 */

export const whatAResellerDoes = [
  {
    title: "You own the customer",
    body: "The contract, the invoice, the pricing and the relationship are yours. Your customers buy phone service from your company, on your paper, at whatever you decide it is worth. We never contact them directly unless you ask us to.",
  },
  {
    title: "You sell under your own brand",
    body: "The portal your customers log into carries your name, your colours and your support details. Handsets provision against your branding. As far as the end customer is concerned, the phone system is yours.",
  },
  {
    title: "You set the retail price",
    body: "You buy seats, trunks and numbers at a wholesale rate and sell them at whatever the market in front of you will bear. The margin is the difference, and it is yours to widen by being good at your job.",
  },
  {
    title: "You handle first-line support",
    body: "You know your customers and their sites. You take the first call, do the moves-adds-changes yourself in the portal, and escalate to us when it is genuinely the network. We do not put a queue between you and an engineer.",
  },
];

export const whatWeDo = [
  {
    title: "We run the network",
    body: "Carrier relationships, redundant call routing, encrypted signaling, STIR/SHAKEN attestation and the on-call rota are ours. You do not need a NOC, a switch, or a carrier contract of your own.",
  },
  {
    title: "We do the porting paperwork",
    body: "Number ports are the least glamorous part of winning a customer. Send us the bills and the LOAs and we deal with the losing carrier, including the ones that drag their feet.",
  },
  {
    title: "We provision the hardware",
    body: "Handsets ship configured against your brand and your customer's dial plan. Your engineer plugs them in; nobody spends an afternoon typing provisioning URLs.",
  },
  {
    title: "We stay out of your pricing",
    body: "We tell you the wholesale rate and then leave you alone. There is no MSRP we expect you to hold to, and no house account quietly undercutting you on a deal you sourced.",
  },
];

export const goodFit = [
  "MSPs and IT firms already managing their clients' networks",
  "Structured cabling and low-voltage contractors installing handsets anyway",
  "AV and security integrators wanting a recurring-revenue line",
  "Telecoms consultants who currently hand voice work to someone else",
  "Regional carriers and ISPs wanting to add hosted voice without building it",
];

/**
 * What an applicant is told before they fill anything in.
 *
 * Deliberately blunt about being early. Someone who signs up to resell a
 * pre-launch platform needs to know that is what they are doing.
 */
export const beforeYouApply = [
  {
    title: "We are pre-launch, and so is this programme",
    body: "You would be among the first resellers on the platform, not the hundredth. That means unusual access to the people building it and real influence over the roadmap — and it also means you are taking a bet on a young company. We would rather you weighed that with your eyes open.",
  },
  {
    title: "Commercial terms are set with you, not by a form",
    body: "The wholesale rate and margin model depend on what you sell and how much of the support you carry. We work that out in a conversation after we have read your application; nothing on this form commits either of us to a number.",
  },
  {
    title: "We will say no sometimes",
    body: "If we cannot serve your market properly yet, or the fit is wrong, we will tell you rather than sign you up and disappoint you. A reseller who cannot make money is worse than no reseller.",
  },
];

export const resellerFaqs = [
  {
    q: "What does it cost to become a reseller?",
    a: "Nothing to apply, and there is no buy-in fee. You pay wholesale for what your customers actually use. We set the rate with you once we understand the shape of your business — see the note above about commercial terms.",
  },
  {
    q: "Do we need our own carrier or switch?",
    a: "No. That is the whole point of reselling rather than building. We hold the carrier relationships and run the call routing; you need a sales motion, someone who can configure a dial plan in a browser, and a way to invoice your customers.",
  },
  {
    q: "Who do our customers call for support?",
    a: "You, by design. You are the brand they bought from. You handle first-line — password resets, moves, adds, changes, the phone that will not register — and escalate to us when the cause is the platform or the carrier. We answer those escalations directly, not through a ticket queue.",
  },
  {
    q: "Can we keep our existing customers on their current numbers?",
    a: "Yes. Porting is included, and we run it. Bring us the bills and letters of authorisation and we deal with the losing carrier.",
  },
  {
    q: "What happens after we apply?",
    a: "We read it and get back to you, usually within two business days. If there is a fit we will arrange a demo of the platform and a conversation about commercial terms. If there is not, we will tell you that instead of going quiet.",
  },
];

/* ------------------------------------------------------------------------ */
/* Application → portal mapping                                             */
/* ------------------------------------------------------------------------ */

/**
 * The stored value -> what a human should read.
 *
 * The form submits the keys; the email renders the labels. Kept here so the
 * two cannot drift into showing "msp-it" in somebody's inbox.
 */
export const BUSINESS_TYPE_LABELS: Record<string, string> = {
  "msp-it": "MSP / IT services",
  "cabling-lowvoltage": "Cabling / low-voltage contractor",
  "av-security": "AV or security integrator",
  "telecom-consultant": "Telecoms consultant / broker",
  "carrier-isp": "Carrier, ISP or WISP",
  other: "Something else",
};

export const SELLS_VOICE_LABELS: Record<string, string> = {
  "yes-reselling": "Yes — resells someone else's voice today",
  "yes-referring": "Yes — refers voice out to a partner",
  "no-new-line": "No — this would be a new line of business",
};

export type ResellerApplication = {
  companyName: string;
  website: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  brandName: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  businessType: string;
  currentCustomers: string | null;
  expectedSeats: string | null;
  sellsVoiceToday: string;
  territory: string | null;
  notes: string;
};

/** The portal's own slug rule, from `server/src/lib/slug.js` in PhoneSystem. */
export function slugify(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * The subset of the portal's reseller fields an application can safely fill.
 *
 * Deliberately omits `reseller_plan_id`, `wholesale_discount_pct` and
 * `margin_cents`: the portal's own code says the commercial agreement is
 * "picked with them; it is not self-serve", and an applicant should not be
 * able to propose their own margin by editing a form. `admin_password` is
 * omitted too — a credential does not belong in a URL or an inbox.
 */
export function portalPrefill(app: ResellerApplication): Record<string, string> {
  return {
    name: app.companyName,
    slug: slugify(app.companyName),
    brand_name: app.brandName || app.companyName,
    support_email: app.supportEmail || app.contactEmail,
    support_phone: app.supportPhone || app.contactPhone || "",
    admin_name: app.contactName,
    admin_email: app.contactEmail,
  };
}

/**
 * The "import into the portal" link that goes in the notification email.
 *
 * It carries the prefill as base64url JSON and lands on the portal's own
 * Resellers page, which is super-admin gated. Nothing is created by following
 * the link — the form opens filled in, and a human reviews it, sets the
 * commercial terms and saves. That keeps platform credentials out of this
 * marketing site entirely, and matches how the portal already expects
 * resellers to be created.
 */
export function portalImportUrl(app: ResellerApplication, reference: string): string | null {
  const portal = (process.env.PORTAL_URL || "").replace(/\/+$/, "");
  if (!portal) return null;
  const payload = JSON.stringify({ ...portalPrefill(app), source: "website", reference });
  const token = Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${portal}/resellers?import=${token}`;
}
