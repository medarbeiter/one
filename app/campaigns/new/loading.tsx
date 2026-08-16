import * as UI from "@/app/shell/ui";
import { Card, Skeleton } from "@/app/shell/ui";

/**
 * Der Assistent kann erst gebaut werden, wenn die Kunden- und Kontenliste da
 * ist – ein Graph-Aufruf über 200+ Kunden. Ohne diese Fläche passiert nach dem
 * Klick sichtbar nichts, und genau dann wird ein zweites Mal geklickt.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy>
      <UI.TypographyHeading level={1} className="font-display text-xl">
        Neue Kampagne
      </UI.TypographyHeading>
      <Card>
        <UI.CardContent
          className="flex flex-col gap-4"
          aria-label="Kunden und Werbekonten werden geladen"
        >
          <UI.TypographyParagraph color="secondary" size="sm">
            Deine Werbekonten und Kunden werden geladen…
          </UI.TypographyParagraph>
          <div className="flex max-w-xl items-end gap-2">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-32 rounded-lg" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <Skeleton className="size-10 shrink-0 rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-80 max-w-full rounded-lg" />
            <Skeleton className="h-8 w-60 max-w-full rounded-lg" />
          </div>
        </UI.CardContent>
      </Card>
    </div>
  );
}
