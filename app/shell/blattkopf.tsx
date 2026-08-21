import type { ReactNode } from "react";
import { Heading, Text } from "@astryxdesign/core";
import { Sign, type Meaning } from "@/theme/icons";
import { Zahlwert } from "./zahlwert";

/**
 * Der Kopf, in den jedes Blatt dieses Hauses gegossen wird — 1:1 aus dem Hub
 * übernommen (components/zeit-rahmen.tsx dort, dort `ZeitRahmen`).
 *
 * Vorher erfand jede Seite ihre eigene Überschrift: mal H1 plus Zähler-Badge,
 * mal H1 plus Chip plus grauer Zusatz, und die Handlungen standen dort, wo
 * gerade Platz war. Jetzt bewegt sich zwischen zwei Seiten nichts mehr —
 * nur der Inhalt der Bänder wechselt.
 *
 * Das Band trägt die Goldwäsche (`.header-band`), das Blatt darin ist auf
 * 1180px gedeckelt (`.blatt`): über einen 1900px-Schirm gezogen hört eine
 * dichte Tabelle auf, lesbar zu sein, und die Seite liest sich als unfertig
 * statt als großzügig.
 */
interface BlattkopfProps {
  /** Die Überschrift: der Name dessen, worauf man steht. */
  titel: string;
  /**
   * Das Zeichen der Seite — dasselbe, unter dem sie in der Seitenleiste steht.
   * Wer irgendwo ankommt, sieht das Zeichen, dem er gefolgt ist.
   */
  meaning?: Meaning;
  /**
   * Die eine Zahl, um die es auf diesem Blatt geht. Genau eine je Ansicht.
   * Sie rollt herein, wenn sie sich ändert (app/shell/zahlwert.tsx).
   */
  figur?: ReactNode;
  /** Woran die Zahl gemessen wird, daneben. */
  figurEinheit?: ReactNode;
  /** Geld und Zähler lesen sich als Tatsache; ein Saldo liest positiv/negativ. */
  figurTon?: "sachlich" | "positiv" | "negativ";
  /** Ein Satz dazu, wie das Blatt gerade steht. */
  stand?: ReactNode;
  /** Marken, die dem Blatt als Ganzem gehören (Status, Zugriff, Zähler). */
  marken?: ReactNode;
  /** Werkzeuge des Blattes: Ausgaben, Sammelhandlungen. Rechts, unter den Marken. */
  werkzeuge?: ReactNode;
  /** Der Navigator (app/shell/navigator.tsx). Am Fuß des Bandes. */
  nav?: ReactNode;
}

const TON: Record<NonNullable<BlattkopfProps["figurTon"]>, string> = {
  sachlich: "var(--color-text-primary)",
  positiv: "var(--color-text-accent)",
  negativ: "var(--color-error)",
};

export function Blattkopf(props: BlattkopfProps) {
  const ton = TON[props.figurTon ?? "sachlich"];
  return (
    <div className="header-band">
      <div className="blatt kopf-blatt flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              {props.meaning && (
                <Sign
                  meaning={props.meaning}
                  size={24}
                  color="var(--color-icon-secondary)"
                />
              )}
              <Heading level={1}>{props.titel}</Heading>
            </div>
            {props.figur !== undefined && (
              <div className="kopf-figur flex flex-wrap items-end gap-2">
                <Text type="display-1" hasTabularNumbers color="inherit">
                  <span style={{ color: ton }}>
                    <Zahlwert wert={props.figur} />
                  </span>
                </Text>
                {props.figurEinheit && (
                  <Text type="large" color="secondary" hasTabularNumbers>
                    {props.figurEinheit}
                  </Text>
                )}
              </div>
            )}
            {props.stand && (
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {props.stand}
              </Text>
            )}
          </div>
          {(props.marken || props.werkzeuge) && (
            <div className="flex flex-col items-end gap-3">
              {props.marken && (
                <div className="flex flex-wrap items-center justify-end gap-2">{props.marken}</div>
              )}
              {props.werkzeuge && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {props.werkzeuge}
                </div>
              )}
            </div>
          )}
        </div>
        {props.nav}
      </div>
    </div>
  );
}

/**
 * Das Blatt unter dem Kopf: derselbe Deckel, derselbe Rand, auf jeder Seite.
 * Die Seiten setzen ihren Innenabstand nicht mehr selbst — `main` hat keinen
 * mehr, weil die Goldwäsche sonst nicht bis an die Fensterkante liefe.
 */
export function Blatt({ children }: { children: ReactNode }) {
  return <div className="blatt flex flex-col gap-5 px-5 py-5">{children}</div>;
}
