/**
 * Der Kunde ist die Einheit, in der die Agentur denkt – Meta kennt ihn nicht.
 * Hier wird er aus Konfiguration (customers.config.ts) und Portfolio gebaut.
 */
import { actId, graph, GraphError, meta } from "./graph";
import { customers as config, type CustomerConfig } from "./customers.config";

export type Access = "own" | "client";

export type AdAccount = {
  id: string;
  name: string;
  account_status: number;
  currency: string;
  access: Access;
};

export type Page = {
  id: string;
  name: string;
  link?: string;
  fan_count?: number;
  access: Access;
};

export type Customer = {
  id: string;
  name: string;
  page?: Page;
  igId?: string;
  adAccounts: AdAccount[];
  access: Access;
  /** Leer heißt: alles zugewiesen. Sonst steht hier, was fehlt. */
  issues: string[];
};

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
      id: c.id,
      name: c.name,
      page,
      igId: c.igId,
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
          fields: kind === "accounts" ? "name,account_status,currency" : "name,link,fan_count",
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
