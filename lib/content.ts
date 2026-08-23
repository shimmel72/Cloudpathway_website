export type Service = {
  slug: string;
  name: string;
  kicker: string;
  summary: string;
  bestFor: string;
  highlights: { title: string; body: string }[];
  includes: string[];
};

export const services: Service[] = [
  {
    slug: "sip-trunking",
    name: "SIP Trunking",
    kicker: "Keep your PBX. Replace the phone lines.",
    summary:
      "If you already own a phone system you like, you don't need to throw it away to get off legacy copper. Our SIP trunks connect your existing PBX to the public telephone network over your internet or a dedicated circuit — usually at a fraction of what PRI and analog lines cost, with capacity you can change in an afternoon instead of a quarter.",
    bestFor:
      "Businesses with an existing on-premise PBX, a contact center platform, or a UC system they want to keep.",
    highlights: [
      {
        title: "Concurrent calls, not fixed lines",
        body: "Buy the number of simultaneous calls you actually need instead of channels in blocks of 23. Burst above your commitment during busy season and settle up per minute — no truck roll, no new hardware.",
      },
      {
        title: "Automatic failover that actually fails over",
        body: "If your primary circuit drops, calls reroute to a backup trunk, a mobile number, or a whole other site within seconds. You configure the rules once; we enforce them at the network edge, not at your router.",
      },
      {
        title: "Bring your numbers with you",
        body: "We handle porting end to end, including the paperwork your current carrier would rather you never finish. Main numbers, DID blocks, toll-free, and fax lines all move — and we schedule the cutover for a time that suits you.",
      },
      {
        title: "Fraud protection on by default",
        body: "Per-trunk spend caps, destination allow-lists, and anomaly alerting are standard. If someone finds a way into your PBX at 2am, the bleeding stops in minutes instead of showing up on a five-figure invoice.",
      },
    ],
    includes: [
      "IP authentication or SIP registration",
      "Unlimited inbound channels on request",
      "Direct inward dial (DID) numbers in 40+ countries",
      "Toll-free origination and termination",
      "E911 address registration and validation",
      "CNAM (caller ID name) delivery and storage",
      "T.38 fax and G.711 / G.729 / Opus codec support",
      "Real-time CDR access and monthly usage exports",
      "Interoperability testing with your PBX vendor",
      "Static IP or SRV-based redundancy",
    ],
  },
  {
    slug: "hosted-pbx",
    name: "Hosted PBX",
    kicker: "A complete phone system, without the phone system.",
    summary:
      "A full-featured business phone platform that lives in our data centers instead of your closet. Every extension, auto attendant, call queue and voicemail box is managed from a browser. Your team answers on desk phones, laptops, or their mobiles — same number, same features, wherever they are.",
    bestFor:
      "Companies opening a new office, running out of runway on aging hardware, or supporting staff across multiple sites and home offices.",
    highlights: [
      {
        title: "One system across every location",
        body: "Extension dialing between offices, shared directories, and a single dial plan — whether you have two sites or twenty. Adding a location is a configuration change, not a project.",
      },
      {
        title: "Desk phones arrive ready to use",
        body: "We provision handsets before they ship. Staff plug them into the network and they register, pull down the directory, and start ringing. No per-phone setup, no on-site technician.",
      },
      {
        title: "Route calls the way your business runs",
        body: "Build IVR menus, time-of-day rules, holiday schedules, ring groups and skills-based queues in a visual editor. Change them yourself in minutes — you are never waiting on a carrier ticket to move a lunch break.",
      },
      {
        title: "Your desk phone in your pocket",
        body: "Softphone apps for iOS, Android, Windows and macOS carry the same extension and caller ID. Staff make business calls without giving out personal mobile numbers, and transfers between devices are seamless mid-call.",
      },
    ],
    includes: [
      "Unlimited extensions and user accounts",
      "Multi-level auto attendant / IVR",
      "Call queues with skills-based and overflow routing",
      "Voicemail-to-email with speech-to-text transcription",
      "Mobile and desktop softphone applications",
      "Zero-touch desk phone provisioning",
      "Call recording with configurable retention",
      "Audio conference bridges and meeting rooms",
      "Business SMS and MMS on your main numbers",
      "Live wallboards and historical call reporting",
    ],
  },
];

export type FeatureGroup = {
  name: string;
  blurb: string;
  features: { title: string; body: string }[];
};

export const featureGroups: FeatureGroup[] = [
  {
    name: "Call handling & routing",
    blurb: "Get every call to the right person on the first try.",
    features: [
      { title: "Multi-level auto attendant", body: "Greet callers with menus that branch by department, language, or time of day, nested as deep as you need." },
      { title: "Call queues", body: "Hold callers with position announcements and estimated wait times, then distribute by longest-idle, skills, or priority." },
      { title: "Ring groups", body: "Ring a whole team simultaneously or in sequence, with per-member delays and no-answer fallbacks." },
      { title: "Time-based routing", body: "Business hours, after hours, lunch, and holiday schedules that switch automatically, with a manual override button." },
      { title: "Find me / follow me", body: "Chase a person across desk, mobile, and home phone in the order they choose before falling back to voicemail." },
      { title: "Call parking & pickup", body: "Park a call on a shared slot and let anyone in the office collect it from any handset." },
    ],
  },
  {
    name: "Team collaboration",
    blurb: "The everyday tools your staff actually touch.",
    features: [
      { title: "Softphone apps", body: "Native iOS, Android, Windows, and macOS clients carrying your extension, directory, and caller ID." },
      { title: "Presence & BLF", body: "See at a glance who is on a call, away, or free — on the handset display and in the app." },
      { title: "Business SMS & MMS", body: "Send and receive texts on your main business numbers, with shared inboxes for teams." },
      { title: "Conference bridges", body: "Dedicated dial-in meeting rooms with PINs, moderator controls, and optional recording." },
      { title: "Voicemail transcription", body: "Voicemails arrive as email with an audio file and a searchable text transcript." },
      { title: "Intercom & paging", body: "Broadcast to a zone of handsets or overhead speakers for announcements and shift changes." },
    ],
  },
  {
    name: "Administration",
    blurb: "Change your own phone system without filing a ticket.",
    features: [
      { title: "Browser-based admin portal", body: "Add users, move extensions, and rewrite call flows yourself, with changes live in seconds." },
      { title: "Zero-touch provisioning", body: "Handsets configure themselves on first boot — ship them straight to a new hire's home office." },
      { title: "Role-based access", body: "Give office managers control of their own site without handing over the whole account." },
      { title: "Change history", body: "Every configuration change is logged with who made it and when, and can be rolled back." },
      { title: "Bulk user management", body: "Onboard or offboard dozens of staff at once by CSV import instead of one form at a time." },
      { title: "Consolidated billing", body: "One itemized invoice across every site, with cost centers mapped to your own departments." },
    ],
  },
  {
    name: "Reliability & security",
    blurb: "The parts you only notice when they are missing.",
    features: [
      { title: "Geo-redundant platform", body: "Calls are served from multiple data centers; losing one is a routing event, not an outage." },
      { title: "Automatic failover", body: "Site down? Calls reroute to a backup location or mobile numbers within seconds by pre-set rules." },
      { title: "Toll-fraud protection", body: "Spend caps, destination allow-lists, and anomaly alerting stop abuse before it becomes an invoice." },
      { title: "Encrypted signaling & media", body: "TLS for SIP signaling and SRTP for audio available on every trunk and extension." },
      { title: "STIR/SHAKEN attestation", body: "Full A-level attestation so your legitimate calls are less likely to be flagged as spam." },
      { title: "E911 with dynamic location", body: "Registered dispatchable addresses per extension, including for remote and roaming staff." },
    ],
  },
  {
    name: "Reporting & integrations",
    blurb: "Connect the phones to the rest of your business.",
    features: [
      { title: "Live wallboards", body: "Real-time queue depth, agent status, and answer rates on a screen your team can see." },
      { title: "Historical reporting", body: "Call volume, abandonment, talk time, and service levels sliced by team, number, or interval." },
      { title: "CRM screen pops", body: "Match inbound numbers against your CRM and open the record before your rep says hello." },
      { title: "Microsoft Teams direct routing", body: "Keep Teams as the client and use our network for the calls — often at a lower cost per seat." },
      { title: "REST API & webhooks", body: "Provision users, pull CDRs, and subscribe to call events from your own applications." },
      { title: "Call recording exports", body: "Automatic delivery to your own storage bucket for compliance and quality review." },
    ],
  },
];

export const differentiators = [
  {
    icon: "headset",
    title: "You reach a human who can fix it",
    body: "Support is staffed by engineers with access to the platform, not a script and an escalation queue. When you call about a problem, the person answering can look at your actual call flow while you are still on the line.",
  },
  {
    icon: "chart",
    title: "Quotes with no asterisks",
    body: "Our proposals list every recurring charge, every one-time cost, and every regulatory fee we know about. The number at the bottom is the number on your first invoice.",
  },
  {
    icon: "bolt",
    title: "We do the migration work",
    body: "Porting, dial plan mapping, handset provisioning, and interoperability testing are part of onboarding — not a professional-services line item you find out about later.",
  },
  {
    icon: "shield",
    title: "No hostage contracts",
    body: "Month-to-month is available on every service, and your numbers are yours. If you decide to leave, we port them out promptly and without a retention gauntlet.",
  },
] as const;

export const process = [
  { step: "01", title: "Discovery call", body: "Thirty minutes on what you run today, what breaks, and what you actually need. No slide deck." },
  { step: "02", title: "Written proposal", body: "A design and an itemized quote, usually within two business days, including migration steps and timeline." },
  { step: "03", title: "Build & test", body: "We stand up your dial plan in parallel with your existing service and test it with you before anything cuts over." },
  { step: "04", title: "Port & go live", body: "Numbers move on a scheduled window with an engineer on the call. Old service stays up until we are all satisfied." },
  { step: "05", title: "Ongoing support", body: "Direct access to the same engineers, plus changes you can make yourself whenever you like." },
];

export const values = [
  { title: "Answer the phone", body: "We sell telephone service. It would be absurd for us to be hard to reach — so we are not." },
  { title: "Explain the tradeoff", body: "Sometimes the cheaper option is genuinely worse. We would rather tell you why than quietly sell you the wrong thing." },
  { title: "Design for the bad day", body: "Anyone can carry calls when the network is healthy. We plan around the circuit cut and the failed power supply." },
  { title: "Leave it better documented", body: "You get the diagrams, the credentials, and the dial plan for the system you paid for. It is yours." },
];

export const faqs = [
  {
    q: "Can we keep our existing phone numbers?",
    a: "Yes. Number porting is included with every service, covering main numbers, DID blocks, toll-free, and fax lines. We handle the paperwork with your current carrier and schedule the cutover with you — most ports complete in two to four weeks depending on the losing carrier.",
  },
  {
    q: "What internet connection do we need?",
    a: "Roughly 100 Kbps per concurrent call with G.711, or about a third of that with G.729. Far more important than raw bandwidth is consistency — we will review your circuit and, if it makes sense, recommend QoS settings or a separate voice VLAN. For high call volumes we can deliver over a dedicated circuit instead of the public internet.",
  },
  {
    q: "What happens if our internet goes down?",
    a: "Inbound calls reroute automatically according to rules you set in advance — to another site, to a backup trunk, to mobile numbers, or straight to voicemail. Because the failover happens in our network rather than on your equipment, it works even when the site is completely dark.",
  },
  {
    q: "Do we have to replace our phone system?",
    a: "No. If you have a PBX that works, SIP trunking keeps it and just replaces the lines. Hosted PBX is there for when the hardware is at end of life, you are opening a new site, or you want to stop maintaining a phone system entirely.",
  },
  {
    q: "Can we keep our desk phones?",
    a: "Usually. Most SIP handsets from the last decade — Poly, Yealink, Cisco, Grandstream, Snom — work with our platform, and we can reprovision them for you. We will tell you honestly if a model is too old to be worth keeping.",
  },
  {
    q: "How long are the contracts?",
    a: "Month-to-month is available on every service. Longer terms are available if you would prefer a lower rate in exchange for commitment, but that is your choice rather than a requirement.",
  },
];
