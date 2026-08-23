import type { Metadata } from "next";
import { process, values } from "@/lib/content";
import { site } from "@/lib/site";
import { Globe, Headset, Shield, Users } from "@/components/Icons";
import {
  Card,
  CheckItem,
  Container,
  CtaBand,
  Eyebrow,
  Section,
  SectionHeading,
} from "@/components/ui";

export const metadata: Metadata = {
  title: "About",
  description: `Who ${site.name} is: a new, independent voice provider running SIP trunking and hosted PBX on enterprise-grade infrastructure, with engineers you can actually reach.`,
};

const infrastructure = [
  {
    icon: Globe,
    title: "Redundant by design",
    body: "Calls are served from more than one geographically separated facility. Losing a facility reroutes traffic; it does not take your phones down.",
  },
  {
    icon: Shield,
    title: "Secured end to end",
    body: "TLS for SIP signaling and SRTP for media. Outbound calls carry STIR/SHAKEN attestation so your legitimate calls are less likely to be flagged as spam.",
  },
  {
    icon: Headset,
    title: "On call around the clock",
    body: "Outages reach a person at any hour — one with access to the platform, not a message-taking service that opens a ticket for the morning.",
  },
  {
    icon: Users,
    title: "Independent and direct",
    body: "We are not a reseller passing your ticket up a chain. We run the platform, hold the carrier relationships, and own the fix.",
  },
];

/** Deliberately capabilities, not metrics. We are pre-launch; there is nothing to measure yet. */
const canBackUp = [
  "Geographically redundant call routing",
  "TLS signaling and SRTP media encryption",
  "STIR/SHAKEN attestation on outbound calls",
  "Round-the-clock on-call for outages",
  "Month-to-month terms on every service",
  "Demos built to your requirements, on request",
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
              {site.name} is a new, independent business voice provider. We run our own SIP and
              hosted PBX platform, hold our own carrier relationships, and answer our own support
              calls &mdash; so when something goes wrong there is nobody for us to point at.
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
              title="A new company, and we would rather lead with that"
            />
            <div className="mt-6 space-y-5 text-base leading-relaxed text-body">
              <p>
                Most of the marketing in this industry is written to sound established. Uptime
                figures nobody audits, customer counts nobody verifies, a logo wall assembled from
                anyone who ever ran a trial. We decided not to do that, partly because it is
                dishonest and partly because it is fragile &mdash; the first time a buyer catches one
                padded number, every other claim on the page becomes suspect.
              </p>
              <p>
                So: {site.name} is pre-launch. We have built the platform, we are confident in the
                engineering behind it, and we are looking for the first businesses willing to put
                it to work. What we are offering those early customers is not a discount in
                exchange for being guinea pigs. It is unusually direct access to the people who
                built the thing, and terms that let you leave without penalty if we disappoint you.
              </p>
              <p>
                We have deliberately kept the business narrow. We do SIP trunking and hosted PBX,
                and we intend to do them properly. We are not also selling you internet circuits,
                security cameras, or a productivity suite. That focus is why an engineer here can
                hold your entire call flow in their head when you ring.
              </p>
            </div>
          </div>

          <Card className="h-fit">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-faint">
              What we can back up today
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-body">
              No uptime percentages or customer counts, because we have not run long enough to
              have earned either. These are capabilities you can verify in a demo:
            </p>
            <ul className="mt-5 space-y-3">
              {canBackUp.map((item) => (
                <CheckItem key={item}>{item}</CheckItem>
              ))}
            </ul>
          </Card>
        </div>
      </Section>

      {/* Who we're building for */}
      <Section tone="muted">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <SectionHeading
            eyebrow="Who we're building for"
            title="Businesses where the phone genuinely matters"
          />
          <div className="space-y-5 text-base leading-relaxed text-body">
            <p>
              We are designing for organisations that notice within a minute when the phones stop
              &mdash; clinics, property managers, dispatch operations, professional services firms,
              and small contact centers. Places where a missed call is a lost patient, a lost
              tenant, or a lost job.
            </p>
            <p>
              That is a demanding customer to serve as a new company, and we know it. It is also
              the only kind of customer worth building this for. If your phone system is
              incidental to your business, there are cheaper options than us and we will say so.
            </p>
          </div>
        </div>
      </Section>

      {/* Values */}
      <Section>
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
      <Section tone="muted">
        <SectionHeading
          eyebrow="The network"
          title="What sits behind your dial tone"
          lead="You should not have to care about any of this. It is here so you can confirm we do — and so you know exactly what to test when we demo it."
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
      <Section id="process">
        <SectionHeading
          eyebrow="Working with us"
          title="What happens after you get in touch"
          lead="No pressure sequence, no seven-touch nurture campaign. A conversation, a demo if you want one, a written proposal, and a migration we run."
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
        title="Come test it yourself"
        body="The first call is with someone who can answer technical questions, because that is who you will be working with anyway. Ask for a demo and we will build your call flow so you can try to break it."
      />
    </>
  );
}
