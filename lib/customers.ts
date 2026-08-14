/**
 * Der Kunde ist die Einheit, in der die Agentur denkt – Meta kennt ihn nicht.
 * Hier wird er aus Konfiguration (customers.config.ts) und Portfolio gebaut.
 */
import { actId, graph, GraphError, meta } from "./graph";
import { customers as config, type CustomerConfig } from "./customers.config";
import { normalise } from "./derive";

export type Access = "own" | "client";

export type AdAccount = {
  id: string;
  name: string;
  account_status: number;
  currency: string;
  access: Access;
};

export type InstagramAccount = {
  id: string;
  username?: string;
};

export type Page = {
  id: string;
  name: string;
  link?: string;
  fan_count?: number;
  instagram_business_account?: InstagramAccount;
  /**
   * Metas Nutzungsbedingungen für Lead-Anzeigen. Ohne sie lehnt Meta jede
   * Anzeige dieser Seite ab.
   *
   * Drei Zustände, nicht zwei: `undefined` heißt „nicht lesbar“ – die Seite ist
   * dem System User nicht zugewiesen, Graph antwortet mit (#10) und lässt das
   * Feld weg. Das ist nicht dasselbe wie `false`, und nur `false` darf blocken;
   * beim Prüfen des Bestands waren rund fünfzig Seiten nicht lesbar, deren
   * Bedingungen längst stehen.
   */
  leadgen_tos_accepted?: boolean;
  access: Access;
};

/**
 * Wo ein Administrator der Seite die Lead-Gen-Nutzungsbedingungen annimmt.
 * Dass hier eine URL steht und kein Graph-Aufruf, ist die ganze Aussage: Meta
 * lässt diese Zustimmung nur in der eigenen Oberfläche geben, nur von einem
 * Administrator der Seite selbst – Zugriff auf das zahlende Werbekonto genügt
 * nicht – und stellt dafür keinen Schreibweg über die API bereit. Lesen lässt
 * sich der Status (leadgen_tos_accepted), setzen nicht.
 *
 * page_id wählt die Seite in Metas Auswahlfeld vor. Ohne den Parameter nimmt
 * jemand mit mehreren Seiten die Bedingungen für die falsche an und der Fehler
 * bleibt genau derselbe.
 */
export const leadgenTosUrl = (pageId: string) =>
  `https://www.facebook.com/ads/leadgen/tos?page_id=${pageId}`;

/** Nur explizit `false` – siehe Page.leadgen_tos_accepted. */
export const needsLeadgenTos = (page?: Pick<Page, "leadgen_tos_accepted">) =>
  page?.leadgen_tos_accepted === false;

export type Customer = {
  /** Asset, aus dem der Kunde stammt: Seiten-Id, sonst act_-Id. Schlüssel für Overrides. */
  source: string;
  id: string;
  name: string;
  page?: Page;
  instagram?: InstagramAccount;
  adAccounts: AdAccount[];
  access: Access;
  /** Leer heißt: alles zugewiesen. Sonst steht hier, was fehlt. */
  issues: string[];
};

export const instagramAccountLabel = (account?: InstagramAccount) =>
  account
    ? account.username
      ? `@${account.username}`
      : `Instagram-ID ${account.id}`
    : undefined;

export function joinCustomers(
  config: CustomerConfig[],
  accounts: AdAccount[],
  pages: Page[],
): Customer[] {
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const pg = new Map(pages.map((p) => [p.id, p]));

  return config.map((c) => {
    const page = pg.get(c.pageId);
    const wanted = c.adAccountIds.map(actId);
    const adAccounts = wanted.map((id) => acc.get(id)).filter((a): a is AdAccount => !!a);

    const issues: string[] = [];
    if (!page) issues.push(`Page ${c.pageId} is not in the portfolio`);
    for (const id of wanted)
      if (!acc.has(id)) issues.push(`Ad account ${id} is not in the portfolio`);

    return {
      source: c.pageId,
      id: c.id,
      name: c.name,
      page,
      instagram:
        page?.instagram_business_account ?? (c.igId ? { id: c.igId } : undefined),
      adAccounts,
      access: page?.access ?? adAccounts[0]?.access ?? "client",
      issues,
    };
  });
}

// Kundenkonten liegen unter client_*, eigene unter owned_* – die Agentur braucht beides.
const EDGES = [
  ["owned_ad_accounts", "accounts", "own"],
  ["client_ad_accounts", "accounts", "client"],
  ["owned_pages", "pages", "own"],
  ["client_pages", "pages", "client"],
] as const;

// ponytail: erste Seite mit 500 Einträgen, kein Paging. Reicht bis ~500 Kunden.
export async function listAssets() {
  const settled = await Promise.allSettled(
    EDGES.map(([edge, kind]) =>
      graph<{ data: any[] }>(`${meta.business}/${edge}`, {
        params: {
          // leadgen_tos_accepted kommt über diese Edge mit und kostet damit
          // keinen eigenen Aufruf – die Alternative wären 200+ Seiten-Reads.
          fields:
            kind === "accounts"
              ? "name,account_status,currency"
              : "name,link,fan_count,leadgen_tos_accepted,instagram_business_account{id,username}",
          limit: 500,
        },
        revalidate: 300,
        tags: ["assets"],
      }),
    ),
  );

  const accounts: AdAccount[] = [];
  const pages: Page[] = [];
  const errors: GraphError[] = [];

  // Promise.allSettled statt all: ein Kunde ohne Freigabe darf nicht die
  // ganze Seite leeren – genau das war der Fehler in listAssets() vorher.
  settled.forEach((r, i) => {
    const [, kind, access] = EDGES[i];
    if (r.status === "rejected") {
      errors.push(r.reason as GraphError);
      return;
    }
    const tagged = r.value.data.map((d) => ({ ...d, access }));
    if (kind === "accounts") accounts.push(...(tagged as AdAccount[]));
    else pages.push(...(tagged as Page[]));
  });

  return { accounts, pages, errors };
}

export async function listCustomers() {
  const { accounts, pages, errors } = await listAssets();
  return { customers: joinCustomers(config, accounts, pages), errors };
}

export const findCustomer = (all: Customer[], id?: string) =>
  id ? all.find((c) => c.id === id) : undefined;

/**
 * Werbekonto und Seite sind zwei Achsen: bezahlt wird fast immer über
 * MedArbeiter, veröffentlicht wird über die Seite des beworbenen Kunden.
 * Wer zahlt, braucht daher keine Seite – und wer beworben wird, kein Konto.
 */
export const payers = (all: Customer[]) =>
  all
    .filter((c) => c.adAccounts.length)
    .sort((a, b) => Number(b.id === "medarbeiter") - Number(a.id === "medarbeiter"));
export const clients = (all: Customer[]) => all.filter((c) => c.page);

/**
 * Kleine, lokale Fuzzy-Suche: Teilbegriffe treffen direkt, Auslassungen wie
 * „hrzhlt“ als geordnete Buchstabenfolge. Das reicht für Kundennamen und hält
 * eine weitere Such-Abhängigkeit aus dem Client-Bundle.
 */
export function fuzzyCustomerMatch(name: string, query: string): boolean {
  const haystack = normalise(name);
  const tokens = normalise(query).split(/\s+/).filter(Boolean);
  return tokens.every((token) => {
    if (haystack.includes(token)) return true;
    let at = 0;
    for (const char of haystack) if (char === token[at]) at += 1;
    return at === token.length;
  });
}

/**
 * Der beworbene Kunde wird über seinen Namen gewählt – über genau das Feld, das
 * es für den Kampagnennamen ohnehin schon gibt. Mehrdeutige Namen bleiben
 * bewusst unaufgelöst: eine falsche Seite fällt erst auf, wenn die Anzeige unter
 * fremdem Namen läuft, ein leeres Feld sofort.
 */
export function resolveClientByName<T extends { name: string }>(
  all: T[],
  name: string,
): T | undefined {
  const wanted = normalise(name);
  if (!wanted) return undefined;
  const hits = all.filter((c) => normalise(c.name) === wanted);
  return hits.length === 1 ? hits[0] : undefined;
}
