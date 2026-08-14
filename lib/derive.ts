/**
 * Aus dem Portfolio wird der Kunde abgeleitet. Meta kennt keinen Kundenbegriff;
 * eine erzeugte Datei, die ihn festhielt, alterte – 48 ihrer 215 Einträge zeigten
 * zuletzt auf Seiten, die es nicht mehr gab (siehe Spec).
 */
import type { AdAccount, Customer, Page } from "./customers";

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

/**
 * Zwei Häuser eines Trägers heißen fast gleich und bekämen dieselbe Id. Das
 * Suffix richtet sich nach der Asset-Id, weil die stabil ist; die Reihenfolge,
 * in der Graph die Edge liefert, ist es nicht.
 *
 * `pinned` sind die Quellen mit fester Id aus den Overrides: die weichen nie
 * aus, alles andere weicht ihnen aus.
 */
export function dedupeIds<T extends { id: string; source: string }>(
  customers: T[],
  pinned: Set<string>,
): T[] {
  const used = new Set<string>();
  for (const c of customers) if (pinned.has(c.source)) used.add(c.id);

  const fixed = new Map<string, string>();
  for (const c of [...customers].sort((a, b) => a.source.localeCompare(b.source))) {
    if (pinned.has(c.source)) continue;
    let id = c.id;
    for (let n = 2; used.has(id); n++) id = `${c.id}-${n}`;
    used.add(id);
    fixed.set(c.source, id);
  }

  return customers.map((c) => (fixed.has(c.source) ? { ...c, id: fixed.get(c.source)! } : c));
}

export function deriveCustomers(accounts: AdAccount[], pages: Page[]): Customer[] {
  const taken = new Set<string>();

  const fromPages = pages.map((page): Customer => {
    const adAccounts = matchAdAccounts(page.name, accounts);
    for (const a of adAccounts) taken.add(a.id);
    return {
      source: page.id,
      // Ein Name ohne einen einzigen Buchstaben oder eine Ziffer ergäbe eine
      // leere Id; dann trägt die Asset-Id.
      id: customerId(page.name) || page.id,
      name: page.name,
      page,
      instagram: page.instagram_business_account,
      adAccounts,
      access: page.access,
      issues: [],
    };
  });

  const fromAccounts = accounts
    .filter((a) => !taken.has(a.id))
    .map(
      (account): Customer => ({
        source: account.id,
        id: customerId(account.name) || account.id,
        name: account.name,
        page: undefined,
        instagram: undefined,
        adAccounts: [account],
        access: account.access,
        issues: [],
      }),
    );

  return dedupeIds([...fromPages, ...fromAccounts], new Set());
}
