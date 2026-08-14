/**
 * Erzeugt nichts mehr, sondern sieht nach: wo die Ableitung raten muss und wo
 * ein Override ins Leere zeigt.
 *   bun run customers
 */
import { applyOverrides, listAssets } from "../lib/customers";
import { overrides } from "../lib/customers.config";
import { deriveCustomers, matchAdAccounts } from "../lib/derive";

// Einmal lesen und selbst ableiten statt listCustomers() zu rufen: das täte
// dasselbe noch einmal, und außerhalb von Next greift der Fetch-Cache nicht.
const { accounts, pages } = await listAssets();
const { customers, issues } = applyOverrides(deriveCustomers(accounts, pages), overrides, accounts);

console.log(`${pages.length} Seiten, ${accounts.length} Werbekonten, ${customers.length} Kunden\n`);

const mehrdeutig = pages
  .map((p) => ({ p, hits: matchAdAccounts(p.name, accounts) }))
  .filter(({ hits }) => hits.length > 1);
if (mehrdeutig.length) {
  console.log("Mehrdeutige Zuordnung – Namensabgleich trifft mehr als ein Konto:");
  for (const { p, hits } of mehrdeutig)
    console.log(`  ${p.name} → ${hits.map((h) => `${h.name} (${h.id})`).join(", ")}`);
  console.log("  Eindeutig machen mit adAccountIds in lib/customers.config.ts\n");
}

const ohneKonto = customers.filter((c) => c.page && !c.adAccounts.length);
console.log(`Seiten ohne Werbekonto: ${ohneKonto.length}`);
console.log("  (normal – bezahlt wird meist über MedArbeiter)\n");

const ohneSeite = customers.filter((c) => !c.page);
if (ohneSeite.length) {
  console.log("Werbekonten ohne Seite – als eigene Kunden geführt:");
  for (const c of ohneSeite) console.log(`  ${c.name} (${c.source}) → Id ${c.id}`);
  console.log("  Unerwünschte mit hidden: true ausblenden\n");
}

const suffixe = customers.filter((c) => /-\d+$/.test(c.id));
if (suffixe.length) {
  console.log("Ids mit Kollisionssuffix – ggf. sprechende Id festsetzen:");
  for (const c of suffixe) console.log(`  ${c.name} → ${c.id} (${c.source})`);
  console.log("");
}

if (issues.length) {
  console.log("Overrides, die nicht greifen:");
  for (const i of issues) console.log(`  ! ${i}`);
} else {
  console.log("Alle Overrides greifen.");
}
