// Intl.RelativeTimeFormat statt einer Bibliothek – die Auflösung reicht bis
// zur Minute, mehr braucht eine Inbox-Zeile nicht.
const rtf = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });
const STEPS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.345, "week"],
  [12, "month"],
  [Infinity, "year"],
];

export function relativeTime(iso: string, now = Date.now()): string {
  let diff = (Date.parse(iso) - now) / 1000;
  for (const [step, unit] of STEPS) {
    if (Math.abs(diff) < step) return rtf.format(Math.round(diff), unit);
    diff /= step;
  }
  return rtf.format(Math.round(diff), "year");
}
