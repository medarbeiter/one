"use client";

import { Badge, Banner, Button, Link, List, ListItem } from "@astryxdesign/core";
import { Infotafel } from "./angaben";
import { Sign } from "@/theme/icons";
import { label, plural } from "@/lib/labels";
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
 * Array-Position allein reicht auch für receipt.failed nicht mehr aus, seit die
 * Anzeigen aller Ad Sets als eine gemeinsame, nebenläufige Phase laufen:
 * Ad-Set-Anlage-Fehler und Anzeigen-Fehler entstehen in zwei
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
        <Banner status="error" title="Kampagne konnte nicht erstellt werden" description={label(error)} />
      )}
      {error && receipt && (
        <Banner
          status="warning"
          title="Kampagne erstellt, konnte aber nicht überprüft werden"
          description={
            <>
              Die Kampagne und die Anzeigen unten wurden bei Meta erstellt — nur die
              anschließende automatische Prüfung ist fehlgeschlagen: {label(error)}
            </>
          }
        />
      )}

      {receipt && (
        <>
          <Banner
            status={receipt.failed.length > 0 || error ? "warning" : "success"}
            title={
              <>
                Kampagne {receipt.campaignId ?? "erstellt"} — {receipt.adSets.length}{" "}
                Anzeigengruppe(n)
              </>
            }
            description={
              <>
                {receipt.adSets
                  .map((s) => `${s.name}: ${plural(s.adIds.length, "Anzeige", "Anzeigen")}`)
                  .join(", ")}
                {receipt.failed.length > 0 &&
                  ` — ${plural(receipt.failed.length, "Anzeige", "Anzeigen")} fehlgeschlagen`}
              </>
            }
          />

          {/* Vorher zwei Aufzählungen mit Doppelpunkten und Gedankenstrichen in
              einer Zeile: „Name: id — 3 Anzeigen — Fehler". Was davon der
              Schlüssel ist und was der Wert, stand nur in der Zeichensetzung.
              Jetzt eine Liste mit Haarstrichen: Name links, Id darunter, der
              Zähler als Marke am rechten Rand – dieselbe Zeile wie in der
              Standortliste der Überprüfung. */}
          <Infotafel titel="Was jetzt bei Meta steht">
            <List hasDividers density="spacious">
              <ListItem
                label={<span className="text-ink-500">Kampagne</span>}
                endContent={
                  <span className="font-medium tabular-nums">
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
                  </span>
                }
              />
              {receipt.adSets.map((s, i) => (
                <ListItem
                  key={`${s.name}-${i}`}
                  label={s.name}
                  description={
                    s.error ? (
                      <span className="text-danger-700">{label(s.error)}</span>
                    ) : (
                      <span className="tabular-nums">{s.id ?? "—"}</span>
                    )
                  }
                  endContent={
                    <Badge
                      variant={s.error ? "error" : "neutral"}
                      className="tabular-nums"
                      label={plural(s.adIds.length, "Anzeige", "Anzeigen")}
                    />
                  }
                />
              ))}
            </List>
          </Infotafel>
        </>
      )}

      {/* Haken und Kreuz sind gezeichnete Zeichen aus theme/icons.tsx, keine
          Unicode-Glyphen: „✓" und „✗" kommen aus zwei verschiedenen Blöcken,
          stehen je nach Schriftschnitt unterschiedlich hoch und fallen auf
          Systemen ohne Deckung auf eine Ersatzschrift zurück. */}
      {checks && (
        <Infotafel titel="Prüfung nach dem Anlegen">
          <List hasDividers density="spacious">
            {checks.map((c) => (
              // Das Zeichen trägt die Farbe, die Zeile nicht: eine ganze Zeile in
              // Grün gelesen zu bekommen, weil sie in Ordnung ist, macht aus einer
              // Prüfliste eine Ampel. Haken und Kreuz unterscheiden sich in der
              // Form, nicht nur im Ton – Farbe ist die Zugabe.
              <ListItem
                key={c.label}
                startContent={
                  <span className={c.ok ? "text-success-700" : "text-danger-700"}>
                    <Sign meaning={c.ok ? "confirm" : "close"} />
                  </span>
                }
                label={c.label}
                description={
                  !c.ok && c.detail ? (
                    <span className="text-danger-700">{label(c.detail)}</span>
                  ) : undefined
                }
              />
            ))}
          </List>
        </Infotafel>
      )}

      {receipt && receipt.failed.length > 0 && (
        <div className="flex flex-col items-start gap-3">
          <Infotafel
            titel={`${plural(receipt.failed.length, "Anzeige", "Anzeigen")} fehlgeschlagen`}
            className="w-full"
          >
            <List hasDividers density="spacious">
              {receipt.failed.map((f, i) => (
                <ListItem
                  key={`${f.adSetName}-${f.adName}-${i}`}
                  label={`${f.adSetName} / ${f.adName}`}
                  description={<span className="text-danger-700">{label(f.error)}</span>}
                />
              ))}
            </List>
          </Infotafel>
          <Button
            label="Fehlgeschlagene Anzeigen erneut versuchen"
            icon={<Sign meaning="retry" />}
            onClick={retry}
          />
        </div>
      )}
    </div>
  );
}
