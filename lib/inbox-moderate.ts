/**
 * Die Handgriffe neben der Antwort: liken, einen Kommentar löschen, eine
 * Person blockieren. Wie inbox-send.ts läuft alles zuerst gegen Meta – der
 * lokale Speicher zieht erst nach, wenn es dort geklappt hat
 * (app/inbox/actions.ts).
 */
import { graph, GraphError } from "./graph";
import type { Channel } from "./inbox";

export type ModerationTarget = {
  kind: "comment" | "dm";
  channel: Channel;
  /** Seiten-Id, mit deren Token gehandelt wird – bei IG die der verknüpften Seite. */
  selfId: string;
  /** Kommentar-Id bzw. Unterhaltungs-Id. */
  threadId: string;
  /** Die Person auf der anderen Seite. */
  authorId: string;
};

/**
 * DELETE auf die Kommentar-Id, für Facebook wie Instagram derselbe Aufruf.
 * Nachrichten kennen kein Löschen – eine gesendete DM nimmt Meta nicht zurück,
 * und ein "Löschen", das nur unsere Liste aufräumt, wäre eine Behauptung.
 */
export async function deleteComment(target: ModerationTarget): Promise<void> {
  if (target.kind !== "comment")
    throw new GraphError({
      kind: "permission",
      message: "Nachrichten lassen sich nicht löschen – nur Kommentare.",
      retryable: false,
    });
  await graph(target.threadId, { method: "DELETE", asPage: target.selfId });
}

/**
 * Blockieren heißt bei Meta: die Person darf auf dieser Seite nicht mehr
 * kommentieren oder schreiben. Ihre bestehenden Kommentare verschwinden davon
 * nicht – dafür ist deleteComment() da.
 *
 * Nur für Facebook. Die Graph API kennt für Instagram keine Entsprechung: dort
 * blockiert man aus der Instagram-App heraus, und ein stiller Fehlschlag wäre
 * schlimmer als ein ausgegrauter Knopf mit Begründung – geblockt geglaubt ist
 * nicht geblockt.
 */
export const blockHint = (channel: Channel) =>
  channel === "instagram"
    ? "Instagram kennt dafür keine Schnittstelle – blockieren lässt sich diese Person nur in der Instagram-App des Kunden."
    : undefined;

export async function blockAuthor(target: ModerationTarget): Promise<void> {
  const hint = blockHint(target.channel);
  if (hint) throw new GraphError({ kind: "permission", message: hint, retryable: false });
  if (!target.authorId)
    throw new GraphError({
      kind: "unknown",
      message: "Zu dieser Unterhaltung ist keine Personen-Id gespeichert.",
      retryable: false,
    });

  // Antwort ist eine Karte Id → Erfolg; ein false darin ist kein HTTP-Fehler
  // und käme sonst als Erfolg durch.
  const res = await graph<Record<string, boolean>>(`${target.selfId}/blocked`, {
    method: "POST",
    asPage: target.selfId,
    params: { user_ids: [target.authorId] },
  });
  if (res?.[target.authorId] === false)
    throw new GraphError({
      kind: "unknown",
      message: "Meta hat das Blockieren abgelehnt.",
      retryable: false,
    });
}

/**
 * Liken kann Metas API nur über Kreuz, und zwar genau andersherum, als man
 * es erwartet:
 *
 * - Facebook-Kommentar: `POST /{comment-id}/likes`, DELETE nimmt es zurück.
 * - Instagram-DM: eine Reaktion („love") auf eine einzelne Nachricht.
 * - Instagram-Kommentar und Messenger-Nachricht: nichts. Für IG-Kommentare
 *   gibt es keine Like-Edge, für Messenger sind Reaktionen nur zu empfangen,
 *   nicht zu senden.
 *
 * Die beiden Lücken sind Metas, nicht unsere – deshalb ein ausgegrauter Knopf
 * mit Grund statt eines Herzens, das nichts tut. Vor größeren Umbauten gegen
 * die aktuellen Graph-Docs prüfen; hier bewegt Meta erfahrungsgemäß am meisten.
 */
export const likeHint = (kind: "comment" | "dm", channel: Channel): string | undefined => {
  if (kind === "comment")
    return channel === "instagram"
      ? "Instagram-Kommentare lassen sich über die API nicht liken – nur in der Instagram-App des Kunden."
      : undefined;
  return channel === "facebook"
    ? "Messenger-Nachrichten lassen sich über die API nicht liken – Reaktionen kommen dort nur herein."
    : undefined;
};

export async function setLike(
  target: ModerationTarget,
  messageId: string,
  on: boolean,
): Promise<void> {
  const hint = likeHint(target.kind, target.channel);
  if (hint) throw new GraphError({ kind: "permission", message: hint, retryable: false });

  if (target.kind === "comment") {
    await graph(`${messageId}/likes`, { method: on ? "POST" : "DELETE", asPage: target.selfId });
    return;
  }

  await graph(`${target.selfId}/messages`, {
    method: "POST",
    asPage: target.selfId,
    params: {
      recipient: { id: target.authorId },
      sender_action: on ? "react" : "unreact",
      payload: on ? { message_id: messageId, reaction: "love" } : { message_id: messageId },
    },
  });
}
