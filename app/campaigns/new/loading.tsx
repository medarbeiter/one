import { Fragment } from "react";
import * as UI from "@/app/shell/ui";
import { Card, Skeleton } from "@/app/shell/ui";
import { Blatt, Blattkopf } from "@/app/shell/blattkopf";

/**
 * Der Assistent kann erst gebaut werden, wenn die Kunden- und Kontenliste da
 * ist – ein Graph-Aufruf über 200+ Kunden. Ohne diese Fläche passiert nach dem
 * Klick sichtbar nichts, und genau dann wird ein zweites Mal geklickt.
 */
export default function Loading() {
  return (
    <div aria-busy>
      <Blattkopf
        titel="Neue Kampagne"
        meaning="add"
        stand="Deine Werbekonten und Kunden werden geladen…"
      />
      <Blatt>
        {/* Dieselbe Geometrie wie Schritt 1 des Assistenten (wizard.tsx,
            `Step`): Schrittleiste, dann 24 px Rand, Überschrift, ein Satz,
            24 px, das Kundenfeld. Weicht das hier ab, springt die Fläche in
            dem Moment, in dem die Kundenliste ankommt. */}
        <Card elevation="low" padding={0}>
          {/* Marke, Beschriftung, Verbinder – dieselbe Schiene wie stepper.tsx,
              bis auf die Maße: 28-px-Marken, 36 px Luft nach oben, keine Linie
              darunter. */}
          <div className="flex items-center px-4 pt-6 pb-1">
            {[0, 1, 2, 3].map((i) => (
              <Fragment key={i}>
                <div className="flex items-center gap-2.5 px-2 py-3">
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <Skeleton className="hidden h-4 w-20 rounded-lg sm:block" />
                </div>
                {i < 3 && <Skeleton className="h-0.5 min-w-4 flex-1 rounded-full" />}
              </Fragment>
            ))}
          </div>
          <UI.CardContent
            className="flex flex-col gap-6 p-6"
            aria-label="Kunden und Werbekonten werden geladen"
          >
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <Skeleton className="h-5 w-64 max-w-full rounded-lg" />
                <Skeleton className="h-3 w-96 max-w-full rounded-lg" />
              </div>
              {/* Kein Skeleton: der Haarstrich unter der Frage steht auch im
                  fertigen Schritt genau hier und ist nichts, was noch lädt. */}
              <div className="bg-line h-px w-full" />
            </div>
            <div className="flex max-w-xl flex-col gap-2">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3 w-32 rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
                <Skeleton className="size-10 shrink-0 rounded-xl" />
              </div>
              <Skeleton className="h-3 w-64 max-w-full rounded-lg" />
            </div>
            <Skeleton className="h-8 w-60 max-w-full rounded-lg" />
          </UI.CardContent>
        </Card>
      </Blatt>
    </div>
  );
}
