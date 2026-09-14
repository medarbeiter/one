"use client";

import { Typeahead } from "@astryxdesign/core";
import type { SearchSource, SearchableItem } from "@astryxdesign/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { fuzzyCustomerMatch } from "@/lib/customers";

type Item = { id: string; name: string };

export function ScopeSwitcher({ customers }: { customers: Item[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Astryx' Typeahead sucht über SearchableItem (id + label), nicht über die
  // Item-Form dieser App (id + name) – deshalb die Übersetzung hier.
  const entries: SearchableItem[] = useMemo(
    () => customers.map((c) => ({ id: c.id, label: c.name })),
    [customers],
  );

  // Der Scope steht in der URL, nicht im State – sonst überlebt er keinen
  // Seitenwechsel und keinen Zurück-Button. Typeahead ist kontrolliert, also
  // muss `value` bei jedem Render aus der URL abgeleitet werden. „Alle Kunden"
  // ist kein Eintrag, sondern die Leere: so hat das X etwas zu leeren, und das
  // Feld zeigt den Platzhalter, sobald kein Kunde gewählt ist.
  const selectedId = params.get("customer");
  const value = entries.find((e) => e.id === selectedId) ?? null;

  const searchSource = useMemo<SearchSource>(() => {
    const suche = (q: string) => {
      // Ein Klick auf den gewählten Kunden füllt das Feld mit seinem Namen –
      // das ist keine Frage nach ihm, sondern der Wunsch, neu zu wählen.
      if (!q.trim() || q === value?.label) return entries;
      return entries.filter((e) => fuzzyCustomerMatch(e.label, q));
    };
    return { search: suche, bootstrap: () => entries };
  }, [entries, value]);

  function select(entry: SearchableItem | null) {
    const next = new URLSearchParams(params);
    if (entry) next.set("customer", entry.id);
    else next.delete("customer");
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
      debounceMs={0}
      maxMenuItems={entries.length}
      emptySearchResultsText="Keine Kunden gefunden"
      className="w-64"
    />
  );
}
