import type { Metadata } from "next";
import { process, services } from "@/lib/content";
import { Cloud, Globe } from "@/components/Icons";
import {
  Button,
  Card,
  CheckItem,
  Container,
  CtaBand,
  Eyebrow,
  Section,
  SectionHeading,
} from "@/components/ui";

export const metadata: Metadata = {
  title: "Services",
  description:
    "SIP trunking to modernise the PBX you already own, and hosted PBX to replace it entirely. Number porting, failover and migration included.",
};

const serviceIcons = {
  "sip-trunking": Globe,
  "hosted-pbx": Cloud,
} as const;

const comparison = [
  { row: "Your existing PBX", sip: "Keep it", pbx: "Replaced by our platform" },
  { row: "Hardware to maintain", sip: "Your PBX, our trunks", pbx: "Handsets only" },
  { row: "Where features live", sip: "On your PBX", pbx: "On our platform" },
  { row: "Adding a new site", sip: "New trunk group", pbx: "Configuration change" },
  { row: "Typical fit", sip: "Recent PBX investment", pbx: "Aging or no phone system" },
  { row: "Remote staff", sip: "Depends on your PBX", pbx: "Built in via softphone apps" },
];

export default function ServicesPage() {
  return (
    <>
      <section className="border-b border-subtle bg-surface-muted">
        <Container className="py-16 sm:py-20">
          <div className="max-w-3xl">
            <Eyebrow>Services</Eyebrow>
            <h1 className="text-4xl font-semibold sm:text-5xl">
              Two services, one network behind them
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-body">
              Whether you keep your phone system or hand it to us, your calls ride the same
              redundant voice network, with the same porting help and the same engineers on
              support.
            </p>
          </div>
        </Container>
      </section>

      {services.map((service, index) => {
        const Icon = serviceIcons[service.slug as keyof typeof serviceIcons];
        return (
          <Section key={service.slug} id={service.slug} tone={index % 2 === 0 ? "default" : "muted"}>
            <div className="grid gap-12 lg:grid-cols-[1fr_0.85fr]">
              <div>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white">
                  <Icon className="h-6 w-6" />
                </span>
                <h2 className="mt-6 text-3xl font-semibold sm:text-4xl">{service.name}</h2>
                <p className="mt-2 text-lg font-medium text-brand-700 dark:text-brand-300">
                  {service.kicker}
                </p>
                <p className="mt-6 text-base leading-relaxed text-body">{service.summary}</p>

                <div className="mt-7 rounded-lg border-l-2 border-accent-500 bg-surface-muted py-3 pl-5 pr-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">
                    Best for
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-body">{service.bestFor}</p>
                </div>

                <div className="mt-10 grid gap-7 sm:grid-cols-2">
                  {service.highlights.map((h) => (
                    <div key={h.title}>
                      <h3 className="text-base font-semibold text-strong">{h.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-body">{h.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <Card className="h-fit lg:sticky lg:top-24">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-faint">
                  What&apos;s included
                </h3>
                <ul className="mt-5 space-y-3">
                  {service.includes.map((item) => (
                    <CheckItem key={item}>{item}</CheckItem>
                  ))}
                </ul>
                <div className="mt-7 border-t border-subtle pt-6">
                  <Button href="/contact" variant="primary" className="w-full" withArrow>
                    Request a demo
                  </Button>
                </div>
              </Card>
            </div>
          </Section>
        );
      })}

      {/* Comparison */}
      <Section>
        <SectionHeading
          eyebrow="Which one?"
          title="SIP trunking or hosted PBX?"
          lead="The short version: if your phone system is good and paid for, keep it and change the lines. If it is old, missing, or holding you back, let the platform be the phone system."
          align="center"
        />
        <div className="mt-12 overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-subtle">
                <th className="w-1/3 py-4 pr-4 font-semibold text-strong">&nbsp;</th>
                <th className="w-1/3 py-4 pr-4 font-semibold text-strong">SIP Trunking</th>
                <th className="w-1/3 py-4 font-semibold text-strong">Hosted PBX</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((r) => (
                <tr key={r.row} className="border-b border-subtle">
                  <td className="py-4 pr-4 font-medium text-strong">{r.row}</td>
                  <td className="py-4 pr-4 text-body">{r.sip}</td>
                  <td className="py-4 text-body">{r.pbx}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Process */}
      <Section tone="muted" id="process">
        <SectionHeading
          eyebrow="Getting started"
          title="How a migration actually goes"
          lead="Nothing cuts over until you have tested it and picked the window. Your old service stays up the whole time."
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
        title="Not sure which service fits?"
        body="Tell us what you have today. We will tell you honestly whether it is worth keeping — including when the answer is that you should stay where you are."
      />
    </>
  );
}
