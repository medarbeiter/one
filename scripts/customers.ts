/**
 * Erzeugt eine Startfassung von lib/customers.config.ts durch Namensabgleich
 * zwischen Seiten und Werbekonten. Der Abgleich ist bewusst grob – nicht
 * zugeordnete Konten stehen als Kommentar am Ende:
 *   bun run customers > lib/customers.config.ts
 */
import { batch } from "../lib/graph";
import { listAssets } from "../lib/customers";

// Rechtsformen und Branchenwörter tragen keine Unterscheidungskraft.
const NOISE = /\b(gmbh|ug|kg|ohg|e\.?\s?v\.?|pflegedienst|pflegeteam|ambulante[rn]?|seniorenheim|residenz)\b/g;
const norm = (s: string) => s.toLowerCase().replace(NOISE, "").replace(/[^a-z0-9]/g, "");

const { accounts, pages, errors } = await listAssets();
for (const e of errors) console.error(`// ! ${e.message}`);

// Instagram hängt an der Seite, ist aber ein eigener Aufruf – deshalb gebündelt.
const igs = await batch<{ instagram_business_account?: { id: string } }>(
  pages.map((p) => ({ relative_url: `${p.id}?fields=instagram_business_account` })),
);

const taken = new Set<string>();
const entries = pages.map((p, i) => {
  const key = norm(p.name);
  const mine = accounts.filter((a) => {
    const other = norm(a.name);
    return key && other && (other.includes(key) || key.includes(other));
  });
  for (const a of mine) taken.add(a.id);
  const ig = igs[i].status === "fulfilled" ? igs[i].value.instagram_business_account?.id : undefined;
  return {
    id: key.slice(0, 24) || p.id,
    name: p.name,
    pageId: p.id,
    igId: ig,
    adAccountIds: mine.map((a) => a.id),
  };
});

// Die erzeugte Datei ersetzt customers.config.ts komplett – Typ inklusive.
console.log(`/**
 * Erzeugt von \`bun run customers\`, danach von Hand korrigiert.
 * Meta kennt keinen Kundenbegriff; diese Zuordnung weiß nur die Agentur.
 */
export type CustomerConfig = {
  id: string;
  name: string;
  pageId: string;
  igId?: string;
  adAccountIds: string[];
};

export const customers: CustomerConfig[] = ${JSON.stringify(entries, null, 2)};
`);

for (const a of accounts.filter((a) => !taken.has(a.id)))
  console.log(`// nicht zugeordnet: ${a.name} (${a.id})`);
