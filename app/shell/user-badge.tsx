import { Avatar, Badge, Heading, Popover, TypographyParagraph } from "@/app/shell/ui";
import { buttonVariants } from "@heroui/styles";
import type { Person } from "@/lib/session";

// Die Rollennamen des Hubs sind technische Schlüssel; angezeigt wird Deutsch.
const ROLLEN: Record<string, string> = {
  mitarbeiter: "Mitarbeiter",
  fulfillment: "Fulfillment",
  vertrieb: "Vertrieb",
  verwaltung: "Verwaltung",
  geschaeftsfuehrung: "Geschäftsführung",
};

/**
 * Wer hier arbeitet – die Identität aus der Anmeldung über den Hub.
 * Alles, was /api/oauth/userinfo liefert, ist hier sichtbar: Name und Rolle
 * direkt, E-Mail und Rechte im Popover. Mehr weiß die App über die Person nicht.
 */
export function UserBadge({ person }: { person: Person }) {
  const rolle = ROLLEN[person.role] ?? person.role;
  return (
    // Astryx' Popover hat keine Trigger/Content/Dialog/Heading-Teile: der
    // Auslöser sind die Kinder, die Fläche ist die `content`-Prop.
    <Popover
      label={person.name}
      width={320}
      content={
        <div className="space-y-2 text-sm">
          <Heading level={3}>{person.name}</Heading>
          <TypographyParagraph color="secondary" size="xsm">
            {person.email}
          </TypographyParagraph>
          <div className="flex items-center gap-2">
            <Badge variant="neutral" label={rolle} />
          </div>
          {person.rechte.length > 0 && (
            <ul className="text-ink-500 list-disc space-y-1 pl-4 text-xs">
              {person.rechte.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      }
    >
      {/* Gleiche Optik wie der Token-Status darunter: der Auslöser trägt die
          Button-Varianten des Designsystems. */}
      <button
        type="button"
        aria-label={`Angemeldet als ${person.name}`}
        className={`${buttonVariants({ variant: "ghost", size: "sm", fullWidth: true })} flex h-auto items-center justify-start gap-3 px-2 py-1.5`}
      >
        {/* Astryx' Avatar bildet die Initialen selbst aus `name`. tooltip={false},
            weil Astryx sonst aus `name` einen Tooltip baut und dem Avatar dafür
            tabIndex=0 gibt – ein zweiter Tabstopp mitten in diesem Knopf. */}
        <Avatar size="sm" name={person.name} tooltip={false} />
        <span className="min-w-0 text-left">
          <span className="text-ink-900 block truncate text-sm font-medium">{person.name}</span>
          <span className="text-ink-500 block truncate text-xs">{rolle}</span>
        </span>
      </button>
    </Popover>
  );
}
