"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { nav, site } from "@/lib/site";
import { Logo, Phone } from "./Icons";
import { Container } from "./ui";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-subtle bg-surface/95 backdrop-blur-md">
      <Container>
        <div className="flex h-16 items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label={`${site.name} home`}>
            <Logo className="h-8 w-8" />
            <span className="text-lg font-semibold tracking-tight text-strong">{site.name}</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "text-brand-600 dark:text-brand-300"
                      : "text-body hover:text-strong"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <a
              href={site.phoneHref}
              className="flex items-center gap-2 text-sm font-medium text-body transition-colors hover:text-strong"
            >
              <Phone className="h-4 w-4" />
              {site.phone}
            </a>
            <Link
              href="/contact"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Get a quote
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label="Toggle navigation menu"
            className="surface-card -mr-1 rounded-lg p-2.5 text-strong md:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </Container>

      {open ? (
        <div id="mobile-nav" className="border-t border-subtle bg-surface md:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2 py-2.5 text-sm font-medium text-body hover:bg-surface-muted hover:text-strong"
              >
                {item.label}
              </Link>
            ))}
            <a
              href={site.phoneHref}
              className="flex items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium text-body"
            >
              <Phone className="h-4 w-4" />
              {site.phone}
            </a>
            <Link
              href="/contact"
              className="mt-2 rounded-lg bg-brand-600 px-4 py-2.5 text-center text-sm font-semibold text-white"
            >
              Get a quote
            </Link>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
