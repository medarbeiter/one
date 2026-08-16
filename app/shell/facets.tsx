"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Badge, Button, Selector, TextInput } from "@astryxdesign/core";
import { Icon, type IconName } from "./icons";
import { Sign } from "@/theme/icons";

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Ein GET-Formular ist der ganze Filtermechanismus: der Browser schreibt die
 * Felder in die Query, Server Components lesen sie direkt. Kein Client-State,
 * kein useEffect, und jede gefilterte Ansicht ist ein teilbarer Link.
 *
 * Astryx hat keinen Form-Wrapper – ein natives <form> reicht, GET ist ohne
 * method-Angabe ohnehin der Browser-Standard.
 */
export function Facets({ customer, children }: { customer?: string; children: React.ReactNode }) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-2">
      {customer && <input type="hidden" name="customer" value={customer} />}
      {children}
    </form>
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
  // Der gewählte Wert reist über ein verstecktes Feld ins GET-Formular: Selector
  // schreibt ihn hinein und schickt sofort ab. Der Filter bleibt damit das, was
  // er war – eine URL, kein Client-State. Selectors eigenes `htmlName` würde ein
  // zweites Feld mit demselben Namen erzeugen (und den ANY-Platzhalter statt ""
  // senden), deshalb bleibt dieses Feld manuell.
  const hidden = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(value ?? ANY);

  return (
    <>
      <input ref={hidden} type="hidden" name={name} defaultValue={value ?? ""} />
      <Selector
        label={label}
        isLabelHidden
        startIcon={<Icon name={icon} className="text-ink-300 size-4" />}
        value={selected}
        options={[{ value: ANY, label }, ...options.map(([v, l]) => ({ value: v, label: l }))]}
        onChange={(next) => {
          setSelected(next);
          const field = hidden.current;
          if (!field) return;
          field.value = next === ANY ? "" : next;
          field.form?.requestSubmit();
        }}
      />
    </>
  );
}

export function FacetSearch({ value }: { value?: string }) {
  const input = useRef<HTMLInputElement>(null);
  // TextInput ist kontrolliert; der lokale State spiegelt nur die Anzeige, die
  // Quelle der Wahrheit bleibt die Query, aus der `value` kommt.
  const [text, setText] = useState(value ?? "");
  const submit = () => input.current?.form?.requestSubmit();

  return (
    <TextInput
      ref={input}
      htmlName="q"
      label="Suche"
      isLabelHidden
      value={text}
      onChange={(next) => {
        const wasFilled = text !== "";
        setText(next);
        // Der Auto-Submit gilt den Auswahlfeldern. Jeder Tastendruck wäre sonst
        // ein Seitenwechsel und ein Graph-Aufruf über alle Kunden – gesucht wird
        // deshalb mit Enter, und das Leeren des Feldes zählt auch als Suche.
        if (next === "" && wasFilled) submit();
      }}
      onEnter={submit}
      hasClear
      placeholder="Suchen…"
      startIcon={<Icon name="search" className="text-ink-300 size-4" />}
      className="ml-auto w-72 max-w-full"
    />
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
  const chips = activeChips(params, labels);
  if (!chips.length) return null;
  const scope = typeof params.customer === "string" ? `?customer=${params.customer}` : "";

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {/* Read-only Chips, kein Token-Editor: eine Facette zu entfernen heißt,
          ihre URL zu verlassen – und die steht schon im Chip als Link. Das
          Kreuz macht die Entfernbarkeit auch sehend sichtbar, nicht nur für
          Screenreader. */}
      <ul aria-label="Aktive Filter" className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <li key={c.id}>
            <Link
              href={c.href}
              aria-label={`${c.label} entfernen`}
              className="focus-visible:ring-focus rounded-full transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
              <Badge
                label={
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    <Sign meaning="close" size={12} />
                  </span>
                }
              />
            </Link>
          </li>
        ))}
      </ul>
      <Button href={scope || "?"} as={Link} variant="ghost" size="sm" label="Alle zurücksetzen" />
    </div>
  );
}
