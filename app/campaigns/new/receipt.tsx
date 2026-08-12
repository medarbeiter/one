"use client";

import { Alert, Button, Link } from "@heroui/react";
import { label } from "@/lib/labels";
import type { LaunchState, WizardSubmission } from "../actions";

// Ads Manager erwartet die Konto-ID ohne "act_"-Präfix als act=-Parameter,
// selected_campaign_ids markiert die Zeile in der Tabelle vorausgewählt.
const campaignUrl = (adAccount: string, campaignId: string) =>
  `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccount.replace(/^act_/, "")}&selected_campaign_ids=${campaignId}`;

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

    // receipt.adSets ist von launch() Eintrag für Eintrag aus submission.adSets
    // in genau derselben Reihenfolge aufgebaut (siehe lib/launch.ts) – der Index
    // liefert also verlässlich das passende Original. Ein Name-Lookup
    // (submission.adSets.find(name)) wäre hier riskant: Ad-Set-Namen sind vom
    // Bediener frei editierbar und nicht eindeutig, ein find() könnte den
    // falschen Eintrag treffen oder undefined liefern und crashen.
    //
    // Aus demselben Grund darf auch die Zuordnung der einzelnen Fehleinträge
    // nicht über adSetName laufen: teilen sich zwei Ad Sets Namen UND
    // Dateiname, würde ein bereits erfolgreiches Video im falschen Ad Set
    // erneut angelegt. receipt.failed wird von launch() aber Ad Set für Ad
    // Set, Video für Video in genau dieser Reihenfolge befüllt – die Anzahl
    // der zu einem Ad Set gehörenden Fehler ergibt sich also eindeutig aus
    // videos.length - adIds.length, unabhängig vom Namen. Ein Zeiger, der
    // ausschließlich in dieser Reihenfolge vorrückt, schneidet damit den
    // richtigen Ausschnitt heraus, auch bei doppelten Namen/Dateinamen.
    let cursor = 0;
    const adSets = receipt.adSets
      .map((set, i) => {
        const original = submission.adSets[i];
        if (!original) return null;
        const failedCount = original.videos.length - set.adIds.length;
        const ownFailed = receipt.failed.slice(cursor, cursor + failedCount);
        cursor += failedCount;
        const failedNames = new Set(ownFailed.map((f) => f.fileName));
        const videos = original.videos.filter((v) => failedNames.has(v.fileName));
        return videos.length
          ? { ...original, videos, existingAdSetId: set.id }
          : null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

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
            <Alert.Title>Could not create the campaign</Alert.Title>
            <Alert.Description>{label(error)}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {error && receipt && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>Campaign created, but could not be verified</Alert.Title>
            <Alert.Description>
              The campaign and ads below were created on Meta — only the automatic
              check afterwards failed: {label(error)}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {receipt && (
        <>
          <Alert status={receipt.failed.length > 0 || error ? "warning" : "success"}>
            <Alert.Content>
              <Alert.Title>
                Campaign {receipt.campaignId ?? "created"} — {receipt.adSets.length} ad
                set(s)
              </Alert.Title>
              <Alert.Description>
                {receipt.adSets
                  .map((s) => `${s.name}: ${s.adIds.length} ad(s)`)
                  .join(", ")}
                {receipt.failed.length > 0 &&
                  ` — ${receipt.failed.length} file(s) failed`}
              </Alert.Description>
            </Alert.Content>
          </Alert>

          <div className="space-y-1 text-sm">
            <p>
              <strong>Campaign:</strong>{" "}
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
                  {s.name}: {s.id ?? "—"} — {s.adIds.length} ad(s)
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
              <li key={`${f.adSetName}-${f.fileName}-${i}`}>
                {f.adSetName} / {f.fileName}: {label(f.error)}
              </li>
            ))}
          </ul>
          <Button onPress={retry}>Retry failed ads</Button>
        </div>
      )}
    </div>
  );
}
