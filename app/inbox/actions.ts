"use server";

import { getThread, recordSentMessage, openDb } from "@/lib/inbox-store";
import { sendReply } from "@/lib/inbox-send";

export type ReplyResult = { ok?: string; error?: string };

export async function replyAction(threadId: string, text: string): Promise<ReplyResult> {
  if (!text.trim()) return { error: "Die Antwort darf nicht leer sein." };
  const db = openDb();
  const thread = getThread(db, threadId);
  if (!thread) return { error: "Dieser Thread wurde nicht gefunden – vielleicht ist er inzwischen gelöscht." };

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
