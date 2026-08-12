/**
 * Kampagnennamen folgen einer festen Konvention der Agentur:
 * "Kunde - ges. Position ab TT.MM.JJJJ XX". Sie steht hier und nicht im
 * Formular, damit sie testbar ist und nicht per Hand getippt wird.
 */
export type NameParts = {
  customer: string;
  position: string;
  start: Date;
  initials: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

export const formatDate = (d: Date) =>
  `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

export function campaignName(p: NameParts): string {
  return `${p.customer} - ges. ${p.position} ab ${formatDate(p.start)} ${p.initials}`;
}

// Der erste heißt immer "Ads"; erst bei mehreren Standorten braucht er den Ort.
export function adSetName(index: number, city?: string): string {
  if (index === 0) return "Ads";
  return city ? `Ads – ${city}` : `Ads ${index + 1}`;
}
