import Link from "next/link";
import { launch } from "@/lib/site";

/**
 * The launch-status strip above the header, on every page. While the service is
 * in development, this is the first thing a visitor reads.
 */
export function AnnouncementBar() {
  return (
    <div className="border-b border-white/10 bg-ink-950 text-white" role="region" aria-label="Launch status">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-2.5 text-center text-sm sm:px-8">
        <span className="inline-flex items-center gap-2 font-semibold">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-400" />
          </span>
          {launch.banner.status}
        </span>{" "}
        <span className="text-ink-300">
          <span className="hidden sm:inline">{launch.banner.long}</span>
          <span className="sm:hidden">{launch.banner.short}</span>
        </span>{" "}
        <Link
          href={launch.cta.href}
          className="font-semibold text-accent-300 underline underline-offset-4 hover:text-accent-400"
        >
          {launch.cta.label} &rarr;
        </Link>
      </div>
    </div>
  );
}
