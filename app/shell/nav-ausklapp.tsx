"use client";

import { Badge, Button, HStack, StatusDot, Text, VStack } from "@astryxdesign/core";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { Sign, type Meaning } from "@/theme/icons";

/**
 * Was ein Navigationseintrag zeigt, wenn man ihn aufklappt — 1:1 aus dem Hub
 * übernommen (components/nav-ausklapp.tsx). Kein Überhang, keine schwebende
 * Karte: der Eintrag wächst an Ort und Stelle, die Einträge darunter rücken
 * nach. Die Bewegung dazu kommt aus Astryx selbst — `SideNavItem` mit
 * `collapsible` blendet seine Kinder über `grid-template-rows: 0fr → 1fr` ein.
 */

/**
 * Der Faden, an dem die Kinder eines Eintrags hängen — wie ein Diskussionsbaum:
 * eine senkrechte Linie unter dem Zeichen des Eintrags, von der aus ein kurzer
 * Steg zu jedem Kind abgeht. Maße und Bewegung siehe `.nav-zweig` in globals.css.
 */
export function NavZweig({ offen, children }: { offen: boolean; children: ReactNode }) {
  return (
    <span className="nav-zweig" data-offen={offen ? "true" : "false"}>
      {children}
    </span>
  );
}

export interface NavAktion {
  meaning: Meaning;
  label: string;
  /** Entweder ein Ziel … */
  href?: string;
  /** … oder eine Handlung. Genau eines von beidem. */
  onClick?: () => void;
  /** Lädt eine Datei herunter, statt zu navigieren. */
  download?: boolean;
  isDisabled?: boolean;
}

/** Der Stand: ein Punkt, ein Satz, ein leiser Nachsatz. */
export function NavStand({
  ton,
  text,
  pulsiert,
  zusatz,
}: {
  ton: "accent" | "warning" | "neutral";
  text: string;
  pulsiert?: boolean;
  zusatz?: string;
}) {
  return (
    <VStack className="nav-zweig-stand" gap={0.5} paddingBlock={1}>
      <HStack gap={2} vAlign="center" wrap="nowrap">
        <StatusDot variant={ton} label={text} isPulsing={pulsiert} />
        <Text type="label" size="sm" weight="medium">
          {text}
        </Text>
      </HStack>
      {zusatz && (
        <Text type="supporting" size="sm" color="secondary" hasTabularNumbers>
          {zusatz}
        </Text>
      )}
    </VStack>
  );
}

/** Die Handlungen unter dem Stand. Die erste ist die goldene. */
export function NavAktionen({ aktionen }: { aktionen: NavAktion[] }) {
  if (aktionen.length === 0) return null;
  return (
    <>
      {aktionen.map((a, i) => (
        <NavKnopf key={a.label} aktion={a} betont={i === 0} />
      ))}
    </>
  );
}

function NavKnopf({ aktion, betont }: { aktion: NavAktion; betont: boolean }) {
  const knopf = (
    <Button
      label={aktion.label}
      variant={betont ? "primary" : "secondary"}
      size="sm"
      width="100%"
      isDisabled={aktion.isDisabled}
      icon={<Sign meaning={aktion.meaning} size={14} />}
      onClick={aktion.href ? undefined : aktion.onClick}
      style={{
        justifyContent: "center",
        boxShadow: betont
          ? "inset 0 0 0 1px var(--color-icon-accent)"
          : "inset 0 0 0 1px var(--color-text-secondary)",
      }}
    />
  );

  if (!aktion.href) return knopf;

  if (aktion.download) {
    return (
      <a href={aktion.href} download style={{ textDecoration: "none", display: "block" }}>
        {knopf}
      </a>
    );
  }
  return (
    <Link href={aktion.href} style={{ textDecoration: "none", display: "block" }}>
      {knopf}
    </Link>
  );
}

/**
 * Die Hülle eines Eintrags — und der Ort, an dem ein Ruf überlebt. Eingeklappt
 * lässt Astryx das `endContent` weg; statt der Zahl steht dann ein Punkt an
 * der Ecke des Zeichens (siehe `.nav-eintrag[data-ruft]` in globals.css).
 */
export function NavEintrag({
  ruft,
  onPointerEnter,
  onPointerLeave,
  children,
}: {
  ruft?: boolean;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  children: ReactNode;
}) {
  return (
    <span
      className="nav-eintrag"
      data-ruft={ruft ? "true" : "false"}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </span>
  );
}

/**
 * Aufklappen durch Verweilen. Nach einer halben Sekunde über dem Eintrag
 * klappt er von selbst auf — beim bloßen Überqueren der Leiste passiert
 * nichts, erst das Verweilen gilt als Absicht.
 *
 * Wer selbst auf das Winkelzeichen geklickt hat, hat sich entschieden: ein so
 * geöffneter Eintrag bleibt offen, bis er wieder geklickt wird. Nur was das
 * Verweilen geöffnet hat, schließt das Weggehen auch wieder. Auf Geräten ohne
 * Zeiger bleibt alles beim Klick — `(hover: hover)` schließt das Verweilen
 * dort aus.
 */
export function NavVerweilen({
  istOffen,
  oeffnen,
  schliessen,
  aus,
  ruft,
  children,
}: {
  istOffen: boolean;
  oeffnen: () => void;
  schliessen: () => void;
  /** Stillgelegt — in der eingeklappten Schiene, wo Astryx den Eintrag als Überhang öffnet. */
  aus?: boolean;
  ruft?: boolean;
  children: ReactNode;
}) {
  const auf = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zu = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zeigergeraet = useRef(false);

  useEffect(() => {
    zeigergeraet.current = window.matchMedia("(hover: hover)").matches;
    return () => {
      if (auf.current) clearTimeout(auf.current);
      if (zu.current) clearTimeout(zu.current);
    };
  }, []);

  const betreten = () => {
    if (aus || !zeigergeraet.current) return;
    if (zu.current) clearTimeout(zu.current);
    if (istOffen) return;
    auf.current = setTimeout(oeffnen, 500);
  };

  const verlassen = () => {
    if (aus || !zeigergeraet.current) return;
    if (auf.current) clearTimeout(auf.current);
    zu.current = setTimeout(schliessen, 260);
  };

  return (
    <NavEintrag ruft={ruft} onPointerEnter={betreten} onPointerLeave={verlassen}>
      {children}
    </NavEintrag>
  );
}

/** Die Zahl am Eintrag — die, die eine Handlung verlangt. Null erscheint nie. */
export function NavZahl({ wert }: { wert: number }) {
  if (wert <= 0) return null;
  return <Badge variant="warning" label={String(wert)} />;
}

/** Die Auskunft am Eintrag: fordert nichts, trägt deshalb keine Marke. */
export function NavKunde({ wert, wort }: { wert: number; wort: string }) {
  if (wert <= 0) return null;
  return (
    <Text type="supporting" size="sm" color="secondary" hasTabularNumbers>
      {wert} {wort}
    </Text>
  );
}
