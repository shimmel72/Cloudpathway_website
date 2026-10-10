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
    "Cloudpathway is building SIP trunking and hosted PBX on enterprise-grade infrastructure. The service is in development and will be available soon — join the early-access list to hear first.",

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
  supportHours: "On call around the clock for outages",
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
    "Join the early-access list and we will tell you the moment it is ready. If you would like to see the platform as it stands, ask for a demo.",
  ],
} as const;

/**
 * Launch status, shown on every page. While the service is in development this
 * is the site's headline message; change it here when that changes.
 */
export const launch = {
  label: "In development · available soon",
  banner: "Cloudpathway is in development — SIP trunking and hosted PBX will be available soon.",
  cta: { href: "/contact", label: "Get early access" },
} as const;

export const nav = [
  { href: "/services", label: "Services" },
  { href: "/features", label: "Features" },
  { href: "/resellers", label: "Resellers" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;
