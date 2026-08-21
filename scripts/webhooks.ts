/**
 * Der laute Weg von Hand: meldet jede Seite mit Auftritt beim Webhook an und
 * berichtet, was passiert ist.
 *   bun run webhooks
 */
import { listCustomers } from "../lib/customers";
import { ensureAppSubscription, ensureWebhookSubscribed } from "../lib/webhook-subscribe";

const { customers } = await listCustomers();
const pages = customers.filter((c) => c.page).map((c) => ({ id: c.page!.id, name: c.name }));

// Zuerst die Ebene darüber: ohne App-Abonnement liefert Meta nirgendwohin.
const callback = await ensureAppSubscription();
console.log(
  callback
    ? `✓ App-Abonnement auf ${callback} (object=page, fields=feed,messages)`
    : "· Kein App-Abonnement: META_WEBHOOK_CALLBACK_URL, META_APP_ID, META_APP_SECRET oder META_WEBHOOK_VERIFY_TOKEN fehlt",
);

const { subscribed, failed } = await ensureWebhookSubscribed(pages);
for (const p of subscribed) console.log(`✓ ${p.name} (${p.id})`);
console.log(`\n${subscribed.length} abonniert, ${failed.length} fehlgeschlagen`);
for (const f of failed) console.log(`✗ ${f.name} (${f.id}): ${f.message}`);
