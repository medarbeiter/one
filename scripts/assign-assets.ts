/**
 * Der laute Weg von Hand: gleicht ab wie die App, ignoriert aber jeden Merker
 * und berichtet, was passiert ist.
 *   bun run assign
 */
import { assigner, systemUser } from "../lib/assign";
import { graph, meta } from "../lib/graph";

const user = await systemUser();

// Die Prüfung kostet einen Aufruf und bleibt deshalb im Skript: Zuweisungen an
// einen Nutzer, der gar nicht zu diesem Business gehört, laufen grün durch und
// wirken nie.
const { data: users } = await graph<{ data: { id: string; name: string }[] }>(
  `${meta.business}/system_users`,
);
const self = users.find((u) => u.id === user);
if (!self)
  throw new Error(
    `Der Token gehört Nutzer ${user}, der kein System-Nutzer von Business ` +
      `${meta.business} ist. Bekannt sind: ${users.map((u) => `${u.name} (${u.id})`).join(", ")}`,
  );
console.log(`Weise zu an: ${self.name} (${self.id})\n`);

const { assigned, failed } = await assigner.run(true);

for (const a of assigned) console.log(`✓ ${a.name} (${a.id})`);
console.log(`\n${assigned.length} zugewiesen, ${failed.length} fehlgeschlagen`);
for (const f of failed) console.log(`✗ ${f.asset.name} (${f.asset.id}): ${f.message}`);
