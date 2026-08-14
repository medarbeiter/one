"use client";

import Link from "next/link";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Form, ListBox, SearchField, Select, Tag, TagGroup } from "@heroui/react";
import { linkVariants } from "@heroui/styles";
import { Icon, type IconName } from "./icons";

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Ein GET-Formular ist der ganze Filtermechanismus: der Browser schreibt die
 * Felder in die Query, Server Components lesen sie direkt. Kein Client-State,
 * kein useEffect, und jede gefilterte Ansicht ist ein teilbarer Link.
 */
export function Facets({ customer, children }: { customer?: string; children: React.ReactNode }) {
  return (
    <Form className="flex flex-wrap items-center gap-2">
      {customer && <input type="hidden" name="customer" value={customer} />}
      {children}
    </Form>
  );
}

// "Alle" ist keine Facette, sondern ihr Fehlen. Für eine Auswahlliste ist der
// leere Schlüssel aber dasselbe wie "nichts gewählt", deshalb ein Platzhalter,
// der beim Abschicken wieder zu "" wird.
const ANY = "__any__";

export function FacetSelect({
  name,
  label,
  options,
  value,
  icon = "filter",
}: {
  name: string;
  label: string;
  options: [string, string][];
  value?: string;
  icon?: IconName;
}) {
  // Der gewählte Wert reist über ein verstecktes Feld ins GET-Formular: Select
  // schreibt ihn hinein und schickt sofort ab. Der Filter bleibt damit das, was
  // er war – eine URL, kein Client-State.
  const hidden = useRef<HTMLInputElement>(null);

  return (
    <>
      <input ref={hidden} type="hidden" name={name} defaultValue={value ?? ""} />
      <Select
        aria-label={label}
        defaultSelectedKey={value ?? ANY}
        onSelectionChange={(key) => {
          const field = hidden.current;
          if (!field) return;
          field.value = key === ANY ? "" : String(key);
          field.form?.requestSubmit();
        }}
      >
        <Select.Trigger>
          <Icon name={icon} className="text-ink-300 size-4" />
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id={ANY} textValue={label}>
              {label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
            {options.map(([v, l]) => (
              <ListBox.Item key={v} id={v} textValue={l}>
                {l}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </>
  );
}

export function FacetSearch({ value }: { value?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const submit = () => input.current?.form?.requestSubmit();

  return (
    <SearchField
      name="q"
      defaultValue={value ?? ""}
      aria-label="Suche"
      // Der Auto-Submit gilt den Auswahlfeldern. Jeder Tastendruck wäre sonst ein
      // Seitenwechsel und ein Graph-Aufruf über alle Kunden – gesucht wird
      // deshalb mit Enter, und das Leeren des Feldes zählt auch als Suche.
      onSubmit={submit}
      onClear={submit}
      className="ml-auto w-72 max-w-full"
    >
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input ref={input} placeholder="Suchen…" />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
}

/** Pure: welche Facetten sind gesetzt, und wohin führt ihr Entfernen. */
export function activeChips(params: SearchParams, labels: Record<string, string>) {
  const set = Object.entries(labels).filter(([k]) => {
    const v = params[k];
    return typeof v === "string" && v.length > 0;
  });

  return set.map(([key, label]) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (k !== key && typeof v === "string" && v) next.set(k, v);
    // "id", weil die Liste unten genau diese Objekte als Collection bekommt.
    return { id: key, label: `${label}: ${params[key]}`, href: `?${next.toString()}` };
  });
}

export function ActiveFilters({
  params,
  labels,
}: {
  params: SearchParams;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const chips = activeChips(params, labels);
  if (!chips.length) return null;
  const scope = typeof params.customer === "string" ? `?customer=${params.customer}` : "";

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <TagGroup
        aria-label="Aktive Filter"
        size="sm"
        // Eine Facette zu entfernen heißt, ihre URL zu verlassen – und die steht
        // schon im Chip.
        onRemove={(keys) => {
          const gone = chips.find((c) => keys.has(c.id));
          if (gone) router.push(gone.href);
        }}
      >
        <TagGroup.List items={chips}>
          {(c) => (
            <Tag textValue={c.label}>
              {c.label}
              <Tag.RemoveButton />
            </Tag>
          )}
        </TagGroup.List>
      </TagGroup>
      {/* linkVariants gibt Slots zurück, nicht eine Klasse – die Fläche des
          Links ist base(). */}
      <Link href={scope || "?"} className={linkVariants().base()}>
        Alle zurücksetzen
      </Link>
    </div>
  );
}
