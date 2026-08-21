import Link from "next/link";
import { Avatar, Badge, Card, EmptyState } from "@/app/shell/ui";
import { findCustomer, listCustomers } from "@/lib/customers";
import { likeHint } from "@/lib/inbox-moderate";
import {
  countOpenCustomers,
  countThreads,
  listThreads,
  oldestOpen,
  openDb,
  type Thread,
} from "@/lib/inbox-store";
import { Blatt, Blattkopf } from "@/app/shell/blattkopf";
import { ActiveFilters, FacetSearch, FacetSelect, Facets } from "@/app/shell/facets";
import { Sign } from "@/theme/icons";
import { Poller } from "./poller";
import { ThreadDetail } from "./thread-detail";
import { LikeButton } from "./moderation";
import { relativeTime } from "./relative-time";

/**
 * Der Deckel der Listenspalte. 1500 Zeilen als DOM zu bauen kostet mehr, als
 * eine Spalte je zeigt; wer tiefer muss, filtert – oder hängt ?limit= an.
 * ponytail: kein unendliches Scrollen. Erst nachrüsten, wenn jemand
 * tatsächlich über den Deckel hinaus arbeitet statt zu filtern.
 */
const DECKEL = 120;

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const { customers } = await listCustomers();
  const scope = findCustomer(customers, str("customer"));
  // Die Threads tragen nur die Kunden-Id; der Name steht hier schon bereit.
  const namen = new Map(customers.map((c) => [c.id, c.name]));
  const kundeVon = (id: string) => namen.get(id) ?? id;

  const db = openDb();
  const filter = {
    customerId: scope?.id,
    channel: str("channel") as "facebook" | "instagram" | undefined,
    kind: str("kind") as "comment" | "dm" | undefined,
    answered: str("answered") === undefined ? undefined : str("answered") === "true",
    q: str("q"),
  };
  const limit = Number(str("limit") ?? DECKEL);
  const threads = listThreads(db, { ...filter, limit });
  const { total, open } = countThreads(db, filter);
  const betroffene = countOpenCustomers(db, scope?.id);
  const aelteste = oldestOpen(db, scope?.id);
  const selected = str("thread") ? threads.find((t) => t.id === str("thread")) : undefined;
  const href = (mehr: Record<string, string>) =>
    `?${new URLSearchParams({ ...(sp as Record<string, string>), ...mehr }).toString()}`;

  return (
    <>
      <Blattkopf
        titel="Inbox"
        meaning="inbox"
        figur={open}
        figurEinheit="offen"
        // Nicht noch einmal dieselbe Zahl: was der Kopf beitragen kann, ist das
        // Alter der ältesten offenen Frage – die Zahl, die ein Kunde als
        // Schweigen erlebt – und über wie viele Auftritte sich das verteilt.
        stand={
          total === 0
            ? "Keine Unterhaltungen in dieser Ansicht."
            : aelteste
              ? `Älteste offene Frage ${relativeTime(aelteste)} · ${total} Unterhaltungen insgesamt`
              : `${total} Unterhaltungen, alle beantwortet`
        }
        marken={
          open > 0 && (
            <Badge
              variant={betroffene > 20 ? "warning" : "neutral"}
              label={`${betroffene} ${betroffene === 1 ? "Kunde wartet" : "Kunden warten"}`}
            />
          )
        }
      />
      <Blatt>
        <Facets customer={str("customer")}>
          <FacetSelect
            name="channel"
            label="Kanal"
            value={str("channel")}
            options={[
              ["facebook", "Facebook"],
              ["instagram", "Instagram"],
            ]}
          />
          <FacetSelect
            name="kind"
            label="Art"
            value={str("kind")}
            options={[
              ["comment", "Kommentar"],
              ["dm", "Nachricht"],
            ]}
          />
          <FacetSelect
            name="answered"
            label="Status"
            value={str("answered")}
            options={[
              ["false", "Offen"],
              ["true", "Beantwortet"],
            ]}
          />
          <FacetSearch value={str("q")} />
        </Facets>
        <ActiveFilters
          params={sp}
          labels={{ q: "Suche", channel: "Kanal", kind: "Art", answered: "Status" }}
        />

        {/* Zwei Spalten, beide unabhängig scrollend – bewusste Ausnahme von
            "nur main scrollt", siehe Spec: Filterzeile und Antwortfeld
            müssen bei einer vollen Liste erreichbar bleiben. Die Höhe lässt
            dem Arbeitsbereich alles, was Kopf und Filterzeile übrig lassen –
            an diesem Fenster hing vorher ein Drittel ungenutzt darunter. */}
        <div className="flex gap-4" style={{ height: "calc(100vh - 268px)", minHeight: 520 }}>
          <Card
            elevation="low"
            padding={0}
            className="w-[360px] shrink-0 overflow-y-auto lg:w-[400px]"
          >
            {threads.length === 0 ? (
              <EmptyState title="Keine Unterhaltungen in dieser Ansicht." isCompact />
            ) : (
              <ul>
                {threads.map((t) => (
                  <ThreadRow
                    key={t.id}
                    thread={t}
                    customerName={kundeVon(t.customerId)}
                    href={href({ thread: t.id })}
                    isSelected={selected?.id === t.id}
                  />
                ))}
                {threads.length === limit && (
                  <li className="p-3 text-center">
                    <Link
                      href={href({ limit: String(limit + DECKEL) })}
                      className="text-sm font-medium text-[var(--color-text-accent)] hover:underline"
                    >
                      Weitere {Math.min(DECKEL, total - limit)} laden
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </Card>

          <Card elevation="low" padding={0} className="flex-1 overflow-hidden">
            {selected ? (
              <ThreadDetail thread={selected} customerName={kundeVon(selected.customerId)} />
            ) : (
              <EmptyState
                title="Eine Unterhaltung wählen"
                description="Links steht, was offen ist – oben zuerst, älteste offene Frage zuerst gemeldet."
              />
            )}
          </Card>
        </div>
      </Blatt>
      <Poller customer={str("customer")} baseline={{ count: open }} />
    </>
  );
}

/**
 * Eine Zeile beantwortet drei Fragen in dieser Reihenfolge: *wessen* Auftritt,
 * *was* steht da, *worunter*. Der Kundenname steht zuoberst und nicht der
 * Absender – bei 200 Auftritten sagt "mariaemmatulpe" niemandem etwas, der
 * Heimname dagegen sofort, welcher Ton und welche Zuständigkeit gilt.
 */
function ThreadRow({
  thread: t,
  customerName,
  href,
  isSelected,
}: {
  thread: Thread;
  customerName: string;
  href: string;
  isSelected: boolean;
}) {
  return (
    <li
      className={`flex items-start gap-3 border-b border-ink-100 py-3 pr-2 pl-3 ${
        isSelected ? "bg-ink-50" : "hover:bg-ink-50/60"
      } ${t.answered ? "" : "border-l-2 border-l-[var(--color-text-accent)] pl-[10px]"}`}
    >
      {/* Das Bild des Beitrags trägt die Wiedererkennung – bei Nachrichten
          gibt es keinen, dann steht die Person selbst dort. */}
      <Link href={href} className="shrink-0">
        {t.contextThumbnail ? (
          <img
            src={t.contextThumbnail}
            alt=""
            className="h-16 w-16 rounded-lg object-cover"
          />
        ) : (
          <Avatar name={t.authorName} src={t.authorAvatar} size={64} />
        )}
      </Link>

      <Link href={href} className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          {/* Ungelesen ist der Punkt, nicht die Zeile: „offen" sortiert schon,
              „gelesen" sagt, was davon jemand angesehen hat. */}
          {!t.read && (
            <span
              aria-label="ungelesen"
              className="size-2 shrink-0 self-center rounded-full bg-[var(--color-text-accent)]"
            />
          )}
          <span className="truncate text-sm font-semibold text-ink-900">{customerName}</span>
          <span className="ml-auto shrink-0 text-[11px] text-ink-400">
            {relativeTime(t.lastMessageAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
          <Sign meaning={t.channel} size={12} />
          <Sign meaning={t.kind === "dm" ? "dm" : "comment"} size={12} className="text-ink-300" />
          {/* Das große Bild links gehört dem Beitrag; wer geschrieben hat,
              steht daneben – klein, aber mit Gesicht, wo Meta eines gibt. */}
          <Avatar name={t.authorName} src={t.authorAvatar} size={16} />
          <span className="truncate">{t.authorName}</span>
        </div>
        {/* Was gesagt wurde, nicht wie der Beitrag heißt: das entscheidet,
            ob diese Zeile jetzt oder später dran ist. */}
        {t.lastText && (
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-ink-600">{t.lastText}</p>
        )}
      </Link>

      <LikeButton
        threadId={t.id}
        messageId={t.likeTargetId}
        liked={t.liked}
        hint={likeHint(t.kind, t.channel)}
      />
    </li>
  );
}
