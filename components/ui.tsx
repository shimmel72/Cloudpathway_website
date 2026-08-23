import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Check } from "./Icons";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

export function Section({
  children,
  className = "",
  tone = "default",
  id,
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "muted" | "dark";
  id?: string;
}) {
  const tones = {
    default: "bg-surface",
    muted: "bg-surface-muted",
    dark: "bg-ink-950 text-ink-300",
  };
  return (
    <section id={id} className={`py-20 sm:py-28 ${tones[tone]} ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

export function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p
      className={`mb-4 text-xs font-semibold uppercase tracking-[0.16em] ${
        dark ? "text-accent-400" : "text-brand-700 dark:text-brand-300"
      }`}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  dark = false,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  dark?: boolean;
  align?: "left" | "center";
}) {
  return (
    <div className={`${align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}`}>
      {eyebrow ? <Eyebrow dark={dark}>{eyebrow}</Eyebrow> : null}
      <h2
        className={`text-3xl font-semibold sm:text-4xl ${dark ? "text-white" : "text-strong"}`}
      >
        {title}
      </h2>
      {lead ? (
        <p className={`mt-4 text-lg leading-relaxed ${dark ? "text-ink-300" : "text-body"}`}>{lead}</p>
      ) : null}
    </div>
  );
}

type ButtonProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  withArrow?: boolean;
};

export function Button({
  href,
  children,
  variant = "primary",
  className = "",
  withArrow = false,
}: ButtonProps) {
  const variants = {
    primary:
      "bg-brand-600 text-white hover:bg-brand-700 shadow-[0_6px_20px_-6px_rgb(29_107_245/0.6)]",
    secondary:
      "surface-card text-strong hover:border-brand-400 hover:text-brand-700 dark:hover:text-brand-300",
    ghost: "border border-white/25 text-white hover:bg-white/10",
  };
  return (
    <Link
      href={href}
      className={`group inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors duration-150 ${variants[variant]} ${className}`}
    >
      {children}
      {withArrow ? (
        <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
      ) : null}
    </Link>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`surface-card rounded-xl p-6 shadow-[var(--shadow-lift)] ${className}`}>
      {children}
    </div>
  );
}

export function CheckItem({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full ${
          dark ? "bg-accent-500/20 text-accent-300" : "bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300"
        }`}
      >
        <Check className="h-3 w-3" />
      </span>
      <span className={`text-sm leading-relaxed ${dark ? "text-ink-300" : "text-body"}`}>{children}</span>
    </li>
  );
}

export function Stat({ value, label, dark = false }: { value: string; label: string; dark?: boolean }) {
  return (
    <div>
      <div className={`text-3xl font-semibold tracking-tight sm:text-4xl ${dark ? "text-white" : "text-strong"}`}>
        {value}
      </div>
      <div className={`mt-1.5 text-sm ${dark ? "text-ink-400" : "text-faint"}`}>{label}</div>
    </div>
  );
}

export function CtaBand({
  title = "Let's talk about your phones.",
  body = "Tell us what you run today and what is not working. We will come back with a design and an itemized quote — and if you would rather see it working first, ask for a demo.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section className="border-t border-white/10 bg-ink-950 dot-grid">
      <Container className="py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold text-white sm:text-4xl">{title}</h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-300">{body}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/contact" variant="primary" withArrow>
              Request a demo
            </Button>
            <Button href="/services" variant="ghost">
              Compare services
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
