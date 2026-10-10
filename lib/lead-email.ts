import { escapeHtml, oneLine } from "./escape";
import { site } from "./site";

/**
 * The notification email for an early-access / contact form signup.
 *
 * Everything here was typed by a visitor and arrives in the owner's inbox as
 * HTML, so every value goes through escapeHtml(). Phone numbers and email
 * addresses are shown as text, never as links built from input.
 */

export type LeadEmail = {
  name: string;
  company: string;
  email: string;
  phone: string | null;
  service: string;
  seats: string | null;
  message: string;
};

/** The labels the form shows for each service choice. */
export const SERVICE_LABELS: Record<string, string> = {
  "sip-trunking": "SIP trunking (keep my PBX)",
  "hosted-pbx": "Hosted PBX (replace my phone system)",
  both: "Both / a mix across sites",
  "not-sure": "Not sure yet — help me decide",
};

const LABELS: { key: keyof LeadEmail; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "company", label: "Company" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "service", label: "Interested in" },
  { key: "seats", label: "Users / channels" },
];

function displayValue(key: keyof LeadEmail, value: unknown): string {
  const raw = String(value ?? "");
  return key === "service" ? SERVICE_LABELS[raw] ?? raw : raw;
}

export function leadSubject(lead: LeadEmail, reference: string): string {
  return `Early-access signup — ${oneLine(lead.company)} (${oneLine(lead.name, 60)}) · ${reference}`;
}

export function leadText(lead: LeadEmail, reference: string): string {
  return [
    `New early-access signup — ${reference}`,
    "",
    ...LABELS.map(({ key, label }) => `${label}: ${displayValue(key, lead[key]) || "—"}`),
    "",
    "What they told us:",
    lead.message,
    "",
    `Reply directly to this email to reach ${lead.name} at ${lead.email}.`,
  ].join("\n");
}

export function leadHtml(lead: LeadEmail, reference: string): string {
  const rows = LABELS.map(({ key, label }) => {
    const value = displayValue(key, lead[key]);
    const shown = value ? escapeHtml(value) : '<span style="color:#94a3b8">&mdash;</span>';
    return `
      <tr>
        <td style="padding:9px 16px 9px 0;color:#64718a;font-size:13px;white-space:nowrap;vertical-align:top;border-bottom:1px solid #eceff5">${escapeHtml(label)}</td>
        <td style="padding:9px 0;color:#151b27;font-size:14px;vertical-align:top;border-bottom:1px solid #eceff5">${shown}</td>
      </tr>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(leadSubject(lead, reference))}</title>
</head>
<body style="margin:0;padding:0;background:#f6f8fb">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f8fb">
    <tr>
      <td align="center" style="padding:28px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:640px;background:#ffffff;border:1px solid #d8dee9;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

          <tr>
            <td style="padding:22px 28px;background:#0b0f18">
              <div style="color:#5eead4;font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase">
                ${escapeHtml(site.name)} &middot; early-access signup
              </div>
              <div style="margin-top:7px;color:#ffffff;font-size:21px;font-weight:600">
                ${escapeHtml(lead.company)}
              </div>
              <div style="margin-top:5px;color:#8592a6;font-size:13px">
                ${escapeHtml(lead.name)} &middot; Reference ${escapeHtml(reference)}
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
            <td style="padding:18px 28px 24px">
              <div style="color:#64718a;font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:8px">
                What they told us
              </div>
              <div style="color:#3b4557;font-size:14px;line-height:1.65;white-space:pre-wrap;background:#f6f8fb;border-left:3px solid #2dd4bf;border-radius:0 6px 6px 0;padding:13px 16px">${escapeHtml(lead.message)}</div>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 28px;background:#f6f8fb;border-top:1px solid #eceff5">
              <div style="color:#64718a;font-size:12px;line-height:1.6">
                Reply to this email to reach ${escapeHtml(lead.name)} directly.
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
