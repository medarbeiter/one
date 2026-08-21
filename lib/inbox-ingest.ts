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

export type WebhookEntry = {
  id: string; // Page- oder IG-Business-Id, je nach Objekt-Typ des Webhooks
  changes?: { field: string; value: { item?: string; verb?: string; comment_id?: string; id?: string; post_id?: string; media?: { id: string }; parent_id?: string } }[];
  messaging?: { sender: { id: string }; recipient: { id: string }; timestamp: number; message?: { mid: string; text?: string } }[];
};

const FB_COMMENT_FIELDS = "id,message,created_time,from,comments{id,message,created_time,from}";
const FB_POST_MINI_FIELDS = "id,message,full_picture";

/** Der eine nachgeholte Kommentar, mit demselben Feldsatz wie in reconcile() – siehe Modulkommentar oben. */
type RawFetchedComment = { id: string; message?: string; created_time: string; from?: { id: string; name?: string }; comments?: { data: RawReplyWithText[] } };

async function ingestComment(db: Database, pageId: string, customer: Customer, commentId: string, postId: string, threadId: string): Promise<void> {
  const [comment, post] = await Promise.all([
    graph<RawFetchedComment>(commentId, { asPage: pageId, params: { fields: FB_COMMENT_FIELDS } }),
    graph<{ id: string; message?: string; full_picture?: string }>(postId, { asPage: pageId, params: { fields: FB_POST_MINI_FIELDS } }).catch(() => ({ id: postId, message: undefined, full_picture: undefined })),
  ]);

  const source: Source = {
    customerId: customer.id,
    channel: customer.instagram && postId.startsWith(customer.instagram.id) ? "instagram" : "facebook",
    selfId: pageId,
    posts: threadId === commentId
      ? [{ id: postId, message: post.message, full_picture: post.full_picture, comments: { data: [comment] } }]
      : [],
    conversations: [],
  };

  if (threadId === commentId) {
    store(db, source, [toMessage(commentId, comment, pageId)]);
  } else {
    // Antwort auf einen bestehenden Thread: kein neuer Thread, nur eine
    // weitere Nachricht plus "beantwortet", wenn wir selbst geschrieben haben.
    const reply = toMessage(threadId, comment, pageId);
    insertMessage(db, reply);
    if (reply.fromSelf) {
      const existing = db.query("SELECT customer_id FROM threads WHERE id = ?").get(threadId) as { customer_id: string } | undefined;
      if (existing) db.query("UPDATE threads SET answered = 1, last_message_at = ?, updated_at = ? WHERE id = ?").run(reply.createdAt, reply.createdAt, threadId);
    }
  }
}

async function ingestMessage(db: Database, pageId: string, customer: Customer, senderId: string, mid: string, text: string, timestamp: number): Promise<void> {
  // Der Webhook trägt keine Unterhaltungs-Id – dieselbe, die reconcile() über
  // die Conversations-Edge bekommt, kommt hier über deren user_id-Filter.
  const { data } = await graph<{ data: RawConversation[] }>(`${pageId}/conversations`, {
    asPage: pageId,
    params: { fields: "id,updated_time,participants", user_id: senderId, limit: 1 },
  });
  const convo = data[0];
  if (!convo) return; // Meta liefert die Konversation manchmal erst mit minimaler Verzögerung – reconcile() holt sie spätestens in 90 Tagen nach.

  const fromSelf = false; // eingehende messaging-Events sind vom Gegenüber; ausgehende laufen über inbox-send.ts, nicht über den Webhook.
  const other = (convo.participants?.data ?? []).find((p) => p.id !== pageId);
  const createdAt = new Date(timestamp).toISOString();

  const source: Source = {
    customerId: customer.id,
    channel: "facebook",
    selfId: pageId,
    posts: [],
    conversations: [{ ...convo, messages: { data: [{ id: mid, message: text, created_time: createdAt, from: { id: senderId, name: other?.name } }] } }],
  };
  store(db, source, [{ id: mid, threadId: convo.id, authorId: senderId, authorName: other?.name ?? "Unknown", text, fromSelf, createdAt }]);
}

export async function ingestWebhookEntry(db: Database, entry: WebhookEntry, customerFor: (pageId: string) => Customer | undefined): Promise<void> {
  const customer = customerFor(entry.id);
  if (!customer) return; // Seite gehört keinem geführten Kunden (mehr) – nichts zu tun.

  for (const change of entry.changes ?? []) {
    if (change.field !== "feed" && change.field !== "comments") continue;
    const v = change.value;
    if (v.item !== "comment" || v.verb !== "add") continue;
    const commentId = v.comment_id ?? v.id;
    const postId = v.post_id ?? v.media?.id;
    if (!commentId || !postId) continue;
    const threadId = v.parent_id && v.parent_id !== postId ? v.parent_id : commentId;
    await ingestComment(db, entry.id, customer, commentId, postId, threadId);
  }

  for (const m of entry.messaging ?? []) {
    if (!m.message?.text) continue;
    await ingestMessage(db, entry.id, customer, m.sender.id, m.message.mid, m.message.text, m.timestamp);
  }
}
