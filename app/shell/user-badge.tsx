import { Avatar, AvatarFallback, Chip, Popover, PopoverContent, PopoverDialog, PopoverHeading, PopoverTrigger, TypographyParagraph } from "@/app/shell/ui";
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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/**
 * Wer hier arbeitet – die Identität aus der Anmeldung über den Hub.
 * Alles, was /api/oauth/userinfo liefert, ist hier sichtbar: Name und Rolle
 * direkt, E-Mail und Rechte im Popover. Mehr weiß die App über die Person nicht.
 */
export function UserBadge({ person }: { person: Person }) {
  const rolle = ROLLEN[person.role] ?? person.role;
  return (
    <Popover>
      {/* Gleiche Optik wie der Token-Status darunter: der Auslöser trägt die
          Button-Varianten des Designsystems. */}
      <PopoverTrigger
        aria-label={`Angemeldet als ${person.name}`}
        className={`${buttonVariants({ variant: "ghost", size: "sm", fullWidth: true })} flex h-auto items-center justify-start gap-3 px-2 py-1.5`}
      >
        <Avatar size="sm" variant="soft" color="accent">
          <AvatarFallback>{initials(person.name)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 text-left">
          <span className="text-ink-900 block truncate text-sm font-medium">{person.name}</span>
          <span className="text-ink-500 block truncate text-xs">{rolle}</span>
        </span>
      </PopoverTrigger>
      <PopoverContent className="max-w-80">
        <PopoverDialog className="space-y-2 text-sm">
          <PopoverHeading>{person.name}</PopoverHeading>
          <TypographyParagraph color="muted" size="xs">
            {person.email}
          </TypographyParagraph>
          <div className="flex items-center gap-2">
            <Chip size="sm" variant="soft" color="accent">
              {rolle}
            </Chip>
          </div>
          {person.rechte.length > 0 && (
            <ul className="text-ink-500 list-disc space-y-1 pl-4 text-xs">
              {person.rechte.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </PopoverDialog>
      </PopoverContent>
    </Popover>
  );
}
