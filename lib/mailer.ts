import { telnyxBody, usableSendingFrom, type MailMessage } from "./telnyx-mail.ts";

/**
 * Sending mail through Telnyx, the same transport the PhoneSystem portal uses.
 *
 * Configuration mirrors the portal so one set of credentials covers both:
 *   TELNYX_API_KEY  the same key numbers and SMS use
 *   MAIL_FROM       "Cloudpathway <no-reply@cloudpathway.org>"
 *   TELNYX_API_URL  optional override, defaults to api.telnyx.com
 *
 * Telnyx sends only as a domain verified on your account, so a deployment with
 * a key but no usable MAIL_FROM is *not* configured however complete it looks.
 * That is reported rather than papered over — see docs/reseller-applications.md.
 */

export class MailError extends Error {
  permanent: boolean;
  constructor(message: string, { permanent = false } = {}) {
    super(message);
    this.name = "MailError";
    this.permanent = permanent;
  }
}

export function mailConfigured(): boolean {
  return Boolean(process.env.TELNYX_API_KEY) && usableSendingFrom(process.env.MAIL_FROM);
}

/** Why mail is or is not working, in one line, for logs and health checks. */
export function describeMail(): string {
  if (!process.env.TELNYX_API_KEY) return "Telnyx Email, but TELNYX_API_KEY is not set";
  if (!usableSendingFrom(process.env.MAIL_FROM)) {
    return `Telnyx Email, but MAIL_FROM is ${process.env.MAIL_FROM ? "not a sendable address" : "not set"}`;
  }
  return `Telnyx Email as ${process.env.MAIL_FROM}`;
}

export async function sendMail(message: MailMessage): Promise<{ detail: string }> {
  const key = process.env.TELNYX_API_KEY || "";
  const base = process.env.TELNYX_API_URL || "https://api.telnyx.com";
  const from = process.env.MAIL_FROM || "";

  if (!key) throw new MailError("TELNYX_API_KEY is not set", { permanent: true });
  if (!usableSendingFrom(from)) {
    throw new MailError(
      `MAIL_FROM is ${from ? `"${from}", which has no sendable domain` : "not set"}. ` +
        "Telnyx sends only as a domain verified on your account, so set MAIL_FROM to an address " +
        'on your own domain — for example MAIL_FROM="Cloudpathway <no-reply@cloudpathway.org>" — ' +
        "and add that domain under Email in the Telnyx portal.",
      { permanent: true },
    );
  }

  const post = async (payload: unknown) => {
    try {
      const res = await fetch(`${base}/v2/email_messages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      return { res, text: await res.text() };
    } catch (err) {
      // Never reached them. DNS, a dropped connection and a timeout are all
      // temporary and none of them says anything about the message.
      throw new MailError(`Could not reach ${base}: ${(err as Error).message}`);
    }
  };

  const payload = telnyxBody(message, from);
  let { res, text } = await post(payload);

  // The display name travels in a field of its own, and whether that field
  // exists could not be read from the documentation. If Telnyx rejects the
  // field rather than the value, the message is worth more than the name.
  if (res.status === 422 && "from_name" in payload && /from_name/i.test(text)) {
    const { from_name: _dropped, ...bare } = payload;
    ({ res, text } = await post(bare));
  }

  if (res.ok) {
    let id = "";
    try {
      id = (JSON.parse(text) as { data?: { id?: string } })?.data?.id ?? "";
    } catch {
      // Accepted with a body we cannot read is still accepted.
    }
    return { detail: id ? `accepted as ${id}` : "accepted" };
  }

  throw new MailError(`Telnyx refused it (${res.status}): ${text.slice(0, 400)}`, {
    // 429 is a rate limit and 5xx is theirs, so both are worth repeating.
    // Every other 4xx is an answer about this message.
    permanent: res.status !== 429 && res.status < 500,
  });
}
