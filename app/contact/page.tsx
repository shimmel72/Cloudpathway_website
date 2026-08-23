import type { Metadata } from "next";
import { faqs } from "@/lib/content";
import { site } from "@/lib/site";
import { Clock, Mail, Phone, Pin } from "@/components/Icons";
import { ContactForm } from "@/components/ContactForm";
import { Card, Container, Eyebrow, Section, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Contact",
  description: `Request a quote for SIP trunking or hosted PBX from ${site.name}. A written proposal, usually within two business days.`,
};

export default function ContactPage() {
  return (
    <>
      <section className="border-b border-subtle bg-surface-muted">
        <Container className="py-16 sm:py-20">
          <div className="max-w-3xl">
            <Eyebrow>Contact</Eyebrow>
            <h1 className="text-4xl font-semibold sm:text-5xl">Tell us about your phones</h1>
            <p className="mt-5 text-lg leading-relaxed text-body">
              Fill this in and an engineer &mdash; not a sales development rep &mdash; will get
              back to you within one business day. Demos are available on request: tell us how your
              calls should route and we will build it so you can test it yourself. If you would
              rather just talk, the number is on the right.
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
                    <span className="mt-0.5 block text-faint">Sales &amp; support</span>
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
                    <span className="mt-0.5 block text-faint">Existing customers</span>
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
                  <span className="font-semibold text-strong">1.</span> A short reply confirming we
                  have it, with anything we still need to know.
                </li>
                <li>
                  <span className="font-semibold text-strong">2.</span> A 30-minute call about what
                  you run today and what breaks.
                </li>
                <li>
                  <span className="font-semibold text-strong">3.</span> A demo, if you want one
                  &mdash; your call flow, built for you to test at no cost.
                </li>
                <li>
                  <span className="font-semibold text-strong">4.</span> A written design and an
                  itemized quote, typically inside two business days.
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
