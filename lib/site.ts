/**
 * Central site configuration.
 *
 * PLACEHOLDER VALUES: the contact details, legal entity details and the
 * headline statistics below are stand-ins so the site renders completely.
 * Replace them with Cloudpathway's real details before going live.
 */
export const site = {
  name: "Cloudpathway",
  legalName: "Cloudpathway Communications",
  domain: "cloudpathway.org",
  url: "https://cloudpathway.org",
  tagline: "Business phone service that just works",
  description:
    "Cloudpathway delivers carrier-grade SIP trunking and hosted PBX for businesses that need their phones to work every single day.",

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
  supportHours: "24/7/365 for outages · 7am–7pm MT for everything else",
  // --- end placeholders ---
} as const;

/** Headline numbers used in the stat strips. PLACEHOLDER — confirm before launch. */
export const stats = [
  { value: "99.999%", label: "Voice platform uptime SLA" },
  { value: "< 60s", label: "Median support pickup time" },
  { value: "4", label: "Geo-redundant data centers" },
  { value: "40+", label: "Countries reachable on-net" },
] as const;

export const nav = [
  { href: "/services", label: "Services" },
  { href: "/features", label: "Features" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;
