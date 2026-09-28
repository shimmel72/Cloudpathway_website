/**
 * The request Telnyx's email API takes.
 *
 * This is a deliberate port of `server/src/lib/telnyx-mail.js` in the
 * PhoneSystem repo, kept field-for-field identical so both systems send the
 * same shape. The quirks below were learned from real refusals on a live
 * Telnyx account — do not "clean them up" without testing against the API.
 */

export type MailMessage = {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  subject: string;
  text?: string;
  html?: string;
};

export type TelnyxMailBody = {
  from: string;
  from_name?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  reply_to?: string[];
  subject: string;
  text_body?: string;
  html_body?: string;
};

/**
 * MAIL_FROM as the two things it is: an address, and a name to show.
 *
 * Telnyx rejects `Cloudpathway <no-reply@example.com>` sent whole in `from`
 * with "from_email has invalid format" — it wants the bare address there, and
 * the display name beside it in `from_name`.
 */
export function telnyxFrom(value: string | undefined | null): { address: string; name: string } {
  const raw = String(value ?? "").trim();
  const angled = /^\s*(.*?)\s*<([^>]*)>\s*$/.exec(raw);
  const address = (angled ? angled[2] : raw).trim();
  const name = angled ? angled[1].trim().replace(/^"(.*)"$/, "$1") : "";
  return { address, name };
}

/** The whole request. `from` is MAIL_FROM, in either shape people write it. */
export function telnyxBody(message: MailMessage, from: string): TelnyxMailBody {
  const sender = telnyxFrom(from);
  return {
    from: sender.address,
    ...(sender.name ? { from_name: sender.name } : {}),
    to: ([] as string[]).concat(message.to ?? []),
    ...(message.cc ? { cc: ([] as string[]).concat(message.cc) } : {}),
    ...(message.bcc ? { bcc: ([] as string[]).concat(message.bcc) } : {}),
    ...(message.replyTo ? { reply_to: ([] as string[]).concat(message.replyTo) } : {}),
    subject: message.subject ?? "",
    // `text_body` and `html_body`, which is what Telnyx documents — not the
    // `text` and `html` nodemailer uses. Getting this wrong sends a message
    // with an empty body that is accepted and delivered.
    ...(message.text ? { text_body: message.text } : {}),
    ...(message.html ? { html_body: message.html } : {}),
  };
}

/** True when MAIL_FROM is an address Telnyx could plausibly send as. */
export function usableSendingFrom(value: string | undefined | null): boolean {
  const { address } = telnyxFrom(value);
  if (!address.includes("@")) return false;
  const domain = address.split("@").pop() ?? "";
  // `no-reply@localhost` is the shape of a default nobody set. Telnyx sends
  // only as a domain verified on the account, so a bare hostname is not one.
  return domain.includes(".") && !domain.endsWith(".localhost");
}
