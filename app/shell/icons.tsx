/**
 * Strichsymbole als Inline-SVG, alle auf demselben 24er-Raster und in
 * currentColor. Eine Icon-Bibliothek als Abhängigkeit könnte nichts, was diese
 * neun Pfade nicht können – neue Symbole kommen hier dazu.
 */
const PATHS = {
  home: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z",
  inbox: "M3 13h5l1.5 2.5h5L16 13h5M5.5 5.5h13l2.5 7.5V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z",
  megaphone: "M4 10v3a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1zM16 8.5a5 5 0 0 1 0 7M7.5 14v4",
  users:
    "M15 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 4 18.5V20M9.5 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.7a3.5 3.5 0 0 1 0 6.6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.6-3.6",
  filter: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  calendar: "M8 3.5v3M16 3.5v3M4 9.5h16M6 5.5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z",
  chevron: "m7.5 10.5 4.5 4.5 4.5-4.5",
  plus: "M12 5.5v13M5.5 12h13",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-4" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
