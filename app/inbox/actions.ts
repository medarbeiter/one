"use server";

import { deleteThread, getThread, recordSentMessage, setMessageLiked, setThreadRead, openDb } from "@/lib/inbox-store";
import { sendReply } from "@/lib/inbox-send";
import { blockAuthor, deleteComment, setLike, type ModerationTarget } from "@/lib/inbox-moderate";

export type ReplyResult = { ok?: string; error?: string };

const NICHT_GEFUNDEN = "Dieser Thread wurde nicht gefunden – vielleicht ist er inzwischen gelöscht.";

export async function replyAction(threadId: string, text: string): Promise<ReplyResult> {
  if (!text.trim()) return { error: "Die Antwort darf nicht leer sein." };
  const db = openDb();
  const thread = getThread(db, threadId);
  if (!thread) return { error: NICHT_GEFUNDEN };

  try {
    const { id } = await sendReply(
      {
        kind: thread.kind,
        channel: thread.channel,
        selfId: thread.selfId,
        targetId: thread.kind === "comment" ? threadId : thread.authorId,
        expiresAt: thread.expiresAt,
      },
      text,
    );
    recordSentMessage(db, {
      id,
      threadId,
      authorId: thread.selfId,
      authorName: "Wir",
      text,
      fromSelf: true,
      createdAt: new Date().toISOString(),
    });
    return { ok: "Antwort gesendet." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const target = (t: NonNullable<ReturnType<typeof getThread>>): ModerationTarget => ({
  kind: t.kind,
  channel: t.channel,
  selfId: t.selfId,
  threadId: t.id,
  authorId: t.authorId,
});

/**
 * Bei Meta gelöscht, dann hier. Andersherum bliebe eine Liste zurück, die
 * behauptet, der Kommentar sei weg, während er unter dem Beitrag steht.
 */
export async function deleteCommentAction(threadId: string): Promise<ReplyResult> {
  const db = openDb();
  const thread = getThread(db, threadId);
  if (!thread) return { error: NICHT_GEFUNDEN };

  try {
    await deleteComment(target(thread));
    deleteThread(db, threadId);
    return { ok: "Kommentar gelöscht." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Blockieren lässt den bestehenden Thread stehen: der Kommentar ist weiterhin
 * unter dem Beitrag zu sehen, nur schreiben kann die Person nichts Neues mehr.
 */
export async function blockAuthorAction(threadId: string): Promise<ReplyResult> {
  const db = openDb();
  const thread = getThread(db, threadId);
  if (!thread) return { error: NICHT_GEFUNDEN };

  try {
    await blockAuthor(target(thread));
    return { ok: `${thread.authorName} blockiert.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Der Schnellzugriff aus der Liste: ein Like braucht kein Öffnen, keine
 * Rückfrage und keinen zweiten Klick – zurücknehmen ist derselbe Knopf.
 */
export async function likeAction(threadId: string, messageId: string, on: boolean): Promise<ReplyResult> {
  const db = openDb();
  const thread = getThread(db, threadId);
  if (!thread) return { error: NICHT_GEFUNDEN };

  try {
    await setLike(target(thread), messageId, on);
    setMessageLiked(db, messageId, on);
    return { ok: on ? "Geliked." : "Like zurückgenommen." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Die einzige Markierung, die nur uns gehört: Meta erfährt davon nichts, und
 * sie hält nur bis zur nächsten Nachricht in diesem Thread – danach ist die
 * Zeile wieder ungelesen, weil wieder etwas Ungelesenes darin steht.
 */
export async function markReadAction(threadId: string, read: boolean): Promise<ReplyResult> {
  const db = openDb();
  if (!getThread(db, threadId)) return { error: NICHT_GEFUNDEN };
  setThreadRead(db, threadId, read);
  return { ok: read ? "Als gelesen markiert." : "Als ungelesen markiert." };
}
