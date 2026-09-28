import Link from "next/link";
import { services } from "@/lib/content";
import { site } from "@/lib/site";
import { Logo, Mail, Phone, Pin } from "./Icons";
import { Container } from "./ui";

export function Footer() {
  return (
    <footer className="border-t border-subtle bg-surface-muted">
      <Container className="py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <Logo className="h-8 w-8" />
              <span className="text-lg font-semibold tracking-tight text-strong">{site.name}</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-body">
              SIP trunking and hosted PBX on enterprise-grade infrastructure, from a new
              independent voice provider. Demos available on request.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-strong">Services</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {services.map((s) => (
                <li key={s.slug}>
                  <Link href={`/services#${s.slug}`} className="text-body transition-colors hover:text-strong">
                    {s.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/features" className="text-body transition-colors hover:text-strong">
                  All features
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-strong">Company</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/about" className="text-body transition-colors hover:text-strong">
                  About us
                </Link>
              </li>
              <li>
                <Link href="/resellers" className="text-body transition-colors hover:text-strong">
                  Become a reseller
                </Link>
              </li>
              <li>
                <Link href="/about#process" className="text-body transition-colors hover:text-strong">
                  How we work
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-body transition-colors hover:text-strong">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/contact#faq" className="text-body transition-colors hover:text-strong">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-strong">Get in touch</h3>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <a href={site.phoneHref} className="flex items-center gap-2.5 text-body transition-colors hover:text-strong">
                  <Phone className="h-4 w-4 flex-none text-faint" />
                  {site.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${site.salesEmail}`} className="flex items-center gap-2.5 text-body transition-colors hover:text-strong">
                  <Mail className="h-4 w-4 flex-none text-faint" />
                  {site.salesEmail}
                </a>
              </li>
              <li className="flex items-start gap-2.5 text-body">
                <Pin className="mt-0.5 h-4 w-4 flex-none text-faint" />
                <span>
                  {site.address.line1}
                  <br />
                  {site.address.city}, {site.address.state} {site.address.zip}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-subtle pt-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {site.legalName}. All rights reserved.
          </p>
          <p>Support: {site.supportHours}</p>
        </div>
      </Container>
    </footer>
  );
}
