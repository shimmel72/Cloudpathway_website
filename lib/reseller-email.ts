import {
  BUSINESS_TYPE_LABELS,
  SELLS_VOICE_LABELS,
  portalImportUrl,
  portalPrefill,
  type ResellerApplication,
} from "./reseller";
import { escapeHtml, oneLine } from "./escape";
import { site } from "./site";

/**
 * The notification email for a reseller application.
 *
 * Everything an applicant typed is attacker-controlled text arriving in
 * somebody's inbox as HTML, so every interpolation goes through escapeHtml().
 * There is no path here that writes applicant input into the document raw.
 */
/**
 * A website an applicant typed, as a link only if it is genuinely one.
 *
 * Escaping alone already stops injection here — the value lands in a quoted
 * attribute with its quotes and angle brackets encoded. But blindly prefixing
 * "https://" onto whatever was typed produces links to nonsense, and a field
 * that renders `https://javascript:alert(1)` as a hyperlink invites somebody
 * to find the case where the prefix is not applied. Parsed instead: an http(s)
 * URL with a dotted host becomes a link, anything else stays plain text.
 */
function safeUrl(value: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || /\s/.test(raw)) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // A real hostname: dotted, no credentials, nothing exotic.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) return null;
  if (url.username || url.password) return null;
  return url.toString();
}



/** The value a human should read for a field the form stores as a key. */
function displayValue(key: keyof ResellerApplication, value: unknown): string {
  const raw = String(value ?? "");
  if (key === "businessType") return BUSINESS_TYPE_LABELS[raw] ?? raw;
  if (key === "sellsVoiceToday") return SELLS_VOICE_LABELS[raw] ?? raw;
  return raw;
}

const LABELS: { key: keyof ResellerApplication; label: string }[] = [
  { key: "companyName", label: "Company" },
  { key: "website", label: "Website" },
  { key: "contactName", label: "Contact" },
  { key: "contactEmail", label: "Email" },
  { key: "contactPhone", label: "Phone" },
  { key: "brandName", label: "Brand name" },
  { key: "supportEmail", label: "Support email" },
  { key: "supportPhone", label: "Support phone" },
  { key: "businessType", label: "Business type" },
  { key: "territory", label: "Territory" },
  { key: "currentCustomers", label: "Current customers" },
  { key: "expectedSeats", label: "Expected seats (yr 1)" },
  { key: "sellsVoiceToday", label: "Sells voice today" },
];

export function applicationSubject(app: ResellerApplication, reference: string): string {
  return `Reseller application — ${oneLine(app.companyName)} (${reference})`;
}

export function applicationText(app: ResellerApplication, reference: string): string {
  const lines = LABELS.map(({ key, label }) => `${label}: ${displayValue(key, app[key]) || "—"}`);
  const importUrl = portalImportUrl(app, reference);
  return [
    `New reseller application — ${reference}`,
    "",
    ...lines,
    "",
    "Notes:",
    app.notes,
    "",
    importUrl
      ? `Import into the portal (opens the Resellers page with this application pre-filled):\n${importUrl}`
      : "Set PORTAL_URL to include a one-click import link in this email.",
    "",
    `Reply directly to this email to reach ${app.contactName} at ${app.contactEmail}.`,
  ].join("\n");
}

export function applicationHtml(app: ResellerApplication, reference: string): string {
  const importUrl = portalImportUrl(app, reference);
  const prefill = portalPrefill(app);

  const rows = LABELS.map(({ key, label }) => {
    const value = displayValue(key, app[key]);
    const shown = value ? escapeHtml(value) : "<span style=\"color:#94a3b8\">&mdash;</span>";
    const isEmail = key === "contactEmail" || key === "supportEmail";
    const isLink = key === "website";
    let cell = shown;
    if (value && isEmail) cell = `<a href="mailto:${escapeHtml(value)}" style="color:#1655e1;text-decoration:none">${shown}</a>`;
    if (value && isLink) {
      const href = safeUrl(String(value));
      // Not a parseable URL: shown as the text they typed, not as a link.
      if (href) cell = `<a href="${escapeHtml(href)}" style="color:#1655e1;text-decoration:none">${shown}</a>`;
    }
    return `
      <tr>
        <td style="padding:9px 16px 9px 0;color:#64718a;font-size:13px;white-space:nowrap;vertical-align:top;border-bottom:1px solid #eceff5">${escapeHtml(label)}</td>
        <td style="padding:9px 0;color:#151b27;font-size:14px;vertical-align:top;border-bottom:1px solid #eceff5">${cell}</td>
      </tr>`;
  }).join("");

  const importButton = importUrl
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px">
        <tr>
          <td bgcolor="#1d6bf5" style="border-radius:8px">
            <a href="${escapeHtml(importUrl)}"
               style="display:inline-block;padding:13px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">
              Import into the portal &rarr;
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0;color:#64718a;font-size:12px;line-height:1.6">
        Opens the portal's Resellers page with this application pre-filled. Nothing is created
        until you review the commercial terms and press save. You will need to be signed in as a
        super admin.
      </p>`
    : `
      <p style="margin:0;color:#64718a;font-size:13px;line-height:1.6">
        No import link: <code style="background:#eceff5;padding:2px 5px;border-radius:3px">PORTAL_URL</code>
        is not set on the website deployment. The fields below map straight onto the portal's
        reseller form.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px">
        ${Object.entries(prefill)
          .map(
            ([k, v]) =>
              `<tr><td style="padding:2px 12px 2px 0;color:#64718a">${escapeHtml(k)}</td><td style="padding:2px 0;color:#151b27">${escapeHtml(v) || "&mdash;"}</td></tr>`,
          )
          .join("")}
      </table>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(applicationSubject(app, reference))}</title>
</head>
<body style="margin:0;padding:0;background:#f6f8fb">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f8fb">
    <tr>
      <td align="center" style="padding:28px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:640px;background:#ffffff;border:1px solid #d8dee9;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

          <tr>
            <td style="padding:22px 28px;background:#0b0f18">
              <div style="color:#8ecaff;font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase">
                ${escapeHtml(site.name)} &middot; reseller application
              </div>
              <div style="margin-top:7px;color:#ffffff;font-size:21px;font-weight:600">
                ${escapeHtml(app.companyName)}
              </div>
              <div style="margin-top:5px;color:#8592a6;font-size:13px">
                Reference ${escapeHtml(reference)}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 28px 8px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${rows}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px 4px">
              <div style="color:#64718a;font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:8px">
                What they told us
              </div>
              <div style="color:#3b4557;font-size:14px;line-height:1.65;white-space:pre-wrap;background:#f6f8fb;border-left:3px solid #2dd4bf;border-radius:0 6px 6px 0;padding:13px 16px">${escapeHtml(app.notes)}</div>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 28px 28px">
              <div style="border-top:1px solid #eceff5;padding-top:22px">
                ${importButton}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 28px;background:#f6f8fb;border-top:1px solid #eceff5">
              <div style="color:#64718a;font-size:12px;line-height:1.6">
                Reply to this email to reach ${escapeHtml(app.contactName)} directly.
                Sent by the ${escapeHtml(site.domain)} website.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
