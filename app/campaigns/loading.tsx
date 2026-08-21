import * as UI from "@/app/shell/ui";
import { Card, Skeleton } from "@/app/shell/ui";
import { Blatt, Blattkopf } from "@/app/shell/blattkopf";

/**
 * Die Tabelle holt die Kennzahlen jedes Kunden einzeln bei Meta – das dauert,
 * und es ist genau der Weg, den man nach dem Anlegen einer Kampagne geht.
 *
 * Der Kopf ist derselbe wie auf der fertigen Seite, nur die Zahl fehlt noch:
 * bliebe das Goldband hier weg, spränge die Seite beim Eintreffen der Daten um
 * seine ganze Höhe.
 */
export default function Loading() {
  return (
    <div aria-busy>
      <Blattkopf
        titel="Kampagnen"
        meaning="campaign"
        figur={<Skeleton className="h-9 w-44 rounded-lg" />}
        figurEinheit="Ausgaben"
        stand="Kampagnen und ihre Ergebnisse werden von Meta geladen…"
      />
      <Blatt>
        <Card elevation="low">
          <UI.CardContent className="flex flex-col gap-3">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-lg" />
            ))}
          </UI.CardContent>
        </Card>
      </Blatt>
    </div>
  );
}
