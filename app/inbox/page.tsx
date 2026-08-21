import Link from "next/link";
import { Avatar, Card, EmptyState } from "@/app/shell/ui";
import { findCustomer, listCustomers } from "@/lib/customers";
import { openDb, listThreads } from "@/lib/inbox-store";
import { Blatt, Blattkopf } from "@/app/shell/blattkopf";
import { ActiveFilters, FacetSearch, FacetSelect, Facets } from "@/app/shell/facets";
import { Sign } from "@/theme/icons";
import { Poller } from "./poller";
import { ThreadDetail } from "./thread-detail";
import { relativeTime } from "./relative-time";

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const { customers } = await listCustomers();
  const scope = findCustomer(customers, str("customer"));

  const db = openDb();
  const threads = listThreads(db, {
    customerId: scope?.id,
    channel: str("channel") as "facebook" | "instagram" | undefined,
    kind: str("kind") as "comment" | "dm" | undefined,
    answered: str("answered") === undefined ? undefined : str("answered") === "true",
    q: str("q"),
  });
  const offen = threads.filter((t) => !t.answered).length;
  const selected = str("thread") ? threads.find((t) => t.id === str("thread")) : undefined;

  return (
    <>
      <Blattkopf
        titel="Inbox"
        meaning="inbox"
        figur={offen}
        figurEinheit="offen"
        stand={
          threads.length === 0
            ? "Keine Unterhaltungen in dieser Ansicht."
            : `${threads.length} ${threads.length === 1 ? "Unterhaltung" : "Unterhaltungen"} · ${offen} offen`
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
            müssen bei einer vollen Liste erreichbar bleiben. */}
        <div className="flex gap-4" style={{ height: "calc(100vh - 320px)", minHeight: 480 }}>
          <Card elevation="low" padding={0} className="w-96 shrink-0 overflow-y-auto">
            {threads.length === 0 ? (
              <EmptyState title="Keine Unterhaltungen in dieser Ansicht." isCompact />
            ) : (
              <ul>
                {threads.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`?${new URLSearchParams({ ...sp, thread: t.id } as Record<string, string>).toString()}`}
                      className={`flex items-start gap-3 border-b border-ink-100 p-3 hover:bg-ink-50 ${selected?.id === t.id ? "bg-ink-50" : ""}`}
                    >
                      <Avatar name={t.authorName} src={t.authorAvatar} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Sign meaning={t.channel} size={12} />
                          <Sign
                            meaning={t.kind === "dm" ? "dm" : "comment"}
                            size={12}
                            className="text-ink-300"
                          />
                          <span className="truncate text-sm font-medium text-ink-900">
                            {t.authorName}
                          </span>
                          {!t.answered && (
                            <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-[var(--color-text-accent)]" />
                          )}
                        </div>
                        {t.contextLabel && (
                          <div className="truncate text-xs text-ink-500">{t.contextLabel}</div>
                        )}
                        <div className="text-xs text-ink-400">{relativeTime(t.lastMessageAt)}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card elevation="low" padding={0} className="flex-1 overflow-hidden">
            {selected ? (
              <ThreadDetail thread={selected} />
            ) : (
              <EmptyState title="Eine Unterhaltung wählen" isCompact />
            )}
          </Card>
        </div>
      </Blatt>
      <Poller customer={str("customer")} baseline={{ count: offen }} />
    </>
  );
}
