import { Card, Skeleton, Typography } from "@/app/shell/ui";

/**
 * Die Tabelle holt die Kennzahlen jedes Kunden einzeln bei Meta – das dauert,
 * und es ist genau der Weg, den man nach dem Anlegen einer Kampagne geht.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy>
      <Typography.Heading level={1} className="font-display text-xl">
        Kampagnen
      </Typography.Heading>
      <Typography.Paragraph color="muted" size="sm">
        Kampagnen und ihre Ergebnisse werden von Meta geladen…
      </Typography.Paragraph>
      <Card>
        <Card.Content className="gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-lg" />
          ))}
        </Card.Content>
      </Card>
    </div>
  );
}
