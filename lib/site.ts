/**
 * Central site configuration.
 *
 * PLACEHOLDER VALUES: the contact and legal entity details below are stand-ins
 * so the site renders completely. Replace them with Cloudpathway's real details
 * before going live.
 *
 * NOTE ON CLAIMS: this site deliberately makes no performance or customer-base
 * claims. Cloudpathway is pre-launch. The only capabilities asserted anywhere
 * are ones confirmed to exist today: geographic redundancy, round-the-clock
 * on-call, encrypted signaling and media, and STIR/SHAKEN attestation. Do not
 * add uptime percentages, customer counts, or response-time figures until they
 * are measured and defensible.
 */
export const site = {
  name: "Cloudpathway",
  legalName: "Cloudpathway Communications",
  domain: "cloudpathway.org",
  url: "https://cloudpathway.org",
  tagline: "Enterprise-grade voice from a new company",
  description:
    "Cloudpathway is a new voice provider building SIP trunking and hosted PBX on enterprise-grade infrastructure. We are pre-launch — book a demo and judge the platform for yourself.",

  // --- PLACEHOLDER: replace with real contact details ---
  phone: "+1 (555) 013-7000",
  phoneHref: "tel:+15550137000",
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
 * Replaces the headline stat strip. We are pre-launch, so there are no metrics
 * to put here that would not be invented.
 */
export const startupNote = {
  heading: "We're a new company. We'd rather say so.",
  body: [
    "That means we have no decade of uptime charts to wave at you. It also means no legacy billing platform, no offshore support tier, and no five-year contract with an early-termination clause buried on page nine.",
    "The platform itself is not a prototype. It runs on geographically redundant infrastructure, signaling and media are encrypted, calls carry STIR/SHAKEN attestation, and somebody is on call around the clock. What it does not have yet is other people's mileage.",
    "So we would rather show you than tell you. Ask for a demo and put it through its paces before you commit to anything.",
  ],
} as const;

export const nav = [
  { href: "/services", label: "Services" },
  { href: "/features", label: "Features" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;
