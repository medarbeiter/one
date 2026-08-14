/**
 * Anlegen mit laufender Rückmeldung. Bewusst ein Route Handler und keine Server
 * Action: eine Action antwortet genau einmal, am Ende. Eine Kampagne mit drei
 * Anzeigengruppen à fünf Anzeigen sind über dreißig Aufrufe nacheinander gegen
 * Metas Server – bis dahin stand in der Oberfläche eine Minute lang "Creating…"
 * und nichts unterschied ein Hängen von normalem Arbeiten.
 *
 * Der Cache bleibt Sache der Server Action: updateTag() gibt es hier nicht
 * (siehe Next-Doku zu updateTag), deshalb ruft der Client danach
 * refreshCampaignsAction() – ohne das stünde die neue Kampagne bis zu 60
 * Sekunden lang nicht in der Tabelle.
 */
import { geoLocations } from "@/lib/geo";
import { launch, launchSteps, type Receipt } from "@/lib/launch";
import { resolveLaunch, type LaunchEvent, type WizardSubmission } from "@/lib/launch-request";
import { ndjsonSink } from "@/lib/ndjson";
import { verifyCampaign } from "@/lib/verify";

export async function POST(request: Request) {
  const input = (await request.json()) as WizardSubmission;
  const sink = ndjsonSink<LaunchEvent>();

  // Bewusst nicht awaited: die Antwort geht sofort raus, die Meldungen tröpfeln
  // hinterher. Ein await hier gäbe wieder die eine Antwort am Ende.
  void (async () => {
    const resolved = await resolveLaunch(input);
    if ("error" in resolved) return sink.push({ type: "result", error: resolved.error });

    const plan = { ...input, ...resolved };
    // Der Nenner steht vor dem ersten Aufruf fest, damit die Anzeige nicht bei
    // "1 von 1" beginnt und sich dann nach hinten verschiebt.
    const total = launchSteps(plan);

    let receipt: Receipt;
    try {
      receipt = await launch(plan, {
        onProgress: (p) => sink.push({ type: "progress", ...p }),
      });
    } catch (e) {
      return sink.push({ type: "result", error: (e as Error).message });
    }

    // Verifikation ist Best-Effort: die Kampagne existiert bei Meta bereits und
    // die Receipt ist der einzige Griff für den Retry-Pfad – ein Lesefehler
    // danach darf sie nicht verschlucken.
    if (!receipt.campaignId) return sink.push({ type: "result", receipt });

    sink.push({ type: "progress", label: "Wird überprüft, was erstellt wurde", done: total, total });
    try {
      const checks = await verifyCampaign(receipt.campaignId, {
        formIds: Object.fromEntries(input.adSets.map((s) => [s.name, s.formId])),
        // Derselbe Bauplan, der auch an Meta ging (lib/geo.ts) – die Prüfung
        // vergleicht damit gegen das Geschickte und nicht gegen eine zweite,
        // hier nachgebaute Erwartung, die auseinanderlaufen könnte.
        geo: Object.fromEntries(input.adSets.map((s) => [s.name, geoLocations(s)])),
        adCount: input.adSets.reduce((n, s) => n + s.ads.length, 0),
      });
      sink.push({ type: "result", receipt, checks });
    } catch (e) {
      sink.push({ type: "result", receipt, error: (e as Error).message });
    }
  })()
    .catch((e: Error) => sink.push({ type: "result", error: e.message }))
    .finally(() => sink.close());

  return new Response(sink.stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      // Ein Proxy, der puffert, macht den Stream wieder zu einer Antwort am Ende.
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
