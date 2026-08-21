"use client";

import { useSideNavCollapse } from "@astryxdesign/core";
import { Badge, Button, Heading, Popover, StatusDot, TypographyParagraph } from "@/app/shell/ui";

const COPY = {
  ok: { variant: "success", title: "Verbunden", body: "Der System-User-Token funktioniert." },
  degraded: {
    variant: "error",
    title: "Teilweise verbunden",
    body: "Einige Assets sind dem System User nicht zugewiesen. Gib im Business Manager Zugriff frei und führe dann `bun run assign` aus.",
  },
  dead: {
    variant: "error",
    title: "Nicht verbunden",
    body: "Erstelle im Business Manager einen System-User-Token und trage ihn in .env.local als META_ACCESS_TOKEN ein. Die Schritte stehen in der README.",
  },
} as const;

export function TokenHealth({
  state,
  detail,
}: {
  state: keyof typeof COPY;
  detail: string[];
}) {
  const c = COPY[state];
  // Eingeklappte Schiene: derselbe Auslöser, nur als Zeichen statt als Zeile
  // (siehe Kontozeile im Hub, components/app-nav.tsx).
  const { isCollapsed } = useSideNavCollapse();
  return (
    // Astryx' Popover hat keine Trigger/Content/Dialog/Heading-Teile: der
    // Auslöser sind die Kinder, die Fläche ist die `content`-Prop. role="dialog",
    // die Beschriftung (`label`) und Escape-to-close bringt es selbst mit.
    <Popover
      label={c.title}
      width={320}
      content={
        <div className="space-y-2 text-sm">
          <Heading level={3}>{c.title}</Heading>
          <TypographyParagraph color="secondary" size="xsm">
            {c.body}
          </TypographyParagraph>
          {detail.length > 0 && (
            <ul className="text-ink-500 list-disc space-y-1 pl-4 text-xs">
              {detail.slice(0, 8).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      }
    >
      {/* Der Auslöser trägt die Button-Optik des Designsystems statt eigener
          Rahmen- und Hover-Klassen. Astryx kennt kein "outline" – secondary
          ist die umrandete, ungefüllte Variante des Designsystems. */}
      {isCollapsed ? (
        <Button
          variant="secondary"
          size="sm"
          isIconOnly
          icon={<StatusDot variant={c.variant} label={c.title} />}
          label={`Verbindung: ${c.title}`}
        />
      ) : (
        <Button variant="secondary" size="sm" width="100%" label={`Verbindung: ${c.title}`}>
          <Badge variant={c.variant} label={c.title} />
        </Button>
      )}
    </Popover>
  );
}
