"use client";

import { useState, type FormEvent } from "react";
import { Check } from "./Icons";

type Status = "idle" | "submitting" | "success" | "error";

const serviceOptions = [
  { value: "sip-trunking", label: "SIP trunking (keep my PBX)" },
  { value: "hosted-pbx", label: "Hosted PBX (replace my phone system)" },
  { value: "both", label: "Both / a mix across sites" },
  { value: "not-sure", label: "Not sure yet — help me decide" },
];

const fieldClass =
  "w-full rounded-lg border border-subtle bg-surface px-3.5 py-2.5 text-sm text-strong placeholder:text-faint transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25";

const labelClass = "mb-1.5 block text-sm font-medium text-strong";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{message}</p>;
}

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reference, setReference] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setFormError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        setStatus("error");
        setFormError(result.error ?? "We could not send that. Please try again.");
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      setReference(result.reference ?? null);
      setStatus("success");
    } catch {
      setStatus("error");
      setFormError(
        "We could not reach the server. Please check your connection or call us directly.",
      );
    }
  }

  if (status === "success") {
    return (
      <div className="surface-card h-fit rounded-xl p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-500/15 text-accent-600 dark:text-accent-300">
          <Check className="h-6 w-6" />
        </span>
        <h3 className="mt-5 text-xl font-semibold text-strong">Thanks — we have got it.</h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-body">
          One of our engineers will get back to you within one business day. If it is urgent,
          call us and quote your reference number.
        </p>
        {reference ? (
          <p className="mt-5 inline-block rounded-lg bg-surface-muted px-4 py-2 font-mono text-sm text-strong">
            {reference}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="surface-card rounded-xl p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="name">
            Your name <span className="text-red-500">*</span>
          </label>
          <input id="name" name="name" required autoComplete="name" className={fieldClass} placeholder="Dana Whitfield" />
          <FieldError message={fieldErrors.name} />
        </div>

        <div>
          <label className={labelClass} htmlFor="company">
            Company <span className="text-red-500">*</span>
          </label>
          <input id="company" name="company" required autoComplete="organization" className={fieldClass} placeholder="Northgate Property Group" />
          <FieldError message={fieldErrors.company} />
        </div>

        <div>
          <label className={labelClass} htmlFor="email">
            Work email <span className="text-red-500">*</span>
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className={fieldClass} placeholder="dana@northgate.com" />
          <FieldError message={fieldErrors.email} />
        </div>

        <div>
          <label className={labelClass} htmlFor="phone">
            Phone <span className="text-faint">(optional)</span>
          </label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" className={fieldClass} placeholder="(555) 555-0142" />
          <FieldError message={fieldErrors.phone} />
        </div>

        <div>
          <label className={labelClass} htmlFor="service">
            What are you interested in? <span className="text-red-500">*</span>
          </label>
          <select id="service" name="service" required defaultValue="" className={fieldClass}>
            <option value="" disabled>
              Choose a service…
            </option>
            {serviceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FieldError message={fieldErrors.service} />
        </div>

        <div>
          <label className={labelClass} htmlFor="seats">
            Approx. users or channels <span className="text-faint">(optional)</span>
          </label>
          <input id="seats" name="seats" className={fieldClass} placeholder="45 users, 2 sites" />
          <FieldError message={fieldErrors.seats} />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="message">
            What are you running today, and what is not working?{" "}
            <span className="text-red-500">*</span>
          </label>
          <textarea
            id="message"
            name="message"
            required
            rows={5}
            className={`${fieldClass} resize-y`}
            placeholder="We have an on-prem PBX on two PRIs, contract is up in March, and our second office has no reliable way to transfer calls to the main site…"
          />
          <FieldError message={fieldErrors.message} />
        </div>
      </div>

      {/* Honeypot — visually hidden, ignored by real users. */}
      <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {formError ? (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {formError}
        </p>
      ) : null}

      <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-faint">
          We use your details to respond to this enquiry only. No newsletter, no list sharing.
        </p>
        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex flex-none items-center justify-center rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "submitting" ? "Sending…" : "Request a quote"}
        </button>
      </div>
    </form>
  );
}
