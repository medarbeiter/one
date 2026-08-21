/**
 * Vier Graph-Formen (FB-Kommentare, IG-Kommentare, Messenger, IG-DMs) werden
 * hier zu einem Typ. Alles danach – Liste, Filter, Sortierung, Badge, Uhr –
 * kennt nur noch InboxItem.
 */
import { batch } from "./graph";
import type { Customer } from "./customers";

export type Channel = "facebook" | "instagram";

export type InboxItem = {
  id: string;
  kind: "comment" | "dm";
  channel: Channel;
  customerId: string;
  author: { id: string; name: string; avatar?: string };
  text: string;
  createdAt: string;
  context?: { label: string; thumbnail?: string; adId?: string; permalink?: string };
  /** Nur DMs: createdAt + 24h. Danach nimmt Meta keine Antwort mehr an. */
  expiresAt?: string;
  /** Abgeleitet: hat die Seite in diesem Thread geantwortet? */
  answered: boolean;
  /** Nur Kommentare: der Beitrag, unter dem sie stehen – Basis für die Anzeigen-Zuordnung. */
  postId?: string;
};

/** Metas Bild-Unterfeld – bei Facebook-Kommentaren zu haben, bei IG und Messenger nicht (siehe inbox-ingest.ts). */
export type RawFrom = { id: string; name?: string; picture?: { data?: { url?: string } } };

export type RawComment = {
  id: string;
  message?: string;
  created_time: string;
  from?: RawFrom;
  comments?: { data: { from?: { id: string }; created_time: string }[] };
};

export type RawPost = {
  id: string;
  message?: string;
  full_picture?: string;
  /** Der Beitrag bei Meta selbst. IG liefert ihn als `permalink`, FB als `permalink_url`. */
  permalink_url?: string;
  comments?: { data: RawComment[] };
};

export type RawConversation = {
  id: string;
  updated_time: string;
  unread_count?: number;
  // picture kommt nicht von Meta mit, sondern wird in inbox-ingest.ts
  // nachgetragen (lib/avatars.ts) – normalize() liest es wie bei Kommentaren.
  participants?: { data: RawFrom[] };
  messages?: { data: { id: string; message?: string; created_time: string; from?: RawFrom }[] };
};

export type Source = {
  customerId: string;
  channel: Channel;
  /** Die Seite, mit deren Token gehandelt wird – auch bei Instagram. */
  selfId: string;
  /**
   * Wer "wir" in den Inhalten sind, wenn das nicht die Seite ist: unter einem
   * Instagram-Beitrag trägt die eigene Antwort die Id des IG-Kontos, nicht die
   * der verknüpften Seite. Ohne diese zweite Id gälte jede eigene
   * IG-Antwort als fremd – und der Thread ewig als unbeantwortet.
   */
  selfAuthorId?: string;
  posts: RawPost[];
  conversations: RawConversation[];
};

const DAY = 24 * 60 * 60 * 1000;

export const expiresAt = (createdAt: string) =>
  new Date(Date.parse(createdAt) + DAY).toISOString();

export const isExpired = (item: Pick<InboxItem, "expiresAt">, now = Date.now()) =>
  item.expiresAt !== undefined && Date.parse(item.expiresAt) <= now;

const label = (s?: string) =>
  !s ? "Post" : s.length > 60 ? `${s.slice(0, 57)}…` : s;

export function normalize(sources: Source[]): InboxItem[] {
  const items: InboxItem[] = [];

  for (const s of sources) {
    const istWir = (id?: string) => id !== undefined && (id === s.selfId || id === s.selfAuthorId);
    for (const post of s.posts) {
      for (const c of post.comments?.data ?? []) {
        items.push({
          id: c.id,
          kind: "comment",
          channel: s.channel,
          customerId: s.customerId,
          author: { id: c.from?.id ?? "", name: c.from?.name ?? "Unknown", avatar: c.from?.picture?.data?.url },
          text: c.message ?? "",
          createdAt: new Date(c.created_time).toISOString(),
          context: { label: label(post.message), thumbnail: post.full_picture, permalink: post.permalink_url },
          // Kein Graph-Feld für "erledigt" – deshalb abgeleitet aus den Antworten.
          answered: (c.comments?.data ?? []).some((r) => istWir(r.from?.id)),
          postId: post.id,
        });
      }
    }

    for (const t of s.conversations) {
      const last = t.messages?.data?.[0];
      const other = (t.participants?.data ?? []).find((p) => !istWir(p.id));
      const created = new Date(last?.created_time ?? t.updated_time).toISOString();
      items.push({
        id: t.id,
        kind: "dm",
        channel: s.channel,
        customerId: s.customerId,
        author: { id: other?.id ?? "", name: other?.name ?? "Unknown", avatar: other?.picture?.data?.url },
        text: last?.message ?? "",
        createdAt: created,
        expiresAt: expiresAt(created),
        answered: istWir(last?.from?.id),
      });
    }
  }

  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Kommentare hängen am Beitrag; die Anzeige dahinter steht nur im Creative. */
export async function adPostMap(customers: Customer[]) {
  const accounts = customers.flatMap((c) => c.adAccounts.map((a) => a.id));
  const settled = await batch<{ data: { id: string; name: string; creative?: { effective_object_story_id?: string } }[] }>(
    accounts.map((a) => ({
      relative_url: `${a}/ads?fields=name,creative{effective_object_story_id}&limit=200&effective_status=["ACTIVE","PAUSED"]`,
    })),
    // Anzeigen ändern sich selten – eine Stunde reicht und spart 18 Aufrufe je Seitenaufruf.
    { revalidate: 3600, tags: ["ads"] },
  );

  const map = new Map<string, { adId: string; name: string }>();
  for (const r of settled) {
    if (r.status === "rejected") continue;
    for (const ad of r.value.data ?? []) {
      const post = ad.creative?.effective_object_story_id;
      if (post) map.set(post, { adId: ad.id, name: ad.name });
    }
  }
  return map;
}

export function attachAds(
  items: InboxItem[],
  map: Map<string, { adId: string; name: string }>,
): InboxItem[] {
  return items.map((i) => {
    const hit = i.postId ? map.get(i.postId) : undefined;
    if (!hit || !i.context) return i;
    return { ...i, context: { ...i.context, adId: hit.adId, label: hit.name } };
  });
}
