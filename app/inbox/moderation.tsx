"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertDialog, Button, useToast } from "@astryxdesign/core";
import { Sign } from "@/theme/icons";
import { blockAuthorAction, deleteCommentAction, likeAction, markReadAction } from "./actions";

/**
 * Die beiden wegnehmenden Handgriffe. Beide sind bei Meta endgültig – deshalb
 * jeweils ein AlertDialog davor, mit der Folge im Klartext statt eines
 * "Sicher?" ohne Inhalt.
 *
 * Der Knopf zum Blockieren steht auch dann da, wenn Instagram es nicht kann:
 * ausgegraut mit dem Grund im Tooltip. Weglassen ließe die Frage offen, warum
 * es hier nicht geht und dort schon.
 */
export function ThreadActions({
  threadId,
  kind,
  authorName,
  blockHint,
  read = false,
}: {
  threadId: string;
  kind: "comment" | "dm";
  authorName: string;
  blockHint?: string;
  read?: boolean;
}) {
  const [offen, setOffen] = useState<"delete" | "block" | undefined>();
  const [pending, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();

  const run = (was: "delete" | "block") =>
    start(async () => {
      const r = was === "delete" ? await deleteCommentAction(threadId) : await blockAuthorAction(threadId);
      setOffen(undefined);
      if (r.error) {
        toast({ body: r.error, type: "error" });
        return;
      }
      toast({ body: r.ok! }); // Astryx kennt nur info und error – der Erfolg ist der Normalfall.
      if (was === "delete") {
        // Der gewählte Thread ist weg; mit ?thread= in der Adresse zeigte die
        // Detailspalte danach ins Leere.
        const next = new URLSearchParams(params);
        next.delete("thread");
        router.replace(next.size ? `${pathname}?${next}` : pathname);
      }
      router.refresh();
    });

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <ReadToggle threadId={threadId} read={read} />
      {kind === "comment" && (
        <Button
          label="Kommentar löschen"
          isIconOnly
          size="sm"
          variant="ghost"
          icon={<Sign meaning="remove" form="outline" />}
          isDisabled={pending}
          tooltip="Kommentar löschen"
          onClick={() => setOffen("delete")}
        />
      )}
      <Button
        label="Nutzer blockieren"
        isIconOnly
        size="sm"
        variant="ghost"
        icon={<Sign meaning="block" form="outline" />}
        isDisabled={pending || blockHint !== undefined}
        tooltip={blockHint ?? `${authorName} blockieren`}
        onClick={() => setOffen("block")}
      />

      <AlertDialog
        isOpen={offen === "delete"}
        onOpenChange={() => setOffen(undefined)}
        title="Kommentar löschen?"
        description={`Der Kommentar von ${authorName} verschwindet unter dem Beitrag bei Meta und lässt sich nicht wiederherstellen.`}
        cancelLabel="Abbrechen"
        actionLabel="Löschen"
        isActionLoading={pending}
        onAction={() => run("delete")}
      />
      <AlertDialog
        isOpen={offen === "block"}
        onOpenChange={() => setOffen(undefined)}
        title={`${authorName} blockieren?`}
        description="Diese Person kann auf der Seite des Kunden nicht mehr kommentieren oder schreiben. Bestehende Kommentare bleiben stehen."
        cancelLabel="Abbrechen"
        actionLabel="Blockieren"
        isActionLoading={pending}
        onAction={() => run("block")}
      />
    </div>
  );
}

/**
 * Der Schnellzugriff: ein Klick, kein Dialog, kein Öffnen des Threads. Das
 * Herz füllt sich sofort und fällt zurück, wenn Meta ablehnt – bei 1500
 * offenen Unterhaltungen ist Warten auf die Antwort das, was den Durchlauf
 * bremst.
 *
 * Wo Meta kein Liken anbietet (siehe likeHint in lib/inbox-moderate.ts), steht
 * der Knopf ausgegraut mit dem Grund im Tooltip statt gar nicht: sonst wirkt
 * die Liste je nach Kanal willkürlich unterschiedlich.
 */
export function LikeButton({
  threadId,
  messageId,
  liked = false,
  hint,
  size = "sm",
}: {
  threadId: string;
  messageId?: string;
  liked?: boolean;
  hint?: string;
  size?: "sm" | "md";
}) {
  const [an, setAn] = useState(liked);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const toggle = () => {
    if (!messageId) return;
    const ziel = !an;
    setAn(ziel);
    start(async () => {
      const r = await likeAction(threadId, messageId, ziel);
      if (r.error) {
        setAn(!ziel);
        toast({ body: r.error, type: "error" });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Button
      label={an ? "Like zurücknehmen" : "Liken"}
      isIconOnly
      size={size}
      variant="ghost"
      icon={
        <Sign
          meaning="like"
          form={an ? "solid" : "outline"}
          color={an ? "var(--color-error)" : undefined}
        />
      }
      isDisabled={pending || hint !== undefined || !messageId}
      tooltip={hint ?? (an ? "Like zurücknehmen" : "Liken")}
      onClick={toggle}
    />
  );
}

/**
 * Gelesen ist nicht beantwortet: manches ist mit dem Lesen erledigt – ein Lob,
 * ein Emoji, eine Absage. Beantwortet sortiert die Liste, gelesen räumt den
 * Blick auf; deshalb ein eigener Knopf und keine zweite Bedeutung für
 * "beantwortet".
 */
export function ReadToggle({ threadId, read }: { threadId: string; read: boolean }) {
  const [an, setAn] = useState(read);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const toggle = () => {
    const ziel = !an;
    setAn(ziel);
    start(async () => {
      const r = await markReadAction(threadId, ziel);
      if (r.error) {
        setAn(!ziel);
        toast({ body: r.error, type: "error" });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Button
      label={an ? "Als ungelesen markieren" : "Als gelesen markieren"}
      isIconOnly
      size="sm"
      variant="ghost"
      icon={
        <Sign
          meaning="confirm"
          form={an ? "solid" : "outline"}
          color={an ? "var(--color-text-accent)" : undefined}
        />
      }
      isDisabled={pending}
      tooltip={an ? "Als ungelesen markieren" : "Als gelesen markieren"}
      onClick={toggle}
    />
  );
}
