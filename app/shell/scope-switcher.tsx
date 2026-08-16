"use client";

import { createStaticSource, Typeahead } from "@astryxdesign/core";
import type { SearchableItem } from "@astryxdesign/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

const ALL = "__all__";

type Item = { id: string; name: string };

export function ScopeSwitcher({ customers }: { customers: Item[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Astryx' Typeahead sucht über SearchableItem (id + label), nicht über die
  // Item-Form dieser App (id + name) – deshalb die Übersetzung hier.
  const entries: SearchableItem[] = useMemo(
    () => [{ id: ALL, label: "Alle Kunden" }, ...customers.map((c) => ({ id: c.id, label: c.name }))],
    [customers],
  );
  const searchSource = useMemo(() => createStaticSource(entries), [entries]);

  // Der Scope steht in der URL, nicht im State – sonst überlebt er keinen
  // Seitenwechsel und keinen Zurück-Button. Typeahead ist kontrolliert, also
  // muss `value` bei jedem Render aus der URL abgeleitet werden.
  const selectedId = params.get("customer") ?? ALL;
  const value = entries.find((e) => e.id === selectedId) ?? entries[0];

  function select(entry: SearchableItem | null) {
    const next = new URLSearchParams(params);
    const key = entry?.id;
    if (!key || key === ALL) next.delete("customer");
    else next.set("customer", key);
    // Eine Auswahl aus einem anderen Kunden gehört nicht in den neuen Scope.
    next.delete("item");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <Typeahead
      label="Kunden-Scope"
      isLabelHidden
      searchSource={searchSource}
      value={value}
      onChange={select}
      placeholder="Alle Kunden"
      hasEntriesOnFocus
      maxMenuItems={entries.length}
      emptySearchResultsText="Keine Kunden gefunden"
      className="w-64"
    />
  );
}
