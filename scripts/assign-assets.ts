/**
 * Weist dem System-Nutzer alle Werbekonten und Seiten des Portfolios zu –
 * eigene wie von Kunden freigegebene. Nach jedem neuen Kunden neu laufen lassen:
 *   bun run assign
 */
import { graph, meta } from "../lib/graph";

const { data: users } = await graph<{ data: { id: string; name: string }[] }>(
  `${meta.business}/system_users`,
);
if (users.length !== 1) {
  console.log(
    "System-Nutzer:",
    users.map((u) => `${u.name} (${u.id})`).join(", "),
  );
}
const user = process.env.META_SYSTEM_USER_ID ?? users[0]?.id;
if (!user) throw new Error("Kein System-Nutzer im Portfolio gefunden.");

const edges = [
  ["owned_ad_accounts", "Werbekonto"],
  ["client_ad_accounts", "Werbekonto (Kunde)"],
  ["owned_pages", "Seite"],
  ["client_pages", "Seite (Kunde)"],
] as const;

let ok = 0;
const failed: string[] = [];

for (const [edge, label] of edges) {
  const { data } = await graph<{ data: { id: string; name: string }[] }>(
    `${meta.business}/${edge}`,
    { params: { fields: "name", limit: 500 } },
  );

  for (const asset of data) {
    try {
      // MANAGE = Vollzugriff, deckt Anzeigen, Inhalte und Nachrichten ab.
      await graph(`${asset.id}/assigned_users`, {
        method: "POST",
        params: { user, tasks: ["MANAGE"] },
      });
      ok++;
      console.log(`✓ ${label}: ${asset.name}`);
    } catch (e) {
      failed.push(
        `${label} ${asset.name} (${asset.id}): ${(e as Error).message}`,
      );
    }
  }
}

console.log(`\n${ok} zugewiesen, ${failed.length} fehlgeschlagen`);
for (const f of failed) console.log(`✗ ${f}`);
