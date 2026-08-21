/**
 * Der Schreibweg: Meta bleibt System of Record. Der Speicher erfährt vom
 * Erfolg erst danach (app/inbox/actions.ts) – ein hier hängengebliebener
 * Fehler darf keine Nachricht vortäuschen, die nie ankam.
 */
import { graph, GraphError } from "./graph";
import { isExpired, type Channel } from "./inbox";

export type ReplyTarget = {
  kind: "comment" | "dm";
  channel: Channel;
  /** Seiten- bzw. IG-Konto-Id, mit deren Token geantwortet wird. */
  selfId: string;
  /** Kommentar-Id bei "comment", Autor-Id des Gegenübers bei "dm". */
  targetId: string;
  /** Nur DMs. */
  expiresAt?: string;
};

export async function sendReply(target: ReplyTarget, text: string): Promise<{ id: string }> {
  if (target.kind === "dm" && isExpired({ expiresAt: target.expiresAt }))
    throw new GraphError({
      kind: "permission",
      message: "Das 24-Stunden-Fenster für diese Unterhaltung ist abgelaufen – Meta nimmt keine Antwort mehr an.",
      retryable: false,
    });

  if (target.kind === "comment") {
    const path = target.channel === "facebook" ? `${target.targetId}/comments` : `${target.targetId}/replies`;
    const { id } = await graph<{ id: string }>(path, { method: "POST", asPage: target.selfId, params: { message: text } });
    return { id };
  }

  // Exakter IG-Messaging-Endpunkt: siehe Spec-Hinweis, gegen aktuelle Graph-
  // Docs prüfen, falls Meta ihn seit Verfassen dieses Plans verschoben hat.
  const path = target.channel === "facebook" ? "me/messages" : `${target.selfId}/messages`;
  const { message_id } = await graph<{ message_id: string; recipient_id: string }>(path, {
    method: "POST",
    asPage: target.selfId,
    params: { recipient: { id: target.targetId }, message: { text } },
  });
  return { id: message_id };
}
