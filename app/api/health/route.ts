import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { dbHealth } from "@/lib/db";
import { describeMail, mailConfigured } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let release: string | null | undefined;

/** The release the installer stamped into this build, if any. */
function currentRelease(): string | null {
  if (release !== undefined) return release;
  try {
    release = fs.readFileSync(path.join(process.cwd(), ".release"), "utf8").trim() || null;
  } catch {
    release = null;
  }
  return release;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Liveness for nginx, uptime monitors and the installer.
 *
 * Anyone can ask whether the site is up. Only a request made straight to the
 * loopback port gets the detail — mail configuration and file paths are not
 * something to hand to the internet.
 *
 * "Straight to the loopback port" cannot be read off X-Forwarded-For alone:
 * `next start` synthesises that header itself, as 127.0.0.1, on every direct
 * request (verified against Next 15.5). What it never adds is X-Real-IP, and
 * the nginx vhost in deploy/ always sets X-Real-IP, overwriting anything a
 * client sent. So: no X-Real-IP, and X-Forwarded-For is exactly one loopback
 * address. Exactly one, because Next fills the header in only when it is
 * absent, and a proxy that appends to whatever the client sent would pass on
 * "127.0.0.1, <client>" — a first entry the client chose. Any proxy put in
 * front of this app must set X-Real-IP too, or it inherits the detailed view.
 */
export async function GET(request: Request) {
  const db = dbHealth();
  const ok = db.ok;
  const status = ok ? 200 : 503;

  const forwardedFor = (request.headers.get("x-forwarded-for") ?? "").trim();
  const direct = !request.headers.get("x-real-ip") && !forwardedFor.includes(",") && LOOPBACK.has(forwardedFor);
  if (!direct) {
    return NextResponse.json({ ok }, { status, headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json(
    {
      ok,
      release: currentRelease(),
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      db,
      mail: { configured: mailConfigured(), describe: describeMail() },
      portalImportLinks: Boolean(process.env.PORTAL_URL),
    },
    { status, headers: { "cache-control": "no-store" } },
  );
}
