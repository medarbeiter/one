"use client";

import { useCallback, useRef, useState } from "react";
import type { LaunchProgress } from "@/lib/launch";
import type { LaunchEvent } from "@/lib/launch-request";
import { readNdjson } from "@/lib/ndjson";
import { refreshCampaignsAction, type LaunchState, type WizardSubmission } from "../actions";

/**
 * Anlegen mit laufender Rückmeldung. Der Route Handler schickt NDJSON – eine
 * Meldung je Zeile –, hier wird jede Zeile sofort in den State gelegt, statt
 * auf das Ende zu warten. Genau das ist der Unterschied zu vorher: dreißig
 * Aufrufe gegen Meta hinter einem einzigen "Creating…".
 */
export function useLaunch() {
  const [result, setResult] = useState<LaunchState>({});
  const [progress, setProgress] = useState<LaunchProgress>();
  const [pending, setPending] = useState(false);
  // Ein zweiter Klick auf "Create" würde sonst eine zweite Kampagne anlegen.
  const running = useRef(false);

  const run = useCallback(async (input: WizardSubmission) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setResult({});
    // Der Nenner ist erst bekannt, wenn der Server geprüft hat – bis dahin nur
    // die Beschriftung, damit nicht sofort "0 / 0" dasteht.
    setProgress({ label: "Die Kampagne wird geprüft, bevor irgendetwas angelegt wird", done: 0, total: 0 });

    // Die letzte Quittung aus dem Strom: reißt er ab, steht damit, was schon
    // angelegt ist – und der Retry-Pfad hat etwas, worauf er aufsetzen kann.
    let partial: LaunchState["receipt"];
    try {
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.body) throw new Error(`Der Server antwortete mit ${res.status} und ohne Inhalt.`);

      for await (const event of readNdjson<LaunchEvent>(res.body)) {
        if (event.type === "progress") {
          if (event.receipt?.campaignId) partial = event.receipt;
          setProgress(event);
        } else {
          setResult(event);
          // Erst wenn wirklich etwas angelegt wurde – sonst wird ein Cache
          // verworfen, in dem sich nichts geändert hat.
          if (event.receipt?.campaignId) await refreshCampaignsAction();
        }
      }
    } catch (e) {
      // Ein abgerissener Stream heißt nicht, dass nichts angelegt wurde. Das
      // muss dastehen, sonst legt jemand dieselbe Kampagne ein zweites Mal an.
      setResult({
        error: partial
          ? `${(e as Error).message} — die Verbindung riss ab. Unten steht, was bis dahin angelegt wurde; die fehlenden Anzeigen lassen sich nachholen.`
          : `${(e as Error).message} — die Kampagne kann teilweise angelegt worden sein. Sieh in der Kampagnentabelle nach, bevor du sie erneut anlegst.`,
        ...(partial ? { receipt: partial } : {}),
      });
      if (partial) await refreshCampaignsAction();
    } finally {
      setProgress(undefined);
      setPending(false);
      running.current = false;
    }
  }, []);

  /** Für „Neue Kampagne beginnen“: die Quittung der letzten gehört nicht zur nächsten. */
  const clear = useCallback(() => setResult({}), []);

  return { result, progress, pending, run, clear };
}
