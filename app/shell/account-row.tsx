"use client";

import { HStack, VStack, useSideNavCollapse } from "@astryxdesign/core";
import { Avatar, Badge, Heading, Button, Popover, Text, TypographyParagraph } from "@/app/shell/ui";
import type { Person } from "@/lib/session";
import { Sign } from "@/theme/icons";
import { AbsendeKnopf } from "@/app/shell/absende-knopf";
import { logoutAction } from "@/app/shell/actions";

// Die Rollennamen des Hubs sind technische Schlüssel; angezeigt wird Deutsch.
const ROLLEN: Record<string, string> = {
  mitarbeiter: "Mitarbeiter",
  fulfillment: "Fulfillment",
  vertrieb: "Vertrieb",
  verwaltung: "Verwaltung",
  geschaeftsfuehrung: "Geschäftsführung",
};

/**
 * Der Fuß der Leiste: 1:1 die Kontozeile aus dem Hub
 * (components/app-nav.tsx, `Kontozeile()`) — eine Zeile statt eines Stapels,
 * derselbe Griff für die Schiene daneben statt einer eigenen Reihe darunter
 * (`hasButton: false` an der `SideNav`, siehe sidebar.tsx).
 *
 * Eine Abweichung, weil dieses Haus kein `/profil` hat: Popover statt
 * `Link`, wie zuvor in user-badge.tsx. Abmelden gibt es wie im Hub — die
 * eigene Sitzung stammt vom eigenen OAuth-Rücksprung (app/anmelden/rueckkehr),
 * diese Seite kann sie also selbst beenden (app/shell/actions.ts).
 */
export function AccountRow({ person }: { person: Person }) {
  const { isCollapsed, toggle } = useSideNavCollapse();
  const rolle = ROLLEN[person.role] ?? person.role;

  const profil = (
    // Render-prop-Modus statt Kinder: Astryx' automatischer Modus steckt den
    // Auslöser in einen `display: inline-flex`-Anker, der sich an seinem
    // Inhalt bemisst statt ihn zu füllen – `.kontozeile-profil`s `flex: 1`
    // liefe dort ins Leere und ließe die Trefferfläche am Inhalt kleben
    // statt bis zum Griff für die Schiene zu reichen. Der Render-Prop setzt
    // den Knopf ohne Wrapper direkt ein, wie im Hub der bloße `NextLink`.
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
      {(trigger) =>
        isCollapsed ? (
          <button
            type="button"
            ref={trigger.ref}
            onClick={trigger.onClick}
            aria-haspopup={trigger["aria-haspopup"]}
            aria-expanded={trigger["aria-expanded"]}
            aria-controls={trigger["aria-controls"]}
            className="kontozeile-profil kontozeile-profil-eng"
            title={`${person.name} · Persönliche Angaben`}
            aria-label="Persönliche Angaben öffnen"
          >
            {/* tooltip={false}, weil Astryx sonst aus `name` einen Tooltip
                baut und dem Avatar dafür tabIndex=0 gibt – ein zweiter
                Tabstopp mitten in diesem Knopf. Größe „md" (36px): dieselbe
                Stufe wie Hubs `PersonZeichen groesse="karte"` – die
                Entscheidungsleiste trägt die größere Stufe, nicht die 24px
                der dichten Zeile. */}
            <Avatar size="md" src={person.picture} name={person.name} tooltip={false} />
          </button>
        ) : (
          <button
            type="button"
            ref={trigger.ref}
            onClick={trigger.onClick}
            aria-haspopup={trigger["aria-haspopup"]}
            aria-expanded={trigger["aria-expanded"]}
            aria-controls={trigger["aria-controls"]}
            className="kontozeile-profil"
            aria-label="Persönliche Angaben öffnen"
          >
            <Avatar size="md" src={person.picture} name={person.name} tooltip={false} />
            <VStack gap={0}>
              <Text type="label" size="sm" weight="medium" maxLines={1}>
                {person.name}
              </Text>
              <Text type="supporting" size="sm" color="secondary" maxLines={1}>
                {rolle}
              </Text>
            </VStack>
            {/* Hubs Kontozeile trägt hier das Zahnrad (Sinnbild „einstellungen"
                mit ton="sekundaer"), keinen gedrehten Pfeil. Ohne `form`, wie
                dort: Sinnbilds Grundform ist „voll" — gefüllt, keine Kontur,
                weil es hier keinen ausgewählten Gegenzustand gibt, der eine
                Kontur erzwingen würde. */}
            <Sign meaning="settings" size={16} color="var(--color-icon-secondary)" />
          </button>
        )
      }
    </Popover>
  );

  const abmelden = (
    <form action={logoutAction}>
      <AbsendeKnopf
        label="Abmelden"
        variant="ghost"
        size="sm"
        isIconOnly
        icon={<Sign meaning="signOut" form="outline" />}
      />
    </form>
  );

  /* Der Griff für die Schiene steht neben der Kontozeile, nicht in ihr, und
     nicht in einer eigenen Reihe darunter (`hasButton: false` an der Leiste,
     siehe sidebar.tsx). Eingeklappt bleibt er stehen: er ist der einzige Weg
     zurück. */
  const schiene = (
    <Button
      variant="ghost"
      size="sm"
      isIconOnly
      icon={<Sign meaning={isCollapsed ? "expand" : "collapse"} />}
      label={isCollapsed ? "Leiste ausklappen" : "Leiste einklappen"}
      onClick={toggle}
    />
  );

  if (isCollapsed) {
    return (
      <VStack gap={1} paddingInline={2} paddingBlock={3} align="center">
        {profil}
        {abmelden}
        {schiene}
      </VStack>
    );
  }

  return (
    <HStack paddingInline={2} paddingBlock={3} gap={1} vAlign="center" wrap="nowrap">
      <HStack className="kontozeile" gap={2} vAlign="center" wrap="nowrap" paddingInline={2} paddingBlock={1.5}>
        {profil}
        {abmelden}
      </HStack>
      {schiene}
    </HStack>
  );
}
