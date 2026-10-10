import Link from "next/link";
import { differentiators, featureGroups, services } from "@/lib/content";
import { launch, site, startupNote } from "@/lib/site";
import {
  Bolt,
  Chart,
  Cloud,
  Globe,
  Headset,
  Phone,
  Shield,
  Sliders,
} from "@/components/Icons";
import {
  Button,
  Card,
  CheckItem,
  Container,
  CtaBand,
  Eyebrow,
  Section,
  SectionHeading,
  StatusPill,
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
  globe: Globe,
  sliders: Sliders,
} as const;

const pillars = [
  { icon: Shield, title: "Redundant by design", body: "Calls are served from more than one geographic location. Losing a facility reroutes traffic instead of taking your phones down." },
  { icon: Headset, title: "Someone on call", body: "Outages reach a person around the clock — one who can open the platform and look at your call flow, not just log a ticket." },
  { icon: Sliders, title: "You keep control", body: "Change your own call flows, users, and schedules from a browser instead of waiting on a carrier ticket." },
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
          <div className="grid items-center gap-14 lg:grid-cols-[1.12fr_0.88fr]">
            <div>
              <StatusPill dark>{launch.label}</StatusPill>

              <h1 className="mt-6 text-4xl font-semibold leading-[1.08] text-white sm:text-5xl lg:text-[3.05rem]">
                <span className="whitespace-nowrap">Enterprise-grade</span> business voice,{" "}
                <span className="whitespace-nowrap bg-gradient-to-r from-brand-300 to-accent-300 bg-clip-text text-transparent">
                  coming soon
                </span>
                .
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
                {site.name} SIP trunking and hosted PBX are in development and will be available
                soon. We are building on geographically redundant call routing, encrypted signaling
                and media, STIR/SHAKEN attestation, and somebody on call around the clock. Join the
                early-access list and you will hear the moment it is ready.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button href={launch.cta.href} variant="primary" withArrow>
                  {launch.cta.label}
                </Button>
                <Button href="/services" variant="ghost">
                  See what&rsquo;s coming
                </Button>
              </div>

              <p className="mt-6 flex flex-wrap items-center gap-2 text-sm text-ink-400">
                <Phone className="h-4 w-4" />
                Questions, or want a demo? Call{" "}
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
                        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-white">
                          {service.name}
                          <span className="rounded-full border border-accent-400/40 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-[0.08em] text-accent-300">
                            Coming soon
                          </span>
                        </h2>
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
      </section>

      {/* Where we actually are */}
      <Section tone="muted">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <Eyebrow>Where we are</Eyebrow>
            <h2 className="text-3xl font-semibold sm:text-4xl">{startupNote.heading}</h2>
          </div>
          <div>
            <div className="space-y-5">
              {startupNote.body.map((paragraph) => (
                <p key={paragraph.slice(0, 32)} className="text-base leading-relaxed text-body">
                  {paragraph}
                </p>
              ))}
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href={launch.cta.href} variant="primary" withArrow>
                {launch.cta.label}
              </Button>
              <Button href="/contact" variant="secondary">
                Ask for a demo
              </Button>
            </div>
          </div>
        </div>
      </Section>

      {/* Pillars */}
      <Section>
        <SectionHeading
          eyebrow="What we are building"
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
          eyebrow="What's coming"
          title="Two ways to get your calls onto our network"
          lead="Both are in development and will launch together. If you are not sure which will fit, tell us what you run today and we will say."
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
                    <p className="text-sm font-medium text-brand-700 dark:text-brand-300">{service.kicker}</p>
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
                    className="text-sm font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
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
            lead="Auto attendants, queues, softphones, recording, reporting and failover will be standard on the platform — not add-ons you discover at renewal."
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
            title="What we can promise before we have a track record"
            lead="Every provider claims reliability and great support. We have not earned the right to claim either yet — so here is what we can commit to today, and what we would rather prove in a demo."
          />
          <div className="grid gap-6 sm:grid-cols-2">
            {differentiators.map((d) => {
              const Icon = differentiatorIcons[d.icon];
              return (
                <div key={d.title}>
                  <h3 className="flex items-start gap-2.5 text-base font-semibold text-strong">
                    <Icon className="mt-0.5 h-5 w-5 flex-none text-brand-500" />
                    {d.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-body">{d.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
