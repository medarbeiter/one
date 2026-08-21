/**
 * Jede Seite braucht genau einen Abonnements-Aufruf, damit Metas Webhook
 * überhaupt etwas schickt – Instagram-Kommentare/-Nachrichten reiten auf
 * derselben Seiten-Subscription mit. Idempotent, sicher bei jedem Start
 * aufzurufen (wie lib/assign.ts:ensureAssigned) – eine neu angelegte Seite
 * bekommt ihr Abonnement, ohne dass jemand eine Einstellungsseite besucht.
 */
import { graph, GraphError } from "./graph";

/**
 * Der Rückweg, den Meta anrufen soll. Ohne ihn passiert hier nichts: lokal
 * gibt es keine Adresse, unter der Meta uns erreicht, und ein halb gesetztes
 * Abonnement wäre schlimmer als keins.
 */
const callbackUrl = () => process.env.META_WEBHOOK_CALLBACK_URL;

/**
 * Das Abonnement der App selbst – die Ebene über den Seiten: hier steht, wohin
 * Meta liefert und welche Objekte es überhaupt beobachtet. Fehlt es, sind alle
 * Seiten-Abonnements der Welt still, weil niemand eine Adresse kennt.
 * Erwartet Metas App-Token (App-Id|App-Secret); der System-User-Token, den
 * graph() sonst nimmt, darf diese Edge nicht.
 */
export async function ensureAppSubscription(): Promise<string | undefined> {
  const callback = callbackUrl();
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  const verify = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!callback || !appId || !secret || !verify) return undefined;

  await graph(`${appId}/subscriptions`, {
    method: "POST",
    params: {
      // params gewinnen in graph() gegen den Standard-Token – die eine Stelle,
      // die einen anderen braucht.
      access_token: `${appId}|${secret}`,
      object: "page",
      callback_url: callback,
      // feed = Kommentare unter Beiträgen, messages = Direktnachrichten;
      // Instagram reitet auf beiden mit.
      fields: "feed,messages",
      verify_token: verify,
    },
  });
  return callback;
}

export async function ensureWebhookSubscribed(
  pages: { id: string; name: string }[],
): Promise<{ subscribed: { id: string; name: string }[]; failed: { id: string; name: string; message: string }[] }> {
  const settled = await Promise.allSettled(
    pages.map((p) =>
      graph(`${p.id}/subscribed_apps`, {
        method: "POST",
        asPage: p.id,
        params: { subscribed_fields: "feed,messages" },
      }),
    ),
  );

  const subscribed: { id: string; name: string }[] = [];
  const failed: { id: string; name: string; message: string }[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") subscribed.push(pages[i]);
    else failed.push({ ...pages[i], message: (r.reason as GraphError).message });
  });
  return { subscribed, failed };
}

/**
 * Einmal je Prozess, aus app/layout.tsx heraus: Metas Abonnements ändern sich
 * nicht zwischen zwei Renderings, und bei 200 Seiten wäre das sonst bei jedem
 * Rendering ein Batch voller POSTs. Ein Neustart – und jeder Deploy – prüft
 * von Neuem; genau das holt eine neu angelegte Seite ohne Handgriff ab.
 *
 * Läuft still: ein fehlgeschlagenes Abonnement kostet Echtzeit, nicht Daten –
 * reconcile() holt dasselbe ohnehin nach.
 */
let geprueft = false;

export async function ensureWebhooksOnce(pages: { id: string; name: string }[]): Promise<void> {
  if (geprueft) return;
  geprueft = true;
  try {
    const callback = await ensureAppSubscription();
    // Ohne Adresse liefert Meta nirgendwohin – dann wären 200 Seiten-POSTs bei
    // jedem Start nur Lärm. `bun run webhooks` macht es trotzdem, wenn die
    // Adresse im App-Dashboard von Hand steht.
    if (!callback) {
      console.warn("[webhook] META_WEBHOOK_CALLBACK_URL nicht gesetzt – Echtzeitweg bleibt zu, der Abgleich füttert /inbox.");
      return;
    }
    const { failed } = await ensureWebhookSubscribed(pages);
    for (const f of failed) console.error(`[webhook] ${f.name} (${f.id}): ${f.message}`);
  } catch (e) {
    console.error(`[webhook] Abonnement nicht möglich: ${(e as Error).message}`);
  }
}
