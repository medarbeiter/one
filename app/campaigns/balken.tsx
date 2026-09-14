import { Text } from "@astryxdesign/core";

/**
 * Ein Verlauf als Balken je Tag – handgezeichnetes SVG, weil Astryx kein
 * Diagramm mitbringt. Eine Reihe je Bild, kein zweiter Maßstab: Ausgaben und
 * Leads stehen als zwei Bilder nebeneinander statt auf zwei Achsen in einem.
 * Der Balken trägt Ink, nicht Gold (Gold benennt hier keinen Gegenstand,
 * DESIGN.md); jeder Balken nennt beim Zeigen seinen Tag und Wert.
 */
export function Balken({
  titel,
  werte,
  format,
}: {
  titel: string;
  werte: Array<{ tag: string; wert: number }>;
  format: (n: number) => string;
}) {
  const max = Math.max(0, ...werte.map((w) => w.wert));
  const W = 600;
  const H = 120;
  const luecke = 2;
  const breite = werte.length ? (W - luecke * (werte.length - 1)) / werte.length : W;
  const datum = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  const summe = werte.reduce((s, w) => s + w.wert, 0);

  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-3">
        <Text type="label" size="sm">{titel}</Text>
        <Text type="supporting" size="sm" color="secondary" hasTabularNumbers>
          {format(summe)} · Höchstwert {format(max)}
        </Text>
      </figcaption>
      {werte.length === 0 || max === 0 ? (
        <div className="text-ink-500 flex h-[120px] items-center justify-center text-xs">Nichts in den letzten 30 Tagen.</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[120px] w-full" role="img" aria-label={`${titel} je Tag`}>
          <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke="var(--color-border-emphasized)" />
          {werte.map((w, i) => {
            const h = Math.max(w.wert > 0 ? 2 : 0, (w.wert / max) * (H - 4));
            return (
              <g key={w.tag} className="balken">
                {/* Trefferfläche über die volle Höhe – ein 2px-Balken ist kein Ziel. */}
                <rect x={i * (breite + luecke)} y="0" width={breite} height={H} fill="transparent" />
                <rect x={i * (breite + luecke)} y={H - h} width={breite} height={h} rx="2" fill="var(--color-icon-secondary)" />
                <title>{`${datum(w.tag)}: ${format(w.wert)}`}</title>
              </g>
            );
          })}
        </svg>
      )}
      {werte.length > 0 && (
        <div className="text-ink-500 flex justify-between text-xs tabular-nums">
          <span>{datum(werte[0].tag)}</span>
          <span>{datum(werte[werte.length - 1].tag)}</span>
        </div>
      )}
    </figure>
  );
}
