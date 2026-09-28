import { NextResponse } from "next/server";
import { z } from "zod";
import {
  insertResellerApplication,
  recentApplicationCount,
  setApplicationMailStatus,
} from "@/lib/db";
import { sendMail, mailConfigured, describeMail } from "@/lib/mailer";
import { applicationHtml, applicationSubject, applicationText } from "@/lib/reseller-email";
import type { ResellerApplication } from "@/lib/reseller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Where applications land. Overridable so staging does not mail the owner. */
const APPLICATION_TO = process.env.RESELLER_APPLICATION_TO || "12shimmel@gmail.com";

const BUSINESS_TYPES = [
  "msp-it",
  "cabling-lowvoltage",
  "av-security",
  "telecom-consultant",
  "carrier-isp",
  "other",
] as const;

const SELLS_VOICE = ["yes-reselling", "yes-referring", "no-new-line"] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const applicationSchema = z.object({
  companyName: z.string().trim().min(2, "Please enter your company name.").max(160),
  website: optionalText(200),
  contactName: z.string().trim().min(2, "Please enter your name.").max(120),
  contactEmail: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(200),
  contactPhone: optionalText(40),
  brandName: optionalText(160),
  supportEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid support email address.")
    .max(200)
    .optional()
    .or(z.literal("")),
  supportPhone: optionalText(40),
  businessType: z.enum(BUSINESS_TYPES, { message: "Please choose what kind of business you are." }),
  currentCustomers: optionalText(40),
  expectedSeats: optionalText(40),
  sellsVoiceToday: z.enum(SELLS_VOICE, { message: "Please tell us where voice fits today." }),
  territory: optionalText(160),
  notes: z
    .string()
    .trim()
    .min(20, "Please tell us a little about your business (at least 20 characters).")
    .max(4000),
  // Honeypot. Permissive on purpose so a filled one passes validation and is
  // handled below with a fake success, rather than telling the bot it was caught.
  website2: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request body." }, { status: 400 });
  }

  const parsed = applicationSchema.safeParse(payload);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return NextResponse.json(
      { ok: false, error: "Please correct the highlighted fields.", fieldErrors },
      { status: 422 },
    );
  }

  const data = parsed.data;

  if (data.website2) {
    return NextResponse.json({ ok: true, reference: "RA-000000" }, { status: 202 });
  }

  const application: ResellerApplication = {
    companyName: data.companyName,
    website: data.website || null,
    contactName: data.contactName,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone || null,
    brandName: data.brandName || null,
    supportEmail: data.supportEmail || null,
    supportPhone: data.supportPhone || null,
    businessType: data.businessType,
    currentCustomers: data.currentCustomers || null,
    expectedSeats: data.expectedSeats || null,
    sellsVoiceToday: data.sellsVoiceToday,
    territory: data.territory || null,
    notes: data.notes,
  };

  let id: number;
  try {
    if (recentApplicationCount(data.contactEmail) >= 2) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "We have already received an application from this address. Give us a couple of days to read it, or call us if it is urgent.",
        },
        { status: 429 },
      );
    }
    id = insertResellerApplication({
      ...application,
      sourcePage: request.headers.get("referer"),
      userAgent: request.headers.get("user-agent"),
    });
  } catch (error) {
    console.error("[reseller-application] failed to store application:", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong on our end. Please call us and we will sort it out." },
      { status: 500 },
    );
  }

  const reference = `RA-${String(id).padStart(6, "0")}`;

  /**
   * Mail is sent after the row is committed, and its failure never fails the
   * application. An applicant who filled in a long form should not be told to
   * try again because our SMTP credentials are wrong — we have their details,
   * and the failure is recorded on the row so it can be found and chased.
   */
  if (!mailConfigured()) {
    console.error(`[reseller-application] ${reference} stored but not emailed: ${describeMail()}`);
    setApplicationMailStatus(id, `not sent: ${describeMail()}`);
  } else {
    try {
      const result = await sendMail({
        to: APPLICATION_TO,
        replyTo: application.contactEmail,
        subject: applicationSubject(application, reference),
        text: applicationText(application, reference),
        html: applicationHtml(application, reference),
      });
      setApplicationMailStatus(id, result.detail);
      console.log(`[reseller-application] ${reference} emailed to ${APPLICATION_TO}: ${result.detail}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[reseller-application] ${reference} stored but email failed: ${message}`);
      setApplicationMailStatus(id, `failed: ${message}`);
    }
  }

  return NextResponse.json({ ok: true, reference }, { status: 201 });
}
