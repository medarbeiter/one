"use client";

/**
 * Die Nebenwirkungen des Assistenten, die für sich stehen: jede ist ein
 * Effekt mit eigenem Anlass und eigener Meldung ins Protokoll, und keine
 * braucht die anderen. In wizard.tsx standen sie zwischen dem Rendern – hier
 * sind sie je eine Funktion, die sich einzeln lesen und prüfen lässt.
 */
import { useEffect, useState } from "react";
import type { useRouter } from "next/navigation";
import { campaignName } from "@/lib/naming";
import { placeTextValue } from "@/lib/geo";
import type { Prefill } from "@/lib/prefill";
import { report } from "./activity";
import { DEFAULT_RADIUS_KM, type WizardAdSet, type WizardState } from "./state";
import { closeBriefAction, leadgenTosAcceptedAction, prefillAction, refreshAssetsAction } from "../actions";

type SetState = (fn: (s: WizardState) => WizardState) => void;

/**
 * Der Name folgt Business/Rollen/Datum/Initialen, solange niemand ihn von
 * Hand angefasst hat – siehe nameEdited in state.ts.
 */
export function useCampaignNameSync(state: WizardState, setState: SetState): void {
  const composed = campaignName({
    business: state.business,
    roles: state.roles,
    roleFreeText: state.roleFreeText,
    start: new Date(state.startDate),
    initials: state.initials,
  });
  useEffect(() => {
    if (!state.nameEdited) setState((s) => ({ ...s, campaignName: composed }));
  }, [composed, state.nameEdited, setState]);
}

/**
 * Metas Lead-Bedingungen nimmt nur ein Seiten-Admin an – im Business Manager,
 * nicht hier. Geprüft wird beim Zurückkommen in den Tab (Fokus), nicht im
 * Takt: wer die Bedingungen annimmt, wechselt danach ohnehin hierher zurück.
 */
export function useLeadgenTos(
  client: { needsLeadgenTos?: boolean; pageId?: string } | undefined,
  router: ReturnType<typeof useRouter>,
): void {
  const needsTos = client?.needsLeadgenTos ?? false;
  const tosPageId = client?.pageId;
  useEffect(() => {
    if (!needsTos || !tosPageId) return;
    // Ein Graph-Aufruf je Prüfung, nicht das ganze Portfolio: Tag-Wurf und
    // router.refresh() erst, wenn die Annahme wirklich da ist.
    const check = async () => {
      if (!(await leadgenTosAcceptedAction(tosPageId))) return;
      await refreshAssetsAction();
      router.refresh();
    };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [needsTos, tosPageId, router]);
}

// Vorbelegung greift nur, solange niemand das jeweilige Feld angefasst hat –
// "angefasst" heißt hier: noch auf dem Ausgangswert aus emptyAdSet(). Das ist
// gröber als ein echtes touched-Flag pro Feld, aber genau das reicht: sobald
// jemand tippt, weicht der Wert vom Default ab und wird nie wieder überschrieben.
export function untouchedPrefillPatch(current: WizardAdSet, prefill: Prefill): Partial<WizardAdSet> {
  const patch: Partial<WizardAdSet> = {};
  if (current.addressString === "" && prefill.addressString)
    patch.addressString = prefill.addressString;
  // Zielte die letzte Kampagne auf eine Stadt, kommt sie als Ort zurück. Der
  // Name daran ist nur die Beschriftung – gebucht wird über den Schlüssel, und
  // den liefert Meta beim Lesen mit.
  if (current.addressString === "" && !current.place && prefill.place) {
    patch.place = prefill.place;
    patch.addressString = placeTextValue(prefill.place);
  }
  if (current.radiusKm === DEFAULT_RADIUS_KM && prefill.radiusKm !== undefined)
    patch.radiusKm = prefill.radiusKm;
  return patch;
}

/**
 * Adresse und Radius aus der letzten Kampagne des Kunden übernehmen – aber
 * nur ins erste Ad Set und nur die Felder, die noch am Ausgangswert stehen
 * (untouchedPrefillPatch). Alle Kampagnen laufen über dasselbe Zahlerkonto,
 * der Kunde steckt in der Seite: ohne Seite ist die "letzte Kampagne des
 * Kontos" die eines anderen Kunden – also erst suchen, wenn der Kunde
 * feststeht. Steht die Adresse schon aus ClickUp oder der Tabelle, wird gar
 * nicht erst gesucht: der Aufruf könnte nichts mehr beitragen.
 * Der Zustand ist sichtbar, weil die Vorbelegung Felder ändert, während man
 * hinschaut.
 */
export function usePrefill(
  state: WizardState,
  setState: SetState,
  pageId: string | undefined,
): "loading" | "applied" | "none" {
  const [prefill, setPrefill] = useState<"loading" | "applied" | "none">("none");
  const first = state.adSets[0];
  const settled =
    Boolean(first?.addressString) && first.radiusKm !== DEFAULT_RADIUS_KM && !state.sources.location?.includes("previous");
  const fromBrief = Boolean(first?.addressString) && (state.sources.location ?? []).some((s) => s === "clickup" || s === "onboarding");
  useEffect(() => {
    const adAccount = state.adAccount;
    if (!adAccount || !pageId) return;
    const label = "Letzte Kampagne des Kunden";
    if (settled || fromBrief) {
      report({ id: "previous", label, status: "skipped", detail: "Standort steht schon – nicht gesucht" });
      return;
    }
    let cancelled = false;
    setPrefill("loading");
    report({ id: "previous", label, status: "running", detail: "sucht Standort und Radius der letzten Kampagne…" });
    prefillAction(adAccount, pageId).then((found) => {
      if (cancelled) return;
      if (!found) {
        report({ id: "previous", label, status: "skipped", detail: "keine frühere Kampagne für diese Seite" });
        return setPrefill("none");
      }
      let applied = false;
      setState((s) => {
        const head = s.adSets[0];
        if (!head) return s;
        const patch = untouchedPrefillPatch(head, found);
        if (!Object.keys(patch).length) return s;
        applied = true;
        return {
          ...s,
          sources: { ...s.sources, location: ["previous"] },
          adSets: s.adSets.map((set, i) => (i === 0 ? { ...set, ...patch } : set)),
        };
      });
      setPrefill(applied ? "applied" : "none");
      report({
        id: "previous",
        label,
        status: applied ? "done" : "skipped",
        detail: applied
          ? [found.addressString ?? found.place?.name, found.radiusKm ? `${found.radiusKm} km` : undefined].filter(Boolean).join(" · ")
          : "Standort stand schon – nichts zu übernehmen",
        source: applied ? "previous" : undefined,
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.adAccount, pageId]);
  return prefill;
}

/**
 * Angelegt heißt auch: Aufgabe weiter. Einmal je campaignId – forget() lässt
 * den State stehen, die taskId ist danach also noch da.
 */
export function useClickupCloseout(
  campaignId: string | undefined,
  state: Pick<WizardState, "taskId" | "campaignName" | "adAccount">,
): { error?: string } | undefined {
  const [clickup, setClickup] = useState<{ error?: string }>();
  const taskId = state.taskId;
  useEffect(() => {
    if (!campaignId || !taskId) return;
    closeBriefAction(taskId, state.campaignName, state.adAccount, campaignId).then(setClickup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);
  return clickup;
}
