import type { Metadata } from "next";
import { featureGroups } from "@/lib/content";
import { Check } from "@/components/Icons";
import { launch } from "@/lib/site";
import { Container, CtaBand, Eyebrow, Section, SectionHeading, StatusPill } from "@/components/ui";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Auto attendants, call queues, softphones, call recording, reporting, failover, STIR/SHAKEN and more — standard across Cloudpathway SIP trunking and hosted PBX, coming soon.",
};

export default function FeaturesPage() {
  return (
    <>
      <section className="border-b border-subtle bg-surface-muted">
        <Container className="py-16 sm:py-20">
          <div className="max-w-3xl">
            <StatusPill>{launch.label}</StatusPill>
            <div className="mt-6">
              <Eyebrow>Features</Eyebrow>
            </div>
            <h1 className="text-4xl font-semibold sm:text-5xl">
              Standard, not &ldquo;available as an add-on&rdquo;
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-body">
              A phone system earns its keep in the small things — the queue that announces wait
              times, the voicemail that shows up as readable text, the failover rule nobody had to
              think about at 6am. Here is what will come standard with the platform when it
              launches.
            </p>
          </div>
        </Container>
      </section>

      {featureGroups.map((group, index) => (
        <Section key={group.name} tone={index % 2 === 0 ? "default" : "muted"}>
          <SectionHeading eyebrow={`0${index + 1}`} title={group.name} lead={group.blurb} />
          <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {group.features.map((f) => (
              <div key={f.title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <div>
                  <h3 className="text-[0.95rem] font-semibold text-strong">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-body">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ))}

      <CtaBand
        title="Want to see it before launch?"
        body="The platform is in development, and demos are available on request. We will build your call flow — your routing, your hours, your failover — and walk you through the admin portal and softphone with it on screen, rather than a canned demo tenant."
      />
    </>
  );
}
