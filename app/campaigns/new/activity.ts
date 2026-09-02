"use client";

/**
 * Was der Assistent gerade tut – ein Protokoll außerhalb des React-Baums.
 *
 * Der Vorschlag entsteht an vielen Stellen zugleich: der Zusammenbau streamt
 * vom Server (app/api/brief), die Texte schreibt der Anzeigen-Block, das Regal
 * sucht im Drive, die Formularliste kommt aus dem Block, die letzte Kampagne
 * aus wizard.tsx. Jede Stelle weiß, was sie tut – aber nur eine Fläche soll es
 * sagen. Deshalb ein Store wie upload-queue.ts (useSyncExternalStore) statt
 * einer Callback-Prop durch drei Ebenen: `report()` ist eine Zeile am Ort des
 * Geschehens, `useActivity()` die eine Fläche, die zusieht (werkstatt.tsx).
 *
 * Einträge werden über ihre `id` fortgeschrieben, die Reihenfolge ist die des
 * ersten Auftretens – so wandert eine Zeile von „läuft“ zu „fertig“, statt
 * unten neu zu erscheinen.
 */

import { useSyncExternalStore } from "react";
import type { Source } from "@/lib/brief";

export type ActivityStatus = "queued" | "running" | "done" | "skipped" | "failed";

export type Activity = {
  id: string;
  /** Was getan wird, als Tätigkeit: „ClickUp-Aufgabe lesen“. */
  label: string;
  status: ActivityStatus;
  /** Was dabei herauskam, in einem Satz – die Herkunft, bevor sie am Feld steht. */
  detail?: string;
  /** Aus welcher Quelle der Wert stammt – dasselbe Etikett wie am Feld. */
  source?: Source;
  at: number;
};

let entries: Activity[] = [];
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

export function report(entry: Omit<Activity, "at">): void {
  const at = Date.now();
  const i = entries.findIndex((e) => e.id === entry.id);
  entries =
    i === -1
      ? [...entries, { ...entry, at }]
      : entries.map((e, idx) => (idx === i ? { ...e, ...entry, at } : e));
  notify();
}

export function clearActivity(): void {
  if (!entries.length) return;
  entries = [];
  notify();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const get = () => entries;
const EMPTY: Activity[] = [];

export function useActivity(): Activity[] {
  return useSyncExternalStore(subscribe, get, () => EMPTY);
}

/** Für Tests: der rohe Stand, ohne React. */
export const activitySnapshot = get;
