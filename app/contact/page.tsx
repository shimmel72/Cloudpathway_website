import type { Metadata } from "next";
import { faqs } from "@/lib/content";
import { launch, site } from "@/lib/site";
import { Clock, Mail, Phone, Pin } from "@/components/Icons";
import { ContactForm } from "@/components/ContactForm";
import { Card, Container, Eyebrow, Section, SectionHeading, StatusPill } from "@/components/ui";

export const metadata: Metadata = {
  title: "Get early access",
  description: `${site.name} SIP trunking and hosted PBX are in development and available soon. Join the early-access list to hear first, or ask for a demo.`,
};

export default function ContactPage() {
  return (
    <>
      <section className="border-b border-subtle bg-surface-muted">
        <Container className="py-16 sm:py-20">
          <div className="max-w-3xl">
            <StatusPill>{launch.label}</StatusPill>
            <div className="mt-6">
              <Eyebrow>Early access</Eyebrow>
            </div>
            <h1 className="text-4xl font-semibold sm:text-5xl">Be first in line</h1>
            <p className="mt-5 text-lg leading-relaxed text-body">
              {site.name} is in development and will be available soon. Tell us about your phones
              and you are on the early-access list: we will let you know the moment it is ready.
              An engineer &mdash; not a sales development rep &mdash; reads every message and
              replies within one business day. Demos are available on request in the meantime. If
              you would rather just talk, the number is on the right.
            </p>
          </div>
        </Container>
      </section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1.35fr_0.65fr]">
          <ContactForm />

          <div className="space-y-6">
            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-faint">
                Talk to us directly
              </h2>
              <ul className="mt-5 space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4.5 w-4.5 flex-none text-brand-500" />
                  <span>
                    <a href={site.phoneHref} className="font-semibold text-strong hover:underline">
                      {site.phone}
                    </a>
                    <span className="mt-0.5 block text-faint">Questions &amp; demos</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4.5 w-4.5 flex-none text-brand-500" />
                  <span>
                    <a href={`mailto:${site.salesEmail}`} className="font-semibold text-strong hover:underline">
                      {site.salesEmail}
                    </a>
                    <span className="mt-0.5 block text-faint">New enquiries</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4.5 w-4.5 flex-none text-brand-500" />
                  <span>
                    <a href={`mailto:${site.supportEmail}`} className="font-semibold text-strong hover:underline">
                      {site.supportEmail}
                    </a>
                    <span className="mt-0.5 block text-faint">Support</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4.5 w-4.5 flex-none text-brand-500" />
                  <span className="text-body">{site.supportHours}</span>
                </li>
                <li className="flex items-start gap-3">
                  <Pin className="mt-0.5 h-4.5 w-4.5 flex-none text-brand-500" />
                  <span className="text-body">
                    {site.address.line1}
                    <br />
                    {site.address.city}, {site.address.state} {site.address.zip}
                  </span>
                </li>
              </ul>
            </Card>

            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-faint">
                What to expect
              </h2>
              <ol className="mt-5 space-y-3 text-sm text-body">
                <li>
                  <span className="font-semibold text-strong">1.</span> A short reply within one
                  business day, with anything we still need to know.
                </li>
                <li>
                  <span className="font-semibold text-strong">2.</span> A place on the early-access
                  list &mdash; you hear first when {site.name} is available.
                </li>
                <li>
                  <span className="font-semibold text-strong">3.</span> A call and a demo, if you
                  want them &mdash; your call flow, built for you to test at no cost.
                </li>
                <li>
                  <span className="font-semibold text-strong">4.</span> At launch, a written design
                  and an itemized quote.
                </li>
              </ol>
            </Card>
          </div>
        </div>
      </Section>

      <Section tone="muted" id="faq">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions worth asking a new provider"
          lead="Including the uncomfortable one. If yours is not here, put it in the form — we would rather answer it up front."
        />
        <div className="mt-12 grid gap-x-10 gap-y-8 lg:grid-cols-2">
          {faqs.map((f) => (
            <div key={f.q}>
              <h3 className="text-base font-semibold text-strong">{f.q}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-body">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
