/**
 * Zwei Wege in den Speicher: reconcile() für den ruhigen, selbstheilenden
 * Abgleich (nach 90 Tagen zurück), ingestWebhookEntry() (Task 7) für den
 * schnellen Weg bei Metas Echtzeit-Push. Beide laufen durch normalize() aus
 * lib/inbox.ts – das bleibt die einzige Stelle, die die vier Graph-Formen
 * kennt.
 */
import { batch, graph, GraphError } from "./graph";
import { dmAvatars, igAvatars } from "./avatars";
import type { Customer } from "./customers";
import { normalize, type RawComment, type RawConversation, type RawFrom, type RawPost, type Source } from "./inbox";
import { insertMessage, upsertThread, type Message } from "./inbox-store";
import { Database } from "bun:sqlite";

const DAYS_90 = 90 * 24 * 60 * 60 * 1000;
export const reconcileWindow = (now = Date.now()) => new Date(now - DAYS_90).toISOString();

/** Reply-Text kommt zwar mit, aber nicht in RawComment's Typ – siehe Erklärung oben in der Aufgabe. */
type RawReplyWithText = { id: string; message?: string; created_time: string; from?: RawFrom; parent?: { id: string } };
type RawPostWithReplyText = Omit<RawPost, "comments"> & {
  comments?: { data: (Omit<RawComment, "comments"> & { comments?: { data: RawReplyWithText[] } })[] };
};

/**
 * Edges, die zu bleiben, bis jemand außerhalb dieses Programms etwas ändert:
 * der gesperrte DM-Zugriff (#200, nur der Kontoinhaber in Instagram selbst)
 * und der Timeout "zu viele Unterhaltungen mit Nutzern ohne App-Rolle" (die
 * App hat für instagram_manage_messages nur Standard-Zugriff; Meta siebt
 * dafür jeden Thread durch und läuft in die Zeitgrenze – zu heilen einmalig
 * im App-Review, nicht pro Kunde).
 *
 * Beide kosten bei jedem Rendering einen langsamen Fehlversuch, den graph()
 * obendrein wiederholt. Also: einmal gescheitert, für diesen Prozess
 * übersprungen. Ein Neustart – und jeder Deploy nach dem App-Review – probiert
 * von vorn.
 */
const closedEdges = new Map<string, string>();

// Beide kommen als "permission" aus mapGraphError – der Timeout ausdrücklich,
// siehe die Begründung dort.
const closedForever = (e: GraphError) => e.kind === "permission";

/**
 * Eine Edge, die ausfallen darf. Ein gesperrter DM-Zugriff oder ein
 * Graph-Aussetzer betrifft genau eine Edge – ohne diesen Fang reißt er über
 * Promise.all die übrigen Quellen desselben Kunden mit, und ein Kunde mit
 * gesperrten Instagram-DMs verlöre auch seine Facebook-Kommentare.
 */
async function edge<T>(key: string, call: () => Promise<{ data: T[] }>, failures: string[]): Promise<T[]> {
  const closed = closedEdges.get(key);
  if (closed) {
    failures.push(closed); // weiter gemeldet, nur nicht mehr erfragt.
    return [];
  }
  try {
    return (await call()).data;
  } catch (e) {
    const err = e as GraphError;
    if (closedForever(err)) closedEdges.set(key, err.message);
    failures.push(err.message);
    return [];
  }
}

/**
 * `parentId` ist nicht überall zu haben: Facebook liefert `parent` und meint
 * damit die tatsächlich beantwortete Nachricht, auch zwei Ebenen tief.
 * Instagram kennt kein solches Feld – dort hängt jede Antwort am obersten
 * Kommentar, und genau den setzt der Aufrufer als Rückfallwert.
 */
const toMessage = (
  threadId: string,
  r: RawReplyWithText,
  // Zwei Ids, wo Instagram im Spiel ist: die Seite handelt, aber unter einem
  // IG-Beitrag trägt unsere eigene Antwort die Id des IG-Kontos.
  selfId: string | string[],
  parentId?: string,
): Message => ({
  id: r.id,
  threadId,
  authorId: r.from?.id ?? "",
  authorName: r.from?.name ?? "Unknown",
  // Metas Bild-Adressen sind signiert und laufen ab; der nächste Abgleich
  // schreibt die frische darüber, und bis dahin fällt Avatar auf die
  // Initialen zurück.
  authorAvatar: r.from?.picture?.data?.url,
  text: r.message ?? "",
  fromSelf: typeof selfId === "string" ? r.from?.id === selfId : selfId.includes(r.from?.id ?? "\u0000"),
  createdAt: new Date(r.created_time).toISOString(),
  parentId,
});

// Verschachtelte Grenzen ausdrücklich: über 90 Tage antwortet Graph bei
// betriebsamen Seiten sonst mit "Please reduce the amount of data you're
// asking for" – und liefert dann gar nichts statt zu viel.
// ponytail: kein Paging, die ältesten Kommentare eines vollen Beitrags fehlen.
// Erst nachziehen, wenn im Posteingang tatsächlich Threads vermisst werden.
const EDGE_LIMIT = 25;
// `from{...picture{url}}` gibt es bei Facebook-Kommentaren, sonst nirgends:
// Instagram kennt zu einem Kommentar nur den Benutzernamen, und bei
// Messenger lässt Meta das Unterfeld stillschweigend weg (geprüft gegen die
// laufende API). Wo kein Bild kommt, zeigt Avatar die Initialen.
const FB_POST_FIELDS =
  "id,message,full_picture,permalink_url,comments.summary(false).limit(25){id,message,created_time,from{id,name,picture{url}},comments.limit(10){id,message,created_time,from{id,name,picture{url}},parent{id}}}";
const FB_CONVO_FIELDS = "id,updated_time,participants,messages.limit(25){id,message,created_time,from}";

export async function fetchFacebookSource(
  customer: Customer,
  page: { id: string },
  sinceIso: string,
): Promise<{ source: Source; messages: Message[]; failures: string[] }> {
  const since = Math.floor(Date.parse(sinceIso) / 1000);
  const failures: string[] = [];
  const [posts, conversations] = await Promise.all([
    edge(
      `${page.id}/posts`,
      () =>
        graph<{ data: RawPostWithReplyText[] }>(`${page.id}/posts`, {
          asPage: page.id,
          params: { fields: FB_POST_FIELDS, since, limit: EDGE_LIMIT },
        }),
      failures,
    ),
    edge(
      `${page.id}/conversations`,
      () =>
        graph<{ data: RawConversation[] }>(`${page.id}/conversations`, {
          asPage: page.id,
          params: { fields: FB_CONVO_FIELDS, limit: EDGE_LIMIT },
        }),
      failures,
    ),
  ]);

  const recentConvos = conversations.filter((c) => Date.parse(c.updated_time) >= Date.parse(sinceIso));
  // Kommentare bringen ihr Bild selbst mit; in Unterhaltungen fehlt es und
  // muss nachgeschlagen werden, bevor daraus Zeilen werden.
  dmBilderEintragen(recentConvos, await dmAvatars(page.id, dmGegenueber(recentConvos, [page.id]), failures));

  const messages: Message[] = [];
  for (const post of posts)
    for (const c of post.comments?.data ?? []) {
      // Der Kommentar selbst ist die erste Nachricht des Threads, nicht nur seine Antworten.
      messages.push(toMessage(c.id, c, page.id));
      for (const r of c.comments?.data ?? []) messages.push(toMessage(c.id, r, page.id, r.parent?.id ?? c.id));
    }
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
      posts,
      conversations: recentConvos,
    },
    messages,
    failures,
  };
}

// Nur die Ids: was unter dem Beitrag steht, holt der zweite Schritt.
const IG_MEDIA_FIELDS = "id,caption,media_url,thumbnail_url,permalink,comments.limit(25){id}";
/**
 * Als Unterfeld von media lässt Meta bei Kommentaren `from{id}` und
 * `parent_id` stillschweigend weg – der Benutzername kommt an, sonst nichts
 * (geprüft gegen die laufende API, unter jedem Namen den die Doku kennt).
 * Über die comments-Edge desselben Beitrags kommen beide. Ohne from.id wäre
 * keine Antwort des Kunden als seine erkennbar (jeder IG-Thread stünde ewig
 * offen), ohne parent_id gäbe es bei Instagram keinen Antwortbaum.
 */
const IG_COMMENT_FIELDS =
  "id,text,timestamp,from{id,username},parent_id,replies.limit(10){id,text,timestamp,from{id,username},parent_id}";
// IG-DMs laufen über dieselbe Conversations-API wie Messenger, nur mit
// platform=instagram – deshalb hier dieselben Feldnamen wie bei Facebook,
// anders als bei Kommentaren (dort ist media/comments eine eigene, ältere
// IG-Edge mit eigenen Feldnamen: text/timestamp statt message/created_time).
const IG_CONVO_FIELDS = FB_CONVO_FIELDS;

type RawIgComment = { id: string; text?: string; timestamp: string; from?: { id: string; username?: string }; parent_id?: string; replies?: { data: RawIgComment[] } };
type RawIgMedia = { id: string; caption?: string; media_url?: string; thumbnail_url?: string; permalink?: string; comments?: { data: { id: string }[] } };

/** Metas IG-Form auf die FB-Feldnamen, mit den nachgeschlagenen Bildern. */
const igToRawPost = (m: RawIgMedia, comments: RawIgComment[], bilder: Map<string, string>): RawPostWithReplyText => {
  const von = (f?: { id: string; username?: string }): RawFrom | undefined => {
    if (!f) return undefined;
    const url = bilder.get(f.username ?? f.id);
    return { id: f.id, name: f.username, picture: url ? { data: { url } } : undefined };
  };
  return ({
  id: m.id,
  message: m.caption,
  // Bei Videos ist media_url die Videodatei selbst; thumbnail_url ist das
  // Standbild, das die Liste als Vorschau braucht.
  full_picture: m.thumbnail_url ?? m.media_url,
  permalink_url: m.permalink,
  comments: {
    data: comments.map((c) => ({
      id: c.id,
      message: c.text,
      created_time: c.timestamp,
      from: von(c.from),
      comments: {
        data: (c.replies?.data ?? []).map((r) => ({
          id: r.id,
          message: r.text,
          created_time: r.timestamp,
          from: von(r.from),
          // Antwort auf eine Antwort: parent_id zeigt dann auf die Antwort,
          // nicht auf den obersten Kommentar.
          parent: r.parent_id ? { id: r.parent_id } : undefined,
        })),
      },
    })),
  },
});
};

/**
 * Die Bilder der DM-Gegenüber tragen wir dort nach, wo normalize() sie bei
 * Kommentaren ohnehin erwartet – Meta schickt sie in Unterhaltungen nicht mit.
 */
function dmBilderEintragen(convos: RawConversation[], bilder: Map<string, string>): void {
  for (const c of convos) {
    for (const p of c.participants?.data ?? []) {
      const url = bilder.get(p.id);
      if (url) p.picture = { data: { url } };
    }
    for (const m of c.messages?.data ?? []) {
      const url = m.from ? bilder.get(m.from.id) : undefined;
      if (url && m.from) m.from.picture = { data: { url } };
    }
  }
}

/** Wer in diesen Unterhaltungen ein Bild bekommen soll: alle außer uns. */
const dmGegenueber = (convos: RawConversation[], wir: string[]): string[] =>
  [
    ...new Set(
      convos.flatMap((c) => [
        ...(c.participants?.data ?? []).map((p) => p.id),
        ...(c.messages?.data ?? []).map((m) => m.from?.id ?? ""),
      ]),
    ),
  ].filter((id) => id && !wir.includes(id));

export async function fetchInstagramSource(
  customer: Customer,
  page: { id: string; instagram: { id: string } },
  sinceIso: string,
): Promise<{ source: Source; messages: Message[]; failures: string[] }> {
  const since = Math.floor(Date.parse(sinceIso) / 1000);
  const failures: string[] = [];
  const [media, conversations] = await Promise.all([
    edge(
      `${page.instagram.id}/media`,
      () =>
        graph<{ data: RawIgMedia[] }>(`${page.instagram.id}/media`, {
          asPage: page.id, // IG hat kein eigenes Token – es reitet auf dem der verknüpften Seite.
          params: { fields: IG_MEDIA_FIELDS, since, limit: EDGE_LIMIT },
        }),
      failures,
    ),
    // Die Edge, an der beide dauerhaften Fehler hängen (siehe closedEdges).
    // Die Kommentare oben bleiben davon unberührt.
    edge(
      `${page.id}/conversations?instagram`,
      () =>
        graph<{ data: RawConversation[] }>(`${page.id}/conversations`, {
          asPage: page.id,
          params: { fields: IG_CONVO_FIELDS, platform: "instagram", limit: EDGE_LIMIT },
        }),
      failures,
    ),
  ]);

  // Zweiter Schritt: die Kommentare je Beitrag über ihre eigene Edge, gebündelt
  // in einem POST. Beiträge ohne Kommentar fragen wir gar nicht erst.
  const mitKommentaren = media.filter((m) => (m.comments?.data.length ?? 0) > 0);
  const kommentare = new Map<string, RawIgComment[]>();
  if (mitKommentaren.length > 0) {
    try {
      const settled = await batch<{ data: RawIgComment[] }>(
        mitKommentaren.map((m) => ({
          relative_url: `${m.id}/comments?fields=${encodeURIComponent(IG_COMMENT_FIELDS)}&limit=${EDGE_LIMIT}`,
        })),
        { asPage: page.id },
      );
      settled.forEach((r, i) => {
        if (r.status === "fulfilled") kommentare.set(mitKommentaren[i].id, r.value?.data ?? []);
        else failures.push((r.reason as GraphError).message);
      });
    } catch (e) {
      failures.push((e as GraphError).message);
    }
  }

  // Alle, die unter den Beiträgen sprechen – Kommentare wie Antworten.
  const personen = [...kommentare.values()]
    .flat()
    .flatMap((c) => [c.from, ...(c.replies?.data ?? []).map((r) => r.from)])
    .filter((f): f is { id: string; username?: string } => !!f && f.id !== page.instagram.id);
  const bilder = await igAvatars({ pageId: page.id, igUserId: page.instagram.id }, personen, failures);

  const posts = media.map((m) => igToRawPost(m, kommentare.get(m.id) ?? [], bilder));
  // Unter einem IG-Beitrag sind "wir" das IG-Konto, nicht die Seite – in den
  // Unterhaltungen ebenso. Beide Ids gelten, damit keine der zwei Formen
  // durchfällt.
  const wir = [page.id, page.instagram.id];
  const messages: Message[] = [];
  for (const post of posts)
    for (const c of post.comments?.data ?? []) {
      messages.push(toMessage(c.id, c, wir));
      for (const r of c.comments?.data ?? []) messages.push(toMessage(c.id, r, wir, r.parent?.id ?? c.id));
    }
  const recentConvos = conversations.filter((c) => Date.parse(c.updated_time) >= Date.parse(sinceIso));
  dmBilderEintragen(recentConvos, await dmAvatars(page.id, dmGegenueber(recentConvos, wir), failures));
  for (const convo of recentConvos)
    for (const m of convo.messages?.data ?? []) messages.push(toMessage(convo.id, m, wir));
  // Kein globales Sortieren: siehe Begründung bei fetchFacebookSource oben.

  return {
    source: {
      customerId: customer.id,
      channel: "instagram",
      selfId: page.id,
      selfAuthorId: page.instagram.id,
      posts: posts as unknown as RawPost[],
      conversations: recentConvos,
    },
    messages,
    failures,
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
      authorAvatar: item.author.avatar,
      contextLabel: item.context?.label,
      contextThumbnail: item.context?.thumbnail,
      contextPermalink: item.context?.permalink,
      contextAdId: item.context?.adId,
      postId: item.postId,
      answered: item.answered,
      lastMessageAt: item.createdAt,
      expiresAt: item.expiresAt,
      updatedAt: new Date().toISOString(),
    });
  for (const m of messages) insertMessage(db, m);
}

/** Gibt die Meldungen der ausgefallenen Edges zurück; was ankam, ist trotzdem gespeichert. */
export async function reconcileCustomer(db: Database, customer: Customer, sinceIso: string): Promise<string[]> {
  const page = customer.page;
  if (!page) return []; // kein Auftritt, kein Posteingang – z. B. reine Zahlkonten.

  const [fb, ig] = await Promise.all([
    fetchFacebookSource(customer, { id: page.id }, sinceIso),
    customer.instagram ? fetchInstagramSource(customer, { id: page.id, instagram: customer.instagram }, sinceIso) : undefined,
  ]);
  store(db, fb.source, fb.messages);
  if (ig) store(db, ig.source, ig.messages);
  return [...fb.failures, ...(ig?.failures ?? [])];
}

/** Auslöser für app/layout.tsx. Läuft für jeden Kunden mit Seite; einer scheitert nie für alle. */
export async function reconcile(db: Database, customers: Customer[]): Promise<{ ok: number; failed: { customerId: string; message: string }[] }> {
  const since = reconcileWindow();
  const targets = customers.filter((c) => c.page);
  const settled = await Promise.allSettled(targets.map((c) => reconcileCustomer(db, c, since)));

  const failed: { customerId: string; message: string }[] = [];
  let ok = 0;
  settled.forEach((r, i) => {
    // Ein toter Seiten-Token lässt jede Edge desselben Kunden mit derselben
    // Meldung ausfallen – gemeldet wird sie einmal, nicht viermal.
    const messages = r.status === "fulfilled" ? new Set(r.value) : new Set([(r.reason as GraphError).message]);
    if (messages.size === 0) ok++;
    else for (const message of messages) failed.push({ customerId: targets[i].id, message });
  });
  return { ok, failed };
}

export type WebhookEntry = {
  id: string; // Page- oder IG-Business-Id, je nach Objekt-Typ des Webhooks
  changes?: { field: string; value: { item?: string; verb?: string; comment_id?: string; id?: string; post_id?: string; media?: { id: string }; parent_id?: string } }[];
  messaging?: { sender: { id: string }; recipient: { id: string }; timestamp: number; message?: { mid: string; text?: string } }[];
};

const FB_COMMENT_FIELDS =
  "id,message,created_time,from{id,name,picture{url}},parent{id},comments{id,message,created_time,from{id,name,picture{url}}}";
const FB_POST_MINI_FIELDS = "id,message,full_picture";

/** Der eine nachgeholte Kommentar, mit demselben Feldsatz wie in reconcile() – siehe Modulkommentar oben. */
type RawFetchedComment = { id: string; message?: string; created_time: string; from?: RawFrom; parent?: { id: string }; comments?: { data: RawReplyWithText[] } };

async function ingestComment(db: Database, pageId: string, customer: Customer, commentId: string, postId: string, threadId: string): Promise<void> {
  const [comment, post] = await Promise.all([
    graph<RawFetchedComment>(commentId, { asPage: pageId, params: { fields: FB_COMMENT_FIELDS } }),
    graph<{ id: string; message?: string; full_picture?: string }>(postId, { asPage: pageId, params: { fields: FB_POST_MINI_FIELDS } }).catch(() => ({ id: postId, message: undefined, full_picture: undefined })),
  ]);

  const istInstagram = !!customer.instagram && postId.startsWith(customer.instagram.id);
  const source: Source = {
    customerId: customer.id,
    channel: istInstagram ? "instagram" : "facebook",
    selfId: pageId,
    selfAuthorId: istInstagram ? customer.instagram!.id : undefined,
    posts: threadId === commentId
      ? [{ id: postId, message: post.message, full_picture: post.full_picture, comments: { data: [comment] } }]
      : [],
    conversations: [],
  };

  // Bei Facebook bringt der Kommentar sein Bild mit; bei Instagram nicht –
  // derselbe Weg wie im Abgleich, nur für diesen einen Menschen.
  if (istInstagram && comment.from) {
    const bilder = await igAvatars(
      { pageId, igUserId: customer.instagram!.id },
      [{ id: comment.from.id, username: comment.from.name }],
      [],
    );
    const url = bilder.get(comment.from.name ?? comment.from.id);
    if (url) comment.from.picture = { data: { url } };
  }
  const wir = istInstagram ? [pageId, customer.instagram!.id] : pageId;
  if (threadId === commentId) {
    store(db, source, [toMessage(commentId, comment, wir)]);
  } else {
    // Antwort auf einen bestehenden Thread: kein neuer Thread, nur eine
    // weitere Nachricht plus "beantwortet", wenn wir selbst geschrieben haben.
    const reply = toMessage(threadId, comment, wir, comment.parent?.id ?? threadId);
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
  const bild = (await dmAvatars(pageId, [senderId], [])).get(senderId);

  const source: Source = {
    customerId: customer.id,
    channel: "facebook",
    selfId: pageId,
    posts: [],
    conversations: [
      {
        ...convo,
        participants: { data: (convo.participants?.data ?? []).map((p) => (p.id === senderId && bild ? { ...p, picture: { data: { url: bild } } } : p)) },
        messages: { data: [{ id: mid, message: text, created_time: createdAt, from: { id: senderId, name: other?.name, picture: bild ? { data: { url: bild } } : undefined } }] },
      },
    ],
  };
  store(db, source, [{ id: mid, threadId: convo.id, authorId: senderId, authorName: other?.name ?? "Unknown", authorAvatar: bild, text, fromSelf, createdAt }]);
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
