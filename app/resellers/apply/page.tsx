import type { Metadata } from "next";
import Link from "next/link";
import { beforeYouApply } from "@/lib/reseller";
import { pageMeta, site } from "@/lib/site";
import { Clock, Mail, Phone } from "@/components/Icons";
import { ResellerApplicationForm } from "@/components/ResellerApplicationForm";
import { Card, Container, Eyebrow, Section } from "@/components/ui";

export const metadata: Metadata = {
  ...pageMeta(
    "Reseller application",
    `Apply to resell ${site.name} SIP trunking and hosted PBX under your own brand — applications open ahead of launch.`,
    "/resellers/apply",
  ),
  robots: { index: false, follow: true },
};

export default function ResellerApplyPage() {
  return (
    <>
      <section className="border-b border-subtle bg-surface-muted">
        <Container className="py-16 sm:py-20">
          <div className="max-w-3xl">
            <Eyebrow>Reseller application</Eyebrow>
            <h1 className="text-4xl font-semibold sm:text-5xl">Tell us about your business</h1>
            <p className="mt-5 text-lg leading-relaxed text-body">
              About five minutes. {site.name} is in development and launching soon; applying now
              means that, if we are a fit, you can be selling from day one. Nothing here commits either of us to anything
              &mdash; commercial terms get worked out in a conversation afterwards. Only the starred
              fields are required; the rest just save us a round trip.
            </p>
            <p className="mt-4 text-sm text-faint">
              <Link href="/resellers" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                &larr; Back to the reseller programme
              </Link>
            </p>
          </div>
        </Container>
      </section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1.45fr_0.55fr]">
          <ResellerApplicationForm />

          <div className="space-y-6">
            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-faint">
                What happens next
              </h2>
              <ol className="mt-5 space-y-3 text-sm text-body">
                <li>
                  <span className="font-semibold text-strong">1.</span> We read it &mdash; a person,
                  usually the same day.
                </li>
                <li>
                  <span className="font-semibold text-strong">2.</span> A reply within two business
                  days, yes or no.
                </li>
                <li>
                  <span className="font-semibold text-strong">3.</span> If yes: a demo of the
                  platform and a conversation about wholesale terms.
                </li>
                <li>
                  <span className="font-semibold text-strong">4.</span> At launch: your branded
                  portal and a first customer to cut over.
                </li>
              </ol>
            </Card>

            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-faint">
                Worth knowing
              </h2>
              <div className="mt-5 space-y-4">
                {beforeYouApply.map((item) => (
                  <div key={item.title}>
                    <h3 className="text-sm font-semibold text-strong">{item.title}</h3>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-body">
                The detail behind each of these is on the{" "}
                <Link href="/resellers" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                  programme page
                </Link>
                .
              </p>
            </Card>

            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-faint">
                Rather talk first?
              </h2>
              <ul className="mt-5 space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4.5 w-4.5 flex-none text-brand-500" />
                  <a href={site.phoneHref} className="font-semibold text-strong hover:underline">
                    {site.phone}
                  </a>
                </li>
                <li className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4.5 w-4.5 flex-none text-brand-500" />
                  <a href={`mailto:${site.salesEmail}`} className="font-semibold text-strong hover:underline">
                    {site.salesEmail}
                  </a>
                </li>
                <li className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4.5 w-4.5 flex-none text-brand-500" />
                  <span className="text-body">{site.supportHours}</span>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </Section>
    </>
  );
}
