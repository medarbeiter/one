import * as UI from "@/app/shell/ui";
import { Card, Skeleton } from "@/app/shell/ui";
import { Blatt, Blattkopf } from "@/app/shell/blattkopf";

/** Wie app/campaigns/loading.tsx: der Kopf steht sofort, die Zahl kommt nach. */
export default function Loading() {
  return (
    <div aria-busy>
      <Blattkopf
        titel="Kampagne"
        meaning="campaign"
        figur={<Skeleton className="h-9 w-44 rounded-lg" />}
        figurEinheit="Ausgaben"
        stand="Kennzahlen werden von Meta geladen…"
      />
      <Blatt>
        {[0, 1, 2].map((i) => (
          <Card key={i} elevation="low">
            <UI.CardContent className="flex flex-col gap-3">
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-8 w-2/3 rounded-lg" />
            </UI.CardContent>
          </Card>
        ))}
      </Blatt>
    </div>
  );
}
