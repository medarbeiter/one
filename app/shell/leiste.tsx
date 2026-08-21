"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Suche } from "@/app/shell/suche";

/**
 * Die Leiste — das oberste Stück des Kopfbands, auf jeder Route dieselbe
 * Stelle: die Suche links, die Angaben daneben, die eine stehende Handlung
 * rechts. 1:1 aus dem Hub übernommen (components/clock-bar.tsx dort, dort mit
 * den Stempelhandlungen gefüllt).
 *
 * Sie ist kein eigenes weißes Band über dem Kopf, sondern trägt die volle
 * Goldwäsche, aus der das Kopfband darunter ausblendet — Leiste und Kopf sind
 * EINE Fläche (die Kopfband-Ausnahme der Gold-ist-Marke-Regel, siehe
 * DESIGN.md). Deshalb steht sie im Fluss des scrollenden Blattes und klebt
 * dort, statt außerhalb davon zu hängen: nur so kann sie beim Rollen über den
 * Kopf laufen und sich dabei ihre Kante zurückholen.
 */
export function Leiste({ children, aktion }: { children?: ReactNode; aktion?: ReactNode }) {
  /**
   * Schwebt die Leiste? In Ruhe ist sie Teil der Wäsche und trägt keine eigene
   * Kante; erst wenn sie beim Rollen über fremdem Inhalt steht, bekommt sie
   * Haarstrich und Schatten zurück (`.leiste[data-schwebt]` in globals.css).
   * Der Fühler ist ein unsichtbares Element unmittelbar über der Leiste:
   * verlässt es das Bild, ist die Leiste festgeklebt. Kein Scroll-Horchen,
   * keine Layout-Rechnung pro Bild.
   */
  const fuehler = useRef<HTMLSpanElement>(null);
  const [schwebt, setSchwebt] = useState(false);
  useEffect(() => {
    const ziel = fuehler.current;
    if (!ziel) return;
    const beobachter = new IntersectionObserver(([eintrag]) => {
      setSchwebt(!eintrag!.isIntersecting);
    });
    beobachter.observe(ziel);
    return () => beobachter.disconnect();
  }, []);

  return (
    <>
      <span ref={fuehler} className="leiste-fuehler" aria-hidden />
      <div
        className="leiste flex flex-wrap items-center gap-3 px-5 py-2"
        data-schwebt={schwebt ? "true" : "false"}
      >
        <Suche />
        {children}
        <div className="ml-auto flex items-center gap-2">{aktion}</div>
      </div>
    </>
  );
}
