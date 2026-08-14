import { Chip, Popover, Typography } from "@/app/shell/ui";
import { buttonVariants } from "@heroui/styles";

const COPY = {
  ok: { color: "success", title: "Verbunden", body: "Der System-User-Token funktioniert." },
  degraded: {
    color: "danger",
    title: "Teilweise verbunden",
    body: "Einige Assets sind dem System User nicht zugewiesen. Gib im Business Manager Zugriff frei und führe dann `bun run assign` aus.",
  },
  dead: {
    color: "danger",
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
  return (
    <Popover>
      {/* Der Auslöser trägt die Button-Optik des Designsystems statt eigener
          Rahmen- und Hover-Klassen. */}
      <Popover.Trigger
        aria-label={`Verbindung: ${c.title}`}
        className={buttonVariants({ variant: "outline", size: "sm", fullWidth: true })}
      >
        <Chip size="sm" variant="soft" color={c.color}>
          {c.title}
        </Chip>
      </Popover.Trigger>
      <Popover.Content className="max-w-80">
        {/* Popover.Dialog liefert role="dialog", die Titel-Verknüpfung (aria-labelledby) und
            Escape-to-close – ohne dieses Sub-Part fehlt die Aria-Semantik. */}
        <Popover.Dialog className="space-y-2 text-sm">
          <Popover.Heading>{c.title}</Popover.Heading>
          <Typography.Paragraph color="muted" size="xs">
            {c.body}
          </Typography.Paragraph>
          {detail.length > 0 && (
            <ul className="text-ink-500 list-disc space-y-1 pl-4 text-xs">
              {detail.slice(0, 8).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
