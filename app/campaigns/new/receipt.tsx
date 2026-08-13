"use client";

import { Alert, Button, Link } from "@heroui/react";
import { label } from "@/lib/labels";
import type { Receipt } from "@/lib/launch";
import type { LaunchState, WizardSubmission } from "../actions";

// Ads Manager erwartet die Konto-ID ohne "act_"-Präfix als act=-Parameter,
// selected_campaign_ids markiert die Zeile in der Tabelle vorausgewählt.
const campaignUrl = (adAccount: string, campaignId: string) =>
  `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccount.replace(/^act_/, "")}&selected_campaign_ids=${campaignId}`;

/**
 * Baut die adSets für einen Retry: nur die Ad Sets mit Fehlern, und darin nur
 * die fehlgeschlagenen Anzeigen. Reine Funktion statt Closure in retry(),
 * damit die Zuordnungslogik ohne Rendering testbar ist (receipt.test.ts).
 *
 * receipt.adSets[].index und receipt.failed[].adSetIndex sind von launch()
 * explizit gesetzt (siehe lib/launch.ts) und referenzieren dieselbe Position
 * in submission.adSets – die Zuordnung läuft also über diesen Index, nicht
 * über Array-Position oder Namen. Ein Name-Lookup (submission.adSets.find)
 * wäre riskant: Ad-Set-Namen sind vom Bediener frei editierbar und nicht
 * eindeutig, ein find() könnte den falschen Eintrag treffen oder undefined
 * liefern und crashen.
 *
 * Array-Position allein reicht seit der flachen Job-Liste (Task 5) auch für
 * receipt.failed nicht mehr aus, und mit dem Anzeigen-Pool (Task 6) erst
 * recht nicht: Ad-Set-Anlage-Fehler und Anzeigen-Fehler entstehen in zwei
 * getrennten Phasen (erst alle Ad Sets, dann – nebenläufig – alle Anzeigen),
 * und innerhalb der Anzeigen-Phase ist die Fertigstellungs-, nicht mehr die
 * Eingabereihenfolge maßgeblich. Scheitert zum Beispiel ein späteres Ad Set
 * schon beim Anlegen, landet sein Fehler in receipt.failed vor dem Fehler
 * einer einzelnen Anzeige aus einem früheren, erfolgreich angelegten Ad Set –
 * ein fortlaufender Zeiger (cursor), der Fehler nach ads.length -
 * adIds.length abschneidet, griffe hier bereits ohne jeden Pool daneben (das
 * war schon vor dem Pool ein Bug, siehe Commit 86923bd). Die Gruppierung nach
 * adSetIndex ist unabhängig von beiden Reihenfolgen richtig.
 *
 * Innerhalb eines derart korrekt zugeordneten Ad Sets bleibt die Auswahl der
 * einzelnen Anzeigen namensbasiert (AdInput trägt keine stabile Id) – das ist
 * unverändert die bestehende, hier nicht behobene Einschränkung bei
 * doppelten Anzeigennamen innerhalb desselben Ad Sets.
 */
export function buildRetryAdSets(
  receipt: Receipt,
  submission: WizardSubmission,
): WizardSubmission["adSets"] {
  const failedByAdSet = new Map<number, Receipt["failed"]>();
  for (const f of receipt.failed) {
    const list = failedByAdSet.get(f.adSetIndex);
    if (list) list.push(f);
    else failedByAdSet.set(f.adSetIndex, [f]);
  }
  return receipt.adSets
    .map((set) => {
      const original = submission.adSets[set.index];
      if (!original) return null;
      const ownFailed = failedByAdSet.get(set.index);
      if (!ownFailed?.length) return null;
      const failedNames = new Set(ownFailed.map((f) => f.adName));
      const ads = original.ads.filter((a) => failedNames.has(a.name));
      return ads.length ? { ...original, ads, existingAdSetId: set.id } : null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
}

export function ReceiptPanel({
  state,
  submission,
  onRetry,
}: {
  state: LaunchState;
  submission: WizardSubmission;
  onRetry: (input: WizardSubmission) => void;
}) {
  const { receipt, checks, error } = state;
  if (!receipt && !error) return null;

  const campaignHref =
    submission.adAccount && receipt?.campaignId
      ? campaignUrl(submission.adAccount, receipt.campaignId)
      : undefined;

  const retry = () => {
    if (!receipt?.campaignId) return;

    // Zuordnungslogik in buildRetryAdSets() oben – Begründung dort.
    const adSets = buildRetryAdSets(receipt, submission);

    onRetry({ ...submission, existingCampaignId: receipt.campaignId, adSets });
  };

  return (
    <div className="space-y-4">
      {/* launchAction liefert error+receipt zusammen, wenn die Kampagne bereits
          angelegt wurde und nur das Auslesen zur Prüfung fehlschlug (Best-Effort,
          siehe app/campaigns/actions.ts) – ohne diese Unterscheidung würde "Could
          not create" die Person zu einer zweiten, doppelten Kampagne verleiten. */}
      {error && !receipt && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>Kampagne konnte nicht erstellt werden</Alert.Title>
            <Alert.Description>{label(error)}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {error && receipt && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>Kampagne erstellt, konnte aber nicht überprüft werden</Alert.Title>
            <Alert.Description>
              Die Kampagne und die Anzeigen unten wurden bei Meta erstellt — nur die
              anschließende automatische Prüfung ist fehlgeschlagen: {label(error)}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {receipt && (
        <>
          <Alert status={receipt.failed.length > 0 || error ? "warning" : "success"}>
            <Alert.Content>
              <Alert.Title>
                Kampagne {receipt.campaignId ?? "erstellt"} — {receipt.adSets.length}{" "}
                Anzeigengruppe(n)
              </Alert.Title>
              <Alert.Description>
                {receipt.adSets
                  .map((s) => `${s.name}: ${s.adIds.length} Anzeige(n)`)
                  .join(", ")}
                {receipt.failed.length > 0 &&
                  ` — ${receipt.failed.length} Anzeige(n) fehlgeschlagen`}
              </Alert.Description>
            </Alert.Content>
          </Alert>

          <div className="space-y-1 text-sm">
            <p>
              <strong>Kampagne:</strong>{" "}
              {receipt.campaignId ? (
                campaignHref ? (
                  <Link href={campaignHref} target="_blank" rel="noreferrer">
                    {receipt.campaignId}
                  </Link>
                ) : (
                  receipt.campaignId
                )
              ) : (
                "—"
              )}
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {receipt.adSets.map((s, i) => (
                <li key={`${s.name}-${i}`}>
                  {s.name}: {s.id ?? "—"} — {s.adIds.length} Anzeige(n)
                  {s.error ? ` — ${label(s.error)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {checks && (
        <ul className="space-y-1 text-sm">
          {checks.map((c) => (
            <li key={c.label} className={c.ok ? "text-success" : "text-danger"}>
              {c.ok ? "✓" : "✗"} {c.label}
              {!c.ok && c.detail ? ` — ${label(c.detail)}` : ""}
            </li>
          ))}
        </ul>
      )}

      {receipt && receipt.failed.length > 0 && (
        <div className="space-y-2">
          <ul className="list-disc space-y-1 pl-5 text-sm text-danger">
            {receipt.failed.map((f, i) => (
              <li key={`${f.adSetName}-${f.adName}-${i}`}>
                {f.adSetName} / {f.adName}: {label(f.error)}
              </li>
            ))}
          </ul>
          <Button onPress={retry}>Fehlgeschlagene Anzeigen erneut versuchen</Button>
        </div>
      )}
    </div>
  );
}
