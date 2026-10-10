import { recentNotificationCount } from "./db";
import { describeMail, mailConfigured, sendMail } from "./mailer";

/**
 * Where every email this site sends goes: the owner's inbox. The site never
 * emails visitors — it tells the owner, who replies (each notification's
 * Reply-To is the visitor).
 *
 * NOTIFY_TO overrides it (a staging server should not mail the owner).
 * RESELLER_APPLICATION_TO is the older name for the same setting and is
 * still honoured, so an existing env file keeps working unchanged.
 */
export const DEFAULT_NOTIFY_TO = "12shimmel@gmail.com";

export function notifyTo(): string {
  return (process.env.NOTIFY_TO || process.env.RESELLER_APPLICATION_TO || DEFAULT_NOTIFY_TO).trim();
}

/**
 * Notification emails per hour, across both forms, before the site stops
 * emailing and only stores. Each public form submission sends one, so without
 * a cap anybody rotating made-up addresses could bury the inbox (and run up
 * the mail bill); past it, submissions are still saved with the reason on the
 * row. NOTIFY_MAX_PER_HOUR changes it.
 */
export function maxPerHour(): number {
  const n = Number(process.env.NOTIFY_MAX_PER_HOUR);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

/**
 * Email the owner about a stored submission. Never throws: the submission is
 * already safe in the database, and the returned status — the provider's id,
 * or why it was not sent — goes on its row.
 */
export async function notifyOwner(
  tag: string,
  reference: string,
  mail: { replyTo: string; subject: string; text: string; html: string },
): Promise<string> {
  if (!mailConfigured()) {
    console.error(`[${tag}] ${reference} stored but not emailed: ${describeMail()}`);
    return `not sent: ${describeMail()}`;
  }
  try {
    if (recentNotificationCount(60) >= maxPerHour()) {
      console.error(`[${tag}] ${reference} stored but not emailed: more than ${maxPerHour()} notifications in the last hour`);
      return `not sent: hourly cap of ${maxPerHour()} reached (NOTIFY_MAX_PER_HOUR)`;
    }
  } catch (error) {
    console.error(`[${tag}] could not count recent notifications, sending anyway:`, error);
  }
  try {
    const result = await sendMail({ to: notifyTo(), ...mail });
    console.log(`[${tag}] ${reference} emailed to ${notifyTo()}: ${result.detail}`);
    return result.detail;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${tag}] ${reference} stored but email failed: ${message}`);
    return `failed: ${message}`;
  }
}
