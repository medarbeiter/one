/**
 * Vier Graph-Formen (FB-Kommentare, IG-Kommentare, Messenger, IG-DMs) werden
 * hier zu einem Typ. Alles danach – Liste, Filter, Sortierung, Badge, Uhr –
 * kennt nur noch InboxItem.
 */

export type Channel = "facebook" | "instagram";

export type InboxItem = {
  id: string;
  kind: "comment" | "dm";
  channel: Channel;
  customerId: string;
  author: { id: string; name: string; avatar?: string };
  text: string;
  createdAt: string;
  context?: { label: string; thumbnail?: string; adId?: string };
  /** Nur DMs: createdAt + 24h. Danach nimmt Meta keine Antwort mehr an. */
  expiresAt?: string;
  /** Abgeleitet: hat die Seite in diesem Thread geantwortet? */
  answered: boolean;
  /** Nur Kommentare: der Beitrag, unter dem sie stehen – Basis für die Anzeigen-Zuordnung. */
  postId?: string;
};

export type RawComment = {
  id: string;
  message?: string;
  created_time: string;
  from?: { id: string; name?: string };
  comments?: { data: { from?: { id: string }; created_time: string }[] };
};

export type RawPost = {
  id: string;
  message?: string;
  full_picture?: string;
  comments?: { data: RawComment[] };
};

export type RawConversation = {
  id: string;
  updated_time: string;
  unread_count?: number;
  participants?: { data: { id: string; name?: string }[] };
  messages?: {
    data: { id: string; message?: string; created_time: string; from?: { id: string; name?: string } }[];
  };
};

export type Source = {
  customerId: string;
  channel: Channel;
  /** Seiten- bzw. IG-Konto-ID – "wir" in jedem Thread. */
  selfId: string;
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
    for (const post of s.posts) {
      for (const c of post.comments?.data ?? []) {
        items.push({
          id: c.id,
          kind: "comment",
          channel: s.channel,
          customerId: s.customerId,
          author: { id: c.from?.id ?? "", name: c.from?.name ?? "Unknown" },
          text: c.message ?? "",
          createdAt: new Date(c.created_time).toISOString(),
          context: { label: label(post.message), thumbnail: post.full_picture },
          // Kein Graph-Feld für "erledigt" – deshalb abgeleitet aus den Antworten.
          answered: (c.comments?.data ?? []).some((r) => r.from?.id === s.selfId),
          postId: post.id,
        });
      }
    }

    for (const t of s.conversations) {
      const last = t.messages?.data?.[0];
      const other = (t.participants?.data ?? []).find((p) => p.id !== s.selfId);
      const created = new Date(last?.created_time ?? t.updated_time).toISOString();
      items.push({
        id: t.id,
        kind: "dm",
        channel: s.channel,
        customerId: s.customerId,
        author: { id: other?.id ?? "", name: other?.name ?? "Unknown" },
        text: last?.message ?? "",
        createdAt: created,
        expiresAt: expiresAt(created),
        answered: last?.from?.id === s.selfId,
      });
    }
  }

  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
