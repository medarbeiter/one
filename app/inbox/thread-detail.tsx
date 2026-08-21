import { Avatar, Banner } from "@/app/shell/ui";
import { isExpired } from "@/lib/inbox";
import { listMessages, openDb, type Thread } from "@/lib/inbox-store";
import { relativeTime } from "./relative-time";
import { Composer } from "./composer";

export function ThreadDetail({ thread }: { thread: Thread }) {
  const messages = listMessages(openDb(), thread.id);
  const expired = thread.kind === "dm" && isExpired(thread);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink-100 p-3">
        <Avatar name={thread.authorName} src={thread.authorAvatar} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink-900">{thread.authorName}</div>
          {thread.contextLabel && (
            <div className="truncate text-xs text-ink-500">{thread.contextLabel}</div>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[75%] rounded-lg p-2.5 text-sm ${
              m.fromSelf ? "ml-auto bg-[var(--color-text-accent)] text-white" : "bg-ink-50 text-ink-900"
            }`}
          >
            <div>{m.text}</div>
            <div className={`mt-1 text-[11px] ${m.fromSelf ? "text-white/70" : "text-ink-400"}`}>
              {relativeTime(m.createdAt)}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-ink-100 p-3">
        {expired ? (
          <Banner
            status="info"
            title="Antwort nicht mehr möglich"
            description="Das 24-Stunden-Fenster für diese Unterhaltung ist abgelaufen – Meta nimmt keine Antwort mehr an."
          />
        ) : (
          <Composer threadId={thread.id} />
        )}
      </div>
    </div>
  );
}
