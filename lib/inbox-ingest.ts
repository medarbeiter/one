/**
 * Zwei Wege in den Speicher: reconcile() für den ruhigen, selbstheilenden
 * Abgleich (nach 90 Tagen zurück), ingestWebhookEntry() (Task 7) für den
 * schnellen Weg bei Metas Echtzeit-Push. Beide laufen durch normalize() aus
 * lib/inbox.ts – das bleibt die einzige Stelle, die die vier Graph-Formen
 * kennt.
 */
import { graph, GraphError } from "./graph";
import type { Customer } from "./customers";
import { normalize, type RawComment, type RawConversation, type RawPost, type Source } from "./inbox";
import { insertMessage, upsertThread, type Message } from "./inbox-store";
import { Database } from "bun:sqlite";

const DAYS_90 = 90 * 24 * 60 * 60 * 1000;
export const reconcileWindow = (now = Date.now()) => new Date(now - DAYS_90).toISOString();

/** Reply-Text kommt zwar mit, aber nicht in RawComment's Typ – siehe Erklärung oben in der Aufgabe. */
type RawReplyWithText = { id: string; message?: string; created_time: string; from?: { id: string; name?: string } };
type RawPostWithReplyText = Omit<RawPost, "comments"> & {
  comments?: { data: (Omit<RawComment, "comments"> & { comments?: { data: RawReplyWithText[] } })[] };
};

const toMessage = (threadId: string, r: RawReplyWithText, selfId: string): Message => ({
  id: r.id,
  threadId,
  authorId: r.from?.id ?? "",
  authorName: r.from?.name ?? "Unknown",
  text: r.message ?? "",
  fromSelf: r.from?.id === selfId,
  createdAt: new Date(r.created_time).toISOString(),
});

const FB_POST_FIELDS =
  "id,message,full_picture,comments.summary(false){id,message,created_time,from,comments{id,message,created_time,from}}";
const FB_CONVO_FIELDS = "id,updated_time,participants,messages{id,message,created_time,from}";

export async function fetchFacebookSource(
  customer: Customer,
  page: { id: string },
  sinceIso: string,
): Promise<{ source: Source; messages: Message[] }> {
  const since = Math.floor(Date.parse(sinceIso) / 1000);
  const [posts, conversations] = await Promise.all([
    graph<{ data: RawPostWithReplyText[] }>(`${page.id}/posts`, {
      asPage: page.id,
      params: { fields: FB_POST_FIELDS, since, limit: 50 },
    }),
    graph<{ data: RawConversation[] }>(`${page.id}/conversations`, {
      asPage: page.id,
      params: { fields: FB_CONVO_FIELDS, limit: 50 },
    }),
  ]);

  const messages: Message[] = [];
  for (const post of posts.data)
    for (const c of post.comments?.data ?? []) {
      // Der Kommentar selbst ist die erste Nachricht des Threads, nicht nur seine Antworten.
      messages.push(toMessage(c.id, c, page.id));
      for (const r of c.comments?.data ?? []) messages.push(toMessage(c.id, r, page.id));
    }
  for (const convo of conversations.data.filter((c) => Date.parse(c.updated_time) >= Date.parse(sinceIso)))
    for (const m of convo.messages?.data ?? []) messages.push(toMessage(convo.id, m as any, page.id));
  // Kein globales Sortieren: Kommentar+Antworten kommen durch die Verschachtelung
  // schon in Zeitfolge, Konversationsnachrichten in Graphs eigener (neueste zuerst)
  // Reihenfolge – ein globaler Sort nach createdAt würde genau das durchmischen.

  return {
    source: {
      customerId: customer.id,
      channel: "facebook",
      selfId: page.id,
      posts: posts.data as unknown as RawPost[],
      conversations: conversations.data.filter((c) => Date.parse(c.updated_time) >= Date.parse(sinceIso)),
    },
    messages,
  };
}
