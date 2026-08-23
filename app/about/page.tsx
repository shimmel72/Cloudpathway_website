import type { Metadata } from "next";
import { process, values } from "@/lib/content";
import { site, stats } from "@/lib/site";
import { Globe, Headset, Shield, Users } from "@/components/Icons";
import {
  Card,
  Container,
  CtaBand,
  Eyebrow,
  Section,
  SectionHeading,
  Stat,
} from "@/components/ui";

export const metadata: Metadata = {
  title: "About",
  description: `Who ${site.name} is: an independent voice provider running carrier-grade SIP and hosted PBX infrastructure, with engineers you can actually reach.`,
};

const infrastructure = [
  {
    icon: Globe,
    title: "Redundant by design",
    body: "Calls are served from multiple geographically separated data centers with independent upstream carriers. Losing a facility reroutes traffic; it does not take your phones down.",
  },
  {
    icon: Shield,
    title: "Secured end to end",
    body: "TLS signaling, SRTP media, per-trunk spend caps, and continuous fraud monitoring. STIR/SHAKEN attestation keeps your legitimate calls out of spam folders.",
  },
  {
    icon: Headset,
    title: "Monitored around the clock",
    body: "Automated call-quality probes run continuously against every route. We usually know about a carrier problem before customers notice it, and we say so.",
  },
  {
    icon: Users,
    title: "Independent and direct",
    body: "We are not a reseller passing your ticket up a chain. We run the platform, hold the carrier relationships, and own the fix.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="border-b border-subtle bg-surface-muted">
        <Container className="py-16 sm:py-20">
          <div className="max-w-3xl">
            <Eyebrow>About us</Eyebrow>
            <h1 className="text-4xl font-semibold sm:text-5xl">
              We are the phone company you can actually get on the phone
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-body">
              {site.name} is an independent business voice provider. We run our own SIP and hosted
              PBX platform, hold our own carrier relationships, and support our own customers — so
              when something goes wrong there is nobody for us to point at.
            </p>
          </div>
        </Container>
      </section>

      {/* Story */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <SectionHeading
              eyebrow="Who we are"
              title="Built by people who got tired of bad phone service"
            />
            <div className="mt-6 space-y-5 text-base leading-relaxed text-body">
              <p>
                Every one of us has been the person on hold with a carrier while a sales floor sits
                silent and someone senior asks for an ETA we do not have. That experience shaped
                what {site.name} is: a voice provider small enough that you get a straight answer,
                running infrastructure serious enough that you rarely need one.
              </p>
              <p>
                We deliberately kept the business narrow. We do SIP trunking and hosted PBX for
                businesses, and we do them properly. We are not trying to sell you internet
                circuits, security cameras, or a productivity suite. That focus is why our
                engineers can hold your entire call flow in their head when you ring.
              </p>
              <p>
                Our customers tend to be organisations where the phone genuinely matters — clinics,
                property managers, dispatch operations, professional services firms, and contact
                centers. They are not looking for the cheapest possible dial tone. They are looking
                for something that stops being a problem.
              </p>
            </div>
          </div>

          <Card className="h-fit">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-faint">
              At a glance
            </h3>
            <dl className="mt-6 space-y-6">
              {stats.map((s) => (
                <div key={s.label}>
                  <Stat value={s.value} label={s.label} />
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </Section>

      {/* Values */}
      <Section tone="muted">
        <SectionHeading
          eyebrow="How we operate"
          title="Four things we hold ourselves to"
          lead="These are not posters on a wall. They are the rules we use when a decision is genuinely close."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {values.map((v, i) => (
            <Card key={v.title}>
              <span className="text-xs font-semibold tracking-[0.14em] text-brand-500">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-strong">{v.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-body">{v.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* Infrastructure */}
      <Section>
        <SectionHeading
          eyebrow="The network"
          title="What sits behind your dial tone"
          lead="You should not have to care about any of this. It is here so you can confirm we do."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {infrastructure.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-4">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-strong">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-body">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Process */}
      <Section tone="muted" id="process">
        <SectionHeading
          eyebrow="Working with us"
          title="What happens after you get in touch"
          lead="No pressure sequence, no seven-touch nurture campaign. A conversation, a written proposal, and a migration we run."
        />
        <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {process.map((p) => (
            <li key={p.step} className="surface-card rounded-xl p-5">
              <span className="text-xs font-semibold tracking-[0.14em] text-brand-500">{p.step}</span>
              <h3 className="mt-3 text-base font-semibold text-strong">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-body">{p.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <CtaBand
        title="Come talk to an engineer"
        body="The first call is with someone who can answer technical questions, because that is who you will be working with anyway."
      />
    </>
  );
}
