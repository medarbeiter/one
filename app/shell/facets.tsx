"use client";

import Link from "next/link";

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Ein GET-Formular ist der ganze Filtermechanismus: der Browser schreibt die
 * Felder in die Query, Server Components lesen sie direkt. Kein Client-State,
 * kein useEffect, und jede gefilterte Ansicht ist ein teilbarer Link.
 */
export function Facets({ customer, children }: { customer?: string; children: React.ReactNode }) {
  return (
    <form
      className="border-line bg-surface flex flex-wrap items-center gap-2 rounded-lg border p-2"
      onChange={(e) => (e.currentTarget as HTMLFormElement).requestSubmit()}
    >
      {customer && <input type="hidden" name="customer" value={customer} />}
      {children}
    </form>
  );
}

// ponytail: natives <select> statt HeroUI-Select – so kommt die Filterzeile
// ohne State aus. Auf ComboBox erst umstellen, wenn eine Facette suchbar sein muss.
const control =
  "border-line bg-surface text-ink-700 h-9 rounded-md border px-2 text-sm";

export function FacetSelect({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: [string, string][];
  value?: string;
}) {
  return (
    <select name={name} aria-label={label} defaultValue={value ?? ""} className={control}>
      <option value="">{label}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function FacetSearch({ value }: { value?: string }) {
  return (
    <input
      type="search"
      name="q"
      defaultValue={value ?? ""}
      placeholder="Search"
      aria-label="Search"
      className={`${control} min-w-48 flex-1`}
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
    return { key, label: `${label}: ${params[key]}`, href: `?${next.toString()}` };
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
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          className="bg-gold-100 text-ink-900 rounded-full px-2 py-1 hover:line-through"
        >
          {c.label} ✕
        </Link>
      ))}
      <Link href={scope || "?"} className="text-gold-700 underline">
        Reset all
      </Link>
    </div>
  );
}
