import Link from "next/link";
import { Avatar, Badge, Banner } from "@/app/shell/ui";
import { isExpired } from "@/lib/inbox";
import { blockHint, likeHint } from "@/lib/inbox-moderate";
import { listMessages, openDb, type Thread } from "@/lib/inbox-store";
import { Sign } from "@/theme/icons";
import { relativeTime } from "./relative-time";
import { Composer } from "./composer";
import { LikeButton, ThreadActions } from "./moderation";

const KANAL = { facebook: "Facebook", instagram: "Instagram" } as const;

export function ThreadDetail({ thread, customerName }: { thread: Thread; customerName: string }) {
  const messages = listMessages(openDb(), thread.id);
  // Wer auf wen geantwortet hat, steht als Id in der Nachricht – der Name
  // dazu nur hier, in derselben Liste.
  const nachId = new Map(messages.map((m) => [m.id, m]));
  const expired = thread.kind === "dm" && isExpired(thread);
  const hint = likeHint(thread.kind, thread.channel);

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
          <Avatar name={thread.authorName} src={thread.authorAvatar} size="md" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink-900">{thread.authorName}</div>
            {/* An wen ging das? Bei 200 Kunden ist die Antwort nie selbstverständlich –
                und in der ungefilterten Liste steht der Kunde nirgends sonst. */}
            <div className="flex items-center gap-1.5 text-xs text-ink-500">
              <Sign meaning={thread.channel} size={12} />
              <span className="truncate">
                {KANAL[thread.channel]} · {thread.kind === "dm" ? "Nachricht" : "Kommentar"} an{" "}
                <span className="font-medium text-ink-700">{customerName}</span>
              </span>
            </div>
          </div>
          {/* key: die Knöpfe halten ihren Zustand selbst (gelesen, geliked) –
              ohne ihn nähme der nächste Thread den des vorigen mit. */}
          <ThreadActions
            key={thread.id}
            threadId={thread.id}
            kind={thread.kind}
            authorName={thread.authorName}
            blockHint={blockHint(thread.channel)}
            read={thread.read}
          />
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m) => {
            // Geliked wird, was von außen kam: der Kommentar selbst oder eine
            // eingegangene Nachricht. Die eigene Antwort zu liken kennt Meta nicht.
            const likeable = !m.fromSelf && (thread.kind === "dm" || m.id === thread.id);
            // Eine Antwort rückt ein – das ist der Baum. Worauf sie antwortet,
            // steht nur dann dabei, wenn die Einrückung es nicht schon sagt:
            // bei einer Antwort auf eine Antwort.
            const antwortAuf = m.parentId ? nachId.get(m.parentId) : undefined;
            const zitat = antwortAuf && antwortAuf.id !== thread.id ? antwortAuf : undefined;
            return (
              <div
                key={m.id}
                className={`group flex items-end gap-1.5 ${m.fromSelf ? "flex-row-reverse" : ""} ${
                  m.parentId ? (m.fromSelf ? "mr-9" : "ml-9") : ""
                }`}
              >
                {!m.fromSelf && (
                  <Avatar name={m.authorName} src={m.authorAvatar} size={24} className="mb-1" />
                )}
                <div
                  className={`max-w-[68%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    m.fromSelf
                      ? "rounded-br-sm bg-[var(--color-text-accent)] text-white"
                      : "rounded-bl-sm bg-ink-50 text-ink-900"
                  }`}
                >
                  {/* In einem Kommentarbaum sprechen mehrere; in einer
                      Unterhaltung immer dieselben zwei – dort wäre der Name
                      unter jeder Blase nur Lärm. */}
                  {!m.fromSelf && thread.kind === "comment" && (
                    <div className="mb-0.5 text-[11px] font-medium text-ink-500">{m.authorName}</div>
                  )}
                  {zitat && (
                    <div
                      className={`mb-1.5 border-l-2 pl-2 text-[11px] leading-snug ${
                        m.fromSelf ? "border-white/40 text-white/80" : "border-ink-200 text-ink-500"
                      }`}
                    >
                      <div className="font-medium">Antwort auf {zitat.authorName}</div>
                      <div className="line-clamp-2 break-words">{zitat.text}</div>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.text}</div>
                  <div className={`mt-1 text-[11px] ${m.fromSelf ? "text-white/70" : "text-ink-400"}`}>
                    {relativeTime(m.createdAt)}
                    {m.liked && !m.fromSelf && " · geliked"}
                  </div>
                </div>
                {likeable && (
                  <LikeButton threadId={thread.id} messageId={m.id} liked={m.liked} hint={hint} />
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-ink-100 px-4 py-3">
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

      {/* Die rechte Schiene füllt den Platz, der vorher leer neben einer
          zweizeiligen Antwort stand, mit dem, was beim Antworten fehlt: der
          Beitrag in Bildgröße und der Kunde, dessen Stimme man gerade spricht.
          Unter 1280px hat die Unterhaltung Vorrang, dann fällt sie weg. */}
      <aside className="hidden w-[300px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-ink-100 bg-ink-50/40 p-4 xl:flex">
        {thread.kind === "comment" && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
              Kommentiert unter
            </h2>
            {thread.contextThumbnail ? (
              // Nicht next/image: die Adresse kommt von Metas CDN, ist kurzlebig
              // und signiert – nichts, was ein Optimierer sinnvoll zwischenlagert.
              <img
                src={thread.contextThumbnail}
                alt=""
                className="aspect-square w-full rounded-lg object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-ink-100">
                <Sign meaning="image" form="outline" size={24} color="var(--color-icon-secondary)" />
              </div>
            )}
            <p className="text-sm leading-snug text-ink-700">{thread.contextLabel ?? "Beitrag"}</p>
            {thread.contextAdId && (
              <Badge variant="neutral" label="Läuft als Anzeige" />
            )}
            {thread.contextPermalink && (
              <a
                href={thread.contextPermalink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-accent)] hover:underline"
              >
                <Sign meaning="preview" form="outline" size={12} />
                Beitrag bei {KANAL[thread.channel]} ansehen
              </a>
            )}
          </section>
        )}

        <section className="flex flex-col gap-1.5">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Kunde</h2>
          <div className="text-sm font-medium text-ink-900">{customerName}</div>
          <Link
            href={`/customers/${thread.customerId}`}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-accent)] hover:underline"
          >
            <Sign meaning="customer" form="outline" size={12} />
            Kundenblatt öffnen
          </Link>
          <Link
            href={`/inbox?customer=${thread.customerId}`}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-accent)] hover:underline"
          >
            <Sign meaning="inbox" form="outline" size={12} />
            Nur diesen Kunden zeigen
          </Link>
        </section>

        {thread.kind === "dm" && thread.expiresAt && !expired && (
          <section className="flex flex-col gap-1.5">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
              Antwortfenster
            </h2>
            {/* Metas 24 Stunden sind die härteste Frist in diesem Haus – sie
                gehört neben das Antwortfeld, nicht in eine Fehlermeldung danach. */}
            <p className="text-sm text-ink-700">Endet {relativeTime(thread.expiresAt)}</p>
          </section>
        )}
      </aside>
    </div>
  );
}
