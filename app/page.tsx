import Link from "next/link";
import { differentiators, featureGroups, services } from "@/lib/content";
import { site, stats } from "@/lib/site";
import { Bolt, Chart, Cloud, Globe, Headset, Phone, Shield, Sliders } from "@/components/Icons";
import {
  Button,
  Card,
  CheckItem,
  Container,
  CtaBand,
  Eyebrow,
  Section,
  SectionHeading,
  Stat,
} from "@/components/ui";

const serviceIcons = {
  "sip-trunking": Globe,
  "hosted-pbx": Cloud,
} as const;

const differentiatorIcons = {
  headset: Headset,
  chart: Chart,
  bolt: Bolt,
  shield: Shield,
} as const;

const pillars = [
  { icon: Shield, title: "Built to stay up", body: "Geo-redundant call routing, automatic failover, and a platform designed around the day something breaks." },
  { icon: Headset, title: "Support that answers", body: "Engineers with real platform access, not a call center reading from a script and opening a ticket." },
  { icon: Sliders, title: "You keep control", body: "Change your own call flows, users, and schedules from a browser instead of waiting on a carrier." },
  { icon: Bolt, title: "Migrations we run", body: "Porting, provisioning, and interop testing are part of onboarding, not a surprise services invoice." },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-950 dot-grid">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-48 h-[36rem] w-[36rem] rounded-full bg-brand-600/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-56 -left-40 h-[32rem] w-[32rem] rounded-full bg-accent-500/10 blur-3xl"
        />
        <Container className="relative py-20 sm:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-ink-200">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                SIP trunking &amp; hosted PBX
              </span>

              <h1 className="mt-6 text-4xl font-semibold leading-[1.08] text-white sm:text-5xl lg:text-[3.4rem]">
                Business phone service that just{" "}
                <span className="bg-gradient-to-r from-brand-300 to-accent-300 bg-clip-text text-transparent">
                  works
                </span>
                .
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
                {site.name} moves your company off aging phone lines and onto a voice network built
                for uptime. Keep the PBX you have with our SIP trunks, or hand the whole thing over
                and let us run it. Either way, your numbers come with you.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button href="/contact" variant="primary" withArrow>
                  Request a quote
                </Button>
                <Button href="/services" variant="ghost">
                  Explore our services
                </Button>
              </div>

              <p className="mt-6 flex items-center gap-2 text-sm text-ink-400">
                <Phone className="h-4 w-4" />
                Prefer to talk? Call{" "}
                <a href={site.phoneHref} className="font-medium text-ink-200 underline-offset-4 hover:underline">
                  {site.phone}
                </a>
              </p>
            </div>

            {/* Service preview cards */}
            <div className="grid gap-4">
              {services.map((service) => {
                const Icon = serviceIcons[service.slug as keyof typeof serviceIcons];
                return (
                  <Link
                    key={service.slug}
                    href={`/services#${service.slug}`}
                    className="group rounded-xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm transition-colors hover:border-white/25 hover:bg-white/[0.07]"
                  >
                    <div className="flex items-start gap-4">
                      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 text-white">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h2 className="text-base font-semibold text-white">{service.name}</h2>
                        <p className="mt-0.5 text-sm font-medium text-accent-300">{service.kicker}</p>
                        <p className="mt-3 text-sm leading-relaxed text-ink-400">{service.bestFor}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </Container>

        {/* Stat strip */}
        <div className="relative border-t border-white/10">
          <Container className="grid grid-cols-2 gap-8 py-10 lg:grid-cols-4">
            {stats.map((s) => (
              <Stat key={s.label} value={s.value} label={s.label} dark />
            ))}
          </Container>
        </div>
      </section>

      {/* Pillars */}
      <Section>
        <SectionHeading
          eyebrow="Why Cloudpathway"
          title="Phone service is boring infrastructure. That is the point."
          lead="Nobody wants to think about their phone system. Our job is to build one you can stop thinking about — and to pick up quickly on the rare day you have to."
        />
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-base font-semibold text-strong">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-body">{body}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* Services detail */}
      <Section tone="muted" id="services">
        <SectionHeading
          eyebrow="What we do"
          title="Two ways to get your calls onto our network"
          lead="Most customers land on one of these. If you are not sure which fits, that is exactly what the discovery call is for."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {services.map((service) => {
            const Icon = serviceIcons[service.slug as keyof typeof serviceIcons];
            return (
              <Card key={service.slug} className="flex flex-col">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-strong">{service.name}</h3>
                    <p className="text-sm font-medium text-brand-600 dark:text-brand-300">{service.kicker}</p>
                  </div>
                </div>

                <p className="mt-5 text-sm leading-relaxed text-body">{service.summary}</p>

                <ul className="mt-6 space-y-3">
                  {service.includes.slice(0, 5).map((item) => (
                    <CheckItem key={item}>{item}</CheckItem>
                  ))}
                </ul>

                <div className="mt-auto pt-7">
                  <Link
                    href={`/services#${service.slug}`}
                    className="text-sm font-semibold text-brand-600 underline-offset-4 hover:underline dark:text-brand-300"
                  >
                    Full {service.name} details &rarr;
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* Feature preview */}
      <Section>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Features"
            title="Everything a modern phone system should already do"
            lead="Auto attendants, queues, softphones, recording, reporting and failover are standard on the platform — not add-ons you discover at renewal."
          />
          <Button href="/features" variant="secondary" withArrow>
            See all features
          </Button>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featureGroups.slice(0, 3).map((group) => (
            <Card key={group.name}>
              <Eyebrow>{group.name}</Eyebrow>
              <ul className="space-y-3">
                {group.features.slice(0, 5).map((f) => (
                  <CheckItem key={f.title}>{f.title}</CheckItem>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </Section>

      {/* Differentiators */}
      <Section tone="muted">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeading
            eyebrow="How we're different"
            title="The things that actually matter when you are the one on the hook"
            lead="Every provider claims reliability and great support. Here is specifically what we mean by it."
          />
          <div className="grid gap-6 sm:grid-cols-2">
            {differentiators.map((d) => (
              <div key={d.title}>
                <h3 className="flex items-start gap-2.5 text-base font-semibold text-strong">
                  {(() => {
                    const Icon = differentiatorIcons[d.icon];
                    return <Icon className="mt-0.5 h-5 w-5 flex-none text-brand-500" />;
                  })()}
                  {d.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-body">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
