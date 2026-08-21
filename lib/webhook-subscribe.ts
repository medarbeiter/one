/**
 * Jede Seite braucht genau einen Abonnements-Aufruf, damit Metas Webhook
 * überhaupt etwas schickt – Instagram-Kommentare/-Nachrichten reiten auf
 * derselben Seiten-Subscription mit. Idempotent, sicher bei jedem Start
 * aufzurufen (wie lib/assign.ts:ensureAssigned) – eine neu angelegte Seite
 * bekommt ihr Abonnement, ohne dass jemand eine Einstellungsseite besucht.
 */
import { graph, GraphError } from "./graph";

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
