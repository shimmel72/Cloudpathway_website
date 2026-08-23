import { NextResponse } from "next/server";
import { z } from "zod";
import { insertLead, recentLeadCount } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVICES = ["sip-trunking", "hosted-pbx", "both", "not-sure"] as const;

const leadSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  company: z.string().trim().min(1, "Please enter your company name.").max(160),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  service: z.enum(SERVICES, { message: "Please choose a service." }),
  seats: z.string().trim().max(40).optional().or(z.literal("")),
  message: z
    .string()
    .trim()
    .min(10, "Please tell us a little about what you need (at least 10 characters).")
    .max(4000),
  // Honeypot: real users never see this field, bots happily fill it in.
  // Deliberately permissive so a filled honeypot passes validation and is
  // handled below with a fake success, rather than telling the bot it was caught.
  website: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request body." }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(payload);

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

  // Silently accept honeypot hits so bots do not learn they were caught.
  if (data.website) {
    return NextResponse.json({ ok: true, reference: "CP-000000" }, { status: 202 });
  }

  try {
    if (recentLeadCount(data.email) >= 3) {
      return NextResponse.json(
        {
          ok: false,
          error: "We have already received several requests from this address. Please call us instead.",
        },
        { status: 429 },
      );
    }

    const id = insertLead({
      name: data.name,
      company: data.company,
      email: data.email,
      phone: data.phone || null,
      service: data.service,
      seats: data.seats || null,
      message: data.message,
      sourcePage: request.headers.get("referer"),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json(
      { ok: true, reference: `CP-${String(id).padStart(6, "0")}` },
      { status: 201 },
    );
  } catch (error) {
    console.error("[contact] failed to store lead:", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong on our end. Please call us and we will sort it out." },
      { status: 500 },
    );
  }
}
