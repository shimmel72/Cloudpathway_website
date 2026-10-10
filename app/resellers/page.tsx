import type { Metadata } from "next";
import Link from "next/link";
import { beforeYouApply, goodFit, resellerFaqs, whatAResellerDoes, whatWeDo } from "@/lib/reseller";
import { launch, pageMeta, site } from "@/lib/site";
import { Bolt, Check, Chart, Globe, Headset, Shield, Sliders, Users } from "@/components/Icons";
import {
  Button,
  Card,
  CheckItem,
  Container,
  Eyebrow,
  Section,
  SectionHeading,
  StatusPill,
} from "@/components/ui";

export const metadata: Metadata = pageMeta(
  "Resellers",
  `Resell ${site.name} SIP trunking and hosted PBX under your own brand. In development and available soon — reseller applications are open now.`,
  "/resellers",
);

const doesIcons = [Users, Sliders, Chart, Headset];
const weDoIcons = [Globe, Bolt, Shield, Check];

export default function ResellersPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-950 dot-grid">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-brand-600/20 blur-3xl"
        />
        <Container className="relative py-20 sm:py-24">
          <div className="max-w-3xl">
            <StatusPill dark>{launch.label} &middot; reseller applications open</StatusPill>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.08] text-white sm:text-5xl">
              Sell phone service under your own name. We&rsquo;ll run the{" "}
              <span className="bg-gradient-to-r from-brand-300 to-accent-300 bg-clip-text text-transparent">
                network
              </span>
              .
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-300">
              Your customers already ask you to fix their phones. This is how you own that instead
              of handing it to a carrier who then owns the relationship. You keep the customer, the
              branding and the margin; we keep the carriers, the redundancy and the on-call rota.
              {" "}{site.name} is in development and launching soon &mdash; apply now and, if we are
              a fit, you can be selling from day one.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button href="/resellers/apply" variant="primary" withArrow>
                Apply to become a reseller
              </Button>
              <Button href="#how-it-works" variant="ghost">
                How it works
              </Button>
            </div>
          </div>
        </Container>
      </section>

      {/* What a reseller does */}
      <Section id="how-it-works">
        <SectionHeading
          eyebrow="What a reseller does"
          title="You are the phone company. We are the part nobody sees."
          lead="A reseller is not a referral partner or an affiliate. You buy wholesale, sell retail, and your name is on everything the customer touches."
        />
        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {whatAResellerDoes.map((item, i) => {
            const Icon = doesIcons[i % doesIcons.length];
            return (
              <Card key={item.title}>
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-base font-semibold text-strong">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-body">{item.body}</p>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* What we do */}
      <Section tone="muted">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeading
            eyebrow="What we handle"
            title="The parts that need a carrier, not a salesperson"
            lead="You should be selling and supporting, not negotiating interconnects or sitting on hold with a losing carrier."
          />
          <div className="grid gap-7 sm:grid-cols-2">
            {whatWeDo.map((item, i) => {
              const Icon = weDoIcons[i % weDoIcons.length];
              return (
                <div key={item.title}>
                  <h3 className="flex items-start gap-2.5 text-base font-semibold text-strong">
                    <Icon className="mt-0.5 h-5 w-5 flex-none text-brand-500" />
                    {item.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-body">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* Good fit */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeading
            eyebrow="Who this suits"
            title="Businesses already standing next to the phone system"
            lead="The best resellers are the ones the customer already calls when something stops working."
          />
          <Card className="h-fit">
            <ul className="space-y-3.5">
              {goodFit.map((item) => (
                <CheckItem key={item}>{item}</CheckItem>
              ))}
            </ul>
            <p className="mt-6 border-t border-subtle pt-5 text-sm leading-relaxed text-body">
              Not on the list? Apply anyway and tell us what you do. The list is what we expect, not
              what we will accept.
            </p>
          </Card>
        </div>
      </Section>

      {/* Before you apply — the honest part */}
      <Section tone="muted">
        <SectionHeading
          eyebrow="Before you apply"
          title="Three things to weigh first"
          lead="We would rather lose an application here than sign a partner who did not know what they were joining."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {beforeYouApply.map((item, i) => (
            <Card key={item.title}>
              <span className="text-xs font-semibold tracking-[0.14em] text-brand-500">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-base font-semibold text-strong">{item.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-body">{item.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHeading
          eyebrow="Reseller FAQ"
          title="What partners ask us first"
          lead="If yours is not here, put it in the application — we would rather answer it up front."
        />
        <div className="mt-12 grid gap-x-10 gap-y-8 lg:grid-cols-2">
          {resellerFaqs.map((f) => (
            <div key={f.q}>
              <h3 className="text-base font-semibold text-strong">{f.q}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-body">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Apply CTA */}
      <section className="border-t border-white/10 bg-ink-950 dot-grid">
        <Container className="py-20 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">
              Apply to become a reseller today
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-300">
              It takes about five minutes. {site.name} is in development and launching soon, so
              applying now puts you among the first resellers on the platform. We read every
              application ourselves and reply within two business days &mdash; including when the
              answer is no.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href="/resellers/apply" variant="primary" withArrow>
                Start your application
              </Button>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-lg border border-white/25 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Ask a question first
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
