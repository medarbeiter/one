/**
 * Aus dem Portfolio wird der Kunde abgeleitet. Meta kennt keinen Kundenbegriff;
 * eine erzeugte Datei, die ihn festhielt, alterte – 48 ihrer 215 Einträge zeigten
 * zuletzt auf Seiten, die es nicht mehr gab (siehe Spec).
 */
import type { AdAccount } from "./customers";

/**
 * Der beworbene Kunde wird über seinen Namen gewählt. Kleinschreibung, NFKD,
 * Diakritika weg, ß→ss: „Schröter“ und „Schroeter“ sollen dasselbe treffen.
 */
export const normalise = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase("de")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replaceAll("ß", "ss");

/**
 * Rechtsformen und Branchenwörter tragen keine Unterscheidungskraft – aber nur
 * beim Zuordnen. Für den Namen des Kunden zählt sein voller Name, sonst hießen
 * zwei Häuser desselben Trägers gleich.
 */
const NOISE =
  /\b(gmbh|ug|kg|ohg|e\.?\s?v\.?|pflegedienst|pflegeteam|ambulante[rn]?|seniorenheim|residenz)\b/g;

export const matchKey = (s: string) =>
  normalise(s)
    .replace(NOISE, "")
    .replace(/[^a-z0-9]/g, "");

/** 48 Zeichen: lang genug, dass sich zwei Häuser eines Trägers unterscheiden. */
export const customerId = (name: string) =>
  normalise(name)
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 48);

/**
 * Bewusst grob und in beide Richtungen: „Schäkel Werbekonto“ trifft
 * „Pflegedienst Schäkel“ und umgekehrt. Ein leerer Schlüssel trifft nichts –
 * per Teilstring träfe er sonst jedes Konto.
 */
export function matchAdAccounts(pageName: string, accounts: AdAccount[]): AdAccount[] {
  const key = matchKey(pageName);
  if (!key) return [];
  return accounts.filter((a) => {
    const other = matchKey(a.name);
    return !!other && (other.includes(key) || key.includes(other));
  });
}
