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
  const recentConvos = conversations.data.filter((c) => Date.parse(c.updated_time) >= Date.parse(sinceIso));
  for (const convo of recentConvos)
    for (const m of convo.messages?.data ?? []) messages.push(toMessage(convo.id, m, page.id));
  // Kein globales Sortieren: Kommentar+Antworten kommen durch die Verschachtelung
  // schon in Zeitfolge, Konversationsnachrichten in Graphs eigener (neueste zuerst)
  // Reihenfolge – ein globaler Sort nach createdAt würde genau das durchmischen.

  return {
    source: {
      customerId: customer.id,
      channel: "facebook",
      selfId: page.id,
      posts: posts.data,
      conversations: recentConvos,
    },
    messages,
  };
}

const IG_MEDIA_FIELDS =
  "id,caption,media_url,comments{id,text,timestamp,from,replies{id,text,timestamp,from}}";
// IG-DMs laufen über dieselbe Conversations-API wie Messenger, nur mit
// platform=instagram – deshalb hier dieselben Feldnamen wie bei Facebook,
// anders als bei Kommentaren (dort ist media/comments eine eigene, ältere
// IG-Edge mit eigenen Feldnamen: text/timestamp statt message/created_time).
const IG_CONVO_FIELDS = FB_CONVO_FIELDS;

type RawIgComment = { id: string; text?: string; timestamp: string; from?: { id: string; username?: string }; replies?: { data: RawIgComment[] } };
type RawIgMedia = { id: string; caption?: string; media_url?: string; comments?: { data: RawIgComment[] } };

const igToRawPost = (m: RawIgMedia): RawPostWithReplyText => ({
  id: m.id,
  message: m.caption,
  full_picture: m.media_url,
  comments: {
    data: (m.comments?.data ?? []).map((c) => ({
      id: c.id,
      message: c.text,
      created_time: c.timestamp,
      from: c.from ? { id: c.from.id, name: c.from.username } : undefined,
      comments: { data: (c.replies?.data ?? []).map((r) => ({ id: r.id, message: r.text, created_time: r.timestamp, from: r.from ? { id: r.from.id, name: r.from.username } : undefined })) },
    })),
  },
});

export async function fetchInstagramSource(
  customer: Customer,
  page: { id: string; instagram: { id: string } },
  sinceIso: string,
): Promise<{ source: Source; messages: Message[] }> {
  const since = Math.floor(Date.parse(sinceIso) / 1000);
  const [media, conversations] = await Promise.all([
    graph<{ data: RawIgMedia[] }>(`${page.instagram.id}/media`, {
      asPage: page.id, // IG hat kein eigenes Token – es reitet auf dem der verknüpften Seite.
      params: { fields: IG_MEDIA_FIELDS, since, limit: 50 },
    }),
    graph<{ data: RawConversation[] }>(`${page.id}/conversations`, {
      asPage: page.id,
      params: { fields: IG_CONVO_FIELDS, platform: "instagram", limit: 50 },
    }),
  ]);

  const posts = media.data.map(igToRawPost);
  const messages: Message[] = [];
  for (const post of posts)
    for (const c of post.comments?.data ?? []) {
      messages.push(toMessage(c.id, c, page.id));
      for (const r of c.comments?.data ?? []) messages.push(toMessage(c.id, r, page.id));
    }
  const recentConvos = conversations.data.filter((c) => Date.parse(c.updated_time) >= Date.parse(sinceIso));
  for (const convo of recentConvos)
    for (const m of convo.messages?.data ?? []) messages.push(toMessage(convo.id, m, page.id));
  // Kein globales Sortieren: siehe Begründung bei fetchFacebookSource oben.

  return {
    source: {
      customerId: customer.id,
      channel: "instagram",
      selfId: page.id,
      posts: posts as unknown as RawPost[],
      conversations: recentConvos,
    },
    messages,
  };
}

function store(db: Database, source: Source, messages: Message[]): void {
  const items = normalize([source]);
  for (const item of items)
    upsertThread(db, {
      id: item.id,
      kind: item.kind,
      channel: item.channel,
      customerId: item.customerId,
      selfId: source.selfId,
      authorId: item.author.id,
      authorName: item.author.name,
      authorAvatar: undefined,
      contextLabel: item.context?.label,
      contextThumbnail: item.context?.thumbnail,
      contextAdId: item.context?.adId,
      postId: item.postId,
      answered: item.answered,
      lastMessageAt: item.createdAt,
      expiresAt: item.expiresAt,
      updatedAt: new Date().toISOString(),
    });
  for (const m of messages) insertMessage(db, m);
}

export async function reconcileCustomer(db: Database, customer: Customer, sinceIso: string): Promise<void> {
  const page = customer.page;
  if (!page) return; // kein Auftritt, kein Posteingang – z. B. reine Zahlkonten.

  const [fb, ig] = await Promise.all([
    fetchFacebookSource(customer, { id: page.id }, sinceIso),
    customer.instagram ? fetchInstagramSource(customer, { id: page.id, instagram: customer.instagram }, sinceIso) : undefined,
  ]);
  store(db, fb.source, fb.messages);
  if (ig) store(db, ig.source, ig.messages);
}

/** Auslöser für app/layout.tsx. Läuft für jeden Kunden mit Seite; einer scheitert nie für alle. */
export async function reconcile(db: Database, customers: Customer[]): Promise<{ ok: number; failed: { customerId: string; message: string }[] }> {
  const since = reconcileWindow();
  const targets = customers.filter((c) => c.page);
  const settled = await Promise.allSettled(targets.map((c) => reconcileCustomer(db, c, since)));

  const failed: { customerId: string; message: string }[] = [];
  let ok = 0;
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") ok++;
    else failed.push({ customerId: targets[i].id, message: (r.reason as GraphError).message });
  });
  return { ok, failed };
}
