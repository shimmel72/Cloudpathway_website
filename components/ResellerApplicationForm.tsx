"use client";

import { useState, type FormEvent } from "react";
import { BUSINESS_TYPE_LABELS, SELLS_VOICE_LABELS } from "@/lib/reseller";
import { Check } from "./Icons";

type Status = "idle" | "submitting" | "success" | "error";

// Derived from the same maps the notification email renders, so an option
// added here can never show up in an inbox as its raw key.
const asOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

const businessTypes = asOptions(BUSINESS_TYPE_LABELS);
const voiceToday = asOptions(SELLS_VOICE_LABELS);

const fieldClass =
  "w-full rounded-lg border border-subtle bg-surface px-3.5 py-2.5 text-sm text-strong placeholder:text-faint transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25";

const labelClass = "mb-1.5 block text-sm font-medium text-strong";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{message}</p>;
}

function Fieldset({ legend, hint, children }: { legend: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-subtle pt-7 first:border-t-0 first:pt-0">
      <legend className="sr-only">{legend}</legend>
      <div className="mb-5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-faint">{legend}</h3>
        {hint ? <p className="mt-1.5 text-sm text-body">{hint}</p> : null}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function ResellerApplicationForm() {
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
      const response = await fetch("/api/reseller-application", {
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
      setFormError("We could not reach the server. Please check your connection or call us directly.");
    }
  }

  if (status === "success") {
    return (
      <div className="surface-card h-fit rounded-xl p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-500/15 text-accent-600 dark:text-accent-300">
          <Check className="h-6 w-6" />
        </span>
        <h3 className="mt-5 text-xl font-semibold text-strong">Application received.</h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-body">
          We read every one of these ourselves. Expect a reply within two business days &mdash;
          either to arrange a demo and talk terms, or to tell you honestly that it is not a fit yet.
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
      <div className="space-y-8">
        <Fieldset legend="Your company">
          <div>
            <label className={labelClass} htmlFor="companyName">
              Company name <span className="text-red-500">*</span>
            </label>
            <input id="companyName" name="companyName" required autoComplete="organization" className={fieldClass} placeholder="Northgate Technology Group" />
            <FieldError message={fieldErrors.companyName} />
          </div>
          <div>
            <label className={labelClass} htmlFor="website">
              Website <span className="text-faint">(optional)</span>
            </label>
            <input id="website" name="website" className={fieldClass} placeholder="northgatetech.com" />
            <FieldError message={fieldErrors.website} />
          </div>
          <div>
            <label className={labelClass} htmlFor="businessType">
              What kind of business are you? <span className="text-red-500">*</span>
            </label>
            <select id="businessType" name="businessType" required defaultValue="" className={fieldClass}>
              <option value="" disabled>
                Choose one&hellip;
              </option>
              {businessTypes.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <FieldError message={fieldErrors.businessType} />
          </div>
          <div>
            <label className={labelClass} htmlFor="territory">
              Territory you serve <span className="text-faint">(optional)</span>
            </label>
            <input id="territory" name="territory" className={fieldClass} placeholder="Colorado Front Range" />
            <FieldError message={fieldErrors.territory} />
          </div>
        </Fieldset>

        <Fieldset legend="Who we'd be talking to">
          <div>
            <label className={labelClass} htmlFor="contactName">
              Your name <span className="text-red-500">*</span>
            </label>
            <input id="contactName" name="contactName" required autoComplete="name" className={fieldClass} placeholder="Dana Whitfield" />
            <FieldError message={fieldErrors.contactName} />
          </div>
          <div>
            <label className={labelClass} htmlFor="contactEmail">
              Work email <span className="text-red-500">*</span>
            </label>
            <input id="contactEmail" name="contactEmail" type="email" required autoComplete="email" className={fieldClass} placeholder="dana@northgatetech.com" />
            <FieldError message={fieldErrors.contactEmail} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="contactPhone">
              Phone <span className="text-faint">(optional)</span>
            </label>
            <input id="contactPhone" name="contactPhone" type="tel" autoComplete="tel" className={fieldClass} placeholder="(555) 555-0142" />
            <FieldError message={fieldErrors.contactPhone} />
          </div>
        </Fieldset>

        <Fieldset
          legend="Your brand"
          hint="How your customers would see the phone system. Leave blank to use your company name — you can change all of this later."
        >
          <div>
            <label className={labelClass} htmlFor="brandName">
              Brand name <span className="text-faint">(optional)</span>
            </label>
            <input id="brandName" name="brandName" className={fieldClass} placeholder="Northgate Voice" />
            <FieldError message={fieldErrors.brandName} />
          </div>
          <div>
            <label className={labelClass} htmlFor="supportEmail">
              Customer support email <span className="text-faint">(optional)</span>
            </label>
            <input id="supportEmail" name="supportEmail" type="email" className={fieldClass} placeholder="support@northgatetech.com" />
            <FieldError message={fieldErrors.supportEmail} />
          </div>
          <div>
            <label className={labelClass} htmlFor="supportPhone">
              Customer support phone <span className="text-faint">(optional)</span>
            </label>
            <input id="supportPhone" name="supportPhone" type="tel" className={fieldClass} placeholder="(555) 555-0100" />
            <FieldError message={fieldErrors.supportPhone} />
          </div>
        </Fieldset>

        <Fieldset legend="Scale">
          <div>
            <label className={labelClass} htmlFor="currentCustomers">
              Business customers today <span className="text-faint">(optional)</span>
            </label>
            <input id="currentCustomers" name="currentCustomers" className={fieldClass} placeholder="About 40" />
            <FieldError message={fieldErrors.currentCustomers} />
          </div>
          <div>
            <label className={labelClass} htmlFor="expectedSeats">
              Seats you&rsquo;d expect in year one <span className="text-faint">(optional)</span>
            </label>
            <input id="expectedSeats" name="expectedSeats" className={fieldClass} placeholder="150–250" />
            <FieldError message={fieldErrors.expectedSeats} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="sellsVoiceToday">
              Where does voice fit today? <span className="text-red-500">*</span>
            </label>
            <select id="sellsVoiceToday" name="sellsVoiceToday" required defaultValue="" className={fieldClass}>
              <option value="" disabled>
                Choose one&hellip;
              </option>
              {voiceToday.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <FieldError message={fieldErrors.sellsVoiceToday} />
          </div>
        </Fieldset>

        <Fieldset legend="In your own words">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="notes">
              Tell us about your business and why voice now <span className="text-red-500">*</span>
            </label>
            <textarea
              id="notes"
              name="notes"
              required
              rows={6}
              className={`${fieldClass} resize-y`}
              placeholder="We manage IT for about 40 small businesses across the Front Range. Most are on an incumbent carrier's hosted product and complain about support. We keep getting asked to fix phone problems we do not control, and we would rather own that relationship…"
            />
            <FieldError message={fieldErrors.notes} />
          </div>
        </Fieldset>
      </div>

      {/* Honeypot — visually hidden, ignored by real users. */}
      <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor="website2">Leave this field empty</label>
        <input id="website2" name="website2" tabIndex={-1} autoComplete="off" />
      </div>

      {formError ? (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {formError}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-4 border-t border-subtle pt-7 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-faint">
          We use these details to assess your application and get back to you. No newsletter, no
          list sharing.
        </p>
        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex flex-none items-center justify-center rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "submitting" ? "Sending…" : "Complete application"}
        </button>
      </div>
    </form>
  );
}
