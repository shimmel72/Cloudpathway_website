import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="cp-logo" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#59acff" />
          <stop offset="1" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#cp-logo)" />
      <path
        d="M9 19.2c0-3.4 2.6-6 6-6h5"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M17.6 10.4 20.6 13.2 17.6 16" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="9" cy="21.6" r="2.1" fill="#fff" />
    </svg>
  );
}

export const Phone = (p: IconProps) => (
  <svg {...base} {...p}><path d="M6.6 3.5h3l1.5 3.7-2 1.4a11.5 11.5 0 0 0 5.3 5.3l1.4-2 3.7 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" /></svg>
);

export const Cloud = (p: IconProps) => (
  <svg {...base} {...p}><path d="M7 18.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.3 11a3.8 3.8 0 0 1-.3 7.5H7Z" /></svg>
);

export const Shield = (p: IconProps) => (
  <svg {...base} {...p}><path d="M12 3 5 6v5.5c0 4.3 2.9 8 7 9.5 4.1-1.5 7-5.2 7-9.5V6l-7-3Z" /><path d="m9.2 12 2 2 3.6-3.8" /></svg>
);

export const Bolt = (p: IconProps) => (
  <svg {...base} {...p}><path d="M13.2 3 5.8 13.2h5.1L10.4 21l7.5-10.2h-5.2L13.2 3Z" /></svg>
);

export const Users = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="9.5" cy="8" r="3" /><path d="M3.5 19.5a6 6 0 0 1 12 0" /><path d="M16.5 5.4a3 3 0 0 1 0 5.2M17.6 14.3a6 6 0 0 1 3 5.2" /></svg>
);

export const Chart = (p: IconProps) => (
  <svg {...base} {...p}><path d="M4 20h16" /><path d="M7 20v-6M12 20V5M17 20v-9" /></svg>
);

export const Globe = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5a13 13 0 0 1 0 17 13 13 0 0 1 0-17Z" /></svg>
);

export const Headset = (p: IconProps) => (
  <svg {...base} {...p}><path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3" /><path d="M19.5 14.5v2a3 3 0 0 1-3 3H13" /><rect x="2.8" y="13.4" width="3.6" height="5.2" rx="1.6" /><rect x="17.6" y="13.4" width="3.6" height="5.2" rx="1.6" /></svg>
);

export const Sliders = (p: IconProps) => (
  <svg {...base} {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);

export const Check = (p: IconProps) => (
  <svg {...base} {...p} strokeWidth={2}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);

export const ArrowRight = (p: IconProps) => (
  <svg {...base} {...p}><path d="M4.5 12h15M13.5 6l6 6-6 6" /></svg>
);

export const Mail = (p: IconProps) => (
  <svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.8 7 7.2 5.4a1.7 1.7 0 0 0 2 0L20.2 7" /></svg>
);

export const Pin = (p: IconProps) => (
  <svg {...base} {...p}><path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.4 12 21 12 21Z" /><circle cx="12" cy="10.4" r="2.4" /></svg>
);

export const Clock = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.2V12l3.2 2" /></svg>
);
