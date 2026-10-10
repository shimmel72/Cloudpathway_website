/**
 * Central site configuration.
 *
 * PLACEHOLDER VALUES: the details marked below are stand-ins so the site
 * renders completely. Replace them with Cloudpathway's real details before
 * going live. The phone number is real.
 *
 * NOTE ON CLAIMS: this site deliberately makes no performance or customer-base
 * claims. Cloudpathway is in development. The only capabilities asserted anywhere
 * are ones confirmed to exist today: geographic redundancy, round-the-clock
 * on-call, encrypted signaling and media, and STIR/SHAKEN attestation. Do not
 * add uptime percentages, customer counts, or response-time figures until they
 * are measured and defensible.
 */
export const site = {
  name: "Cloudpathway",
  legalName: "Cloudpathway Communications",
  // The website's own address. The bare cloudpathway.org is not this site's
  // (the installer never makes this site answer it); email stays on the
  // cloudpathway.org domain.
  domain: "info.cloudpathway.org",
  url: "https://info.cloudpathway.org",
  tagline: "Enterprise-grade business voice, coming soon",
  description:
    "Cloudpathway SIP trunking and hosted PBX are in development and will be available soon. Join the early-access list to hear first, or ask for a demo.",

  phone: "+1 (740) 730-9700",
  phoneHref: "tel:+17407309700",

  // --- PLACEHOLDER: replace with real contact details ---
  salesEmail: "sales@cloudpathway.org",
  supportEmail: "support@cloudpathway.org",
  address: {
    line1: "1200 Network Drive, Suite 400",
    city: "Denver",
    state: "CO",
    zip: "80202",
    country: "USA",
  },
  supportHours: "Round-the-clock on-call for outages, from launch",
  // --- end placeholders ---
} as const;

/**
 * Replaces the headline stat strip. We are in development, so there are no metrics
 * to put here that would not be invented.
 */
export const startupNote = {
  heading: "In development. Available soon.",
  body: [
    "Cloudpathway SIP trunking and hosted PBX are being built now, and they are not available to buy yet. We will open them up soon — and the people on the early-access list hear first.",
    "It is not a side project. The platform is being built on geographically redundant call routing, with encrypted signaling and media, STIR/SHAKEN attestation, and somebody on call around the clock. What it does not have yet is customers, and we would rather say so plainly.",
    "If you would like to see the platform before launch, ask for a demo — we will build your call flow so you can test it yourself.",
  ],
} as const;

/**
 * Launch status, shown on every page. While the service is in development this
 * is the site's headline message; change it here when that changes.
 */
export const launch = {
  label: "In development · available soon",
  banner: {
    status: "In development",
    long: "SIP trunking and hosted PBX will be available soon.",
    short: "Available soon.",
  },
  // What the form actually does: a list we tell first, plus demos on request.
  // `short` is for the header button, where space is tight.
  cta: { href: "/contact", label: "Join the early-access list", short: "Get notified" },
} as const;

/**
 * Metadata for an inner page. Next replaces, rather than merges, a parent's
 * openGraph, so each page sets its own — otherwise every share preview shows
 * the home page's title, description and URL.
 */
export function pageMeta(title: string, description: string, path: string) {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website" as const, siteName: site.name, title: `${title} · ${site.name}`, description, url: path },
  };
}

export const nav = [
  { href: "/services", label: "Services" },
  { href: "/features", label: "Features" },
  { href: "/resellers", label: "Resellers" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;
