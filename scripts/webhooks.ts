/**
 * Der laute Weg von Hand: meldet jede Seite mit Auftritt beim Webhook an und
 * berichtet, was passiert ist.
 *   bun run webhooks
 */
import { listCustomers } from "../lib/customers";
import { ensureWebhookSubscribed } from "../lib/webhook-subscribe";

const { customers } = await listCustomers();
const pages = customers.filter((c) => c.page).map((c) => ({ id: c.page!.id, name: c.name }));

const { subscribed, failed } = await ensureWebhookSubscribed(pages);
for (const p of subscribed) console.log(`✓ ${p.name} (${p.id})`);
console.log(`\n${subscribed.length} abonniert, ${failed.length} fehlgeschlagen`);
for (const f of failed) console.log(`✗ ${f.name} (${f.id}): ${f.message}`);
