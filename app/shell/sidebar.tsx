"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SideNav, SideNavItem, SideNavSection, useSideNavCollapse } from "@astryxdesign/core";
import { useEffect, useState } from "react";
import logoMark from "@/assets/logo-square.png";
import { Badge, Text } from "@/app/shell/ui";
import { Sign, type Meaning } from "@/theme/icons";
import { NavAktionen, NavVerweilen, NavZweig } from "@/app/shell/nav-ausklapp";

/**
 * Die Marke im Kopf der Leiste — mit zweifarbigem Wortzug ("MedArbeiter" in
 * der Fließfarbe, der Anwendungsname in der Markenfarbe #e3b028), was
 * Astryx' `SideNavHeading` nicht kann: ihr `heading` nimmt nur reinen Text,
 * keine Kindelemente. Layout und Maße 1:1 aus deren "ganze Überschrift ist
 * ein Verweis"-Zweig übernommen (kein Menü, keine Unter-/Überschrift):
 * derselbe Zeilenfluss (spacing-2 Lücke, spacing-8 Mindesthöhe,
 * spacing-2 Innenabstand seitlich), derselbe Textschnitt (`Text
 * type="large"`, der intern dieselben Token trägt: --text-large-size,
 * --font-weight-semibold, --text-large-leading).
 */
function Marke({ href, suffix, name }: { href: string; suffix: string; name: string }) {
  const { isCollapsed } = useSideNavCollapse();
  const bild = <Image src={logoMark} alt="" width={40} height={40} />;
  if (isCollapsed) {
    return (
      <Link
        href={`${href}${suffix}`}
        className="marke-kopf marke-kopf-eng"
        title={`MedArbeiter ${name}`}
        aria-label={`MedArbeiter ${name}`}
      >
        {bild}
      </Link>
    );
  }
  return (
    <Link href={`${href}${suffix}`} className="marke-kopf" aria-label={`MedArbeiter ${name}`}>
      {bild}
      <Text
        type="large"
        maxLines={1}
        style={{ flex: 1, minWidth: 0, fontSize: "calc(var(--text-large-size) * 1.2)" }}
      >
        MedArbeiter <span style={{ color: "#e3b028" }}>{name}</span>
      </Text>
    </Link>
  );
}

// Die Gruppen wachsen mit dem Haus: "Content" und "Ads" sind der Anfang, kein
// Deckel — dieselbe Aufteilung, die der Hub für seine Navigation trägt.
const heute = { href: "/", label: "Heute", icon: "today" as Meaning };
const content: { href: string; label: string; icon: Meaning }[] = [
  { href: "/inbox", label: "Inbox", icon: "inbox" },
];
const ads: { href: string; label: string; icon: Meaning }[] = [
  { href: "/campaigns", label: "Kampagnen", icon: "campaign" },
  { href: "/customers", label: "Kunden", icon: "customers" },
];

// Selber Mechanismus wie im Hub (components/app-nav.tsx): Astryx' eigener
// Einklappzustand trägt die Auszeichnung, hier wird er nur gehalten und im
// Browser gemerkt. `bereit` unterbindet die Breitenbewegung vor dem ersten
// Rendern – der Server kennt keinen localStorage, ein sofort gelesener
// Zustand hieße, Server- und Browserbaum fallen auseinander.
const SCHIENE_SCHLUESSEL = "medarbeiter-one:sidebar-eingeklappt";

export function Sidebar({
  inboxCount,
  footer,
}: {
  inboxCount?: number;
  /** Vom Server gerendert (Token-Status, Kontozeile) und hier nur einsortiert. */
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  // Der Kunden-Scope überlebt jeden Seitenwechsel – sonst wäre er kein Scope.
  const customer = params.get("customer");
  const suffix = customer ? `?customer=${customer}` : "";

  const [eingeklappt, setEingeklappt] = useState(false);
  const [bereit, setBereit] = useState(false);
  useEffect(() => {
    try {
      setEingeklappt(window.localStorage.getItem(SCHIENE_SCHLUESSEL) === "true");
    } catch {
      // Privater Modus, gesperrter Speicher: die Leiste bleibt offen.
    }
    setBereit(true);
  }, []);
  const schiene = (zu: boolean) => {
    setEingeklappt(zu);
    try {
      window.localStorage.setItem(SCHIENE_SCHLUESSEL, String(zu));
    } catch {
      // Nicht merken zu können ist kein Grund, nicht einzuklappen.
    }
  };

  // Immer höchstens einer offen — wie im Hub (components/app-nav.tsx):
  // ein Aufklappen schiebt die Einträge darunter nach, bei mehreren zugleich
  // würde die Leiste zu einer Liste, durch die man scrollen muss.
  const [offen, setOffen] = useState<{ id: string; durchKlick: boolean } | null>(null);
  const istOffen = (id: string) => eingeklappt || offen?.id === id;
  const ausklapp = (id: string) => ({
    isCollapsed: offen?.id !== id,
    onCollapsedChange: (zu: boolean) => setOffen(zu ? null : { id, durchKlick: true }),
  });
  const verweilen = (id: string) => ({
    istOffen: offen?.id === id,
    oeffnen: () => setOffen({ id, durchKlick: false }),
    schliessen: () => setOffen((jetzt) => (jetzt?.id === id && !jetzt.durchKlick ? null : jetzt)),
    aus: eingeklappt,
  });

  return (
    <SideNav
      data-bereit={bereit ? "true" : "false"}
      data-eingeklappt={eingeklappt ? "true" : "false"}
      collapsible={{
        isCollapsed: eingeklappt,
        onCollapsedChange: schiene,
        // Der Griff steht in der Kontozeile (siehe account-row.tsx), nicht in
        // einer eigenen Reihe darunter – wie im Hub (components/app-nav.tsx).
        hasButton: false,
      }}
      header={<Marke href="/" suffix={suffix} name="One" />}
      footer={footer}
    >
      <SideNavSection title="Persönlich" isHeaderHidden>
        <SideNavItem
          label={heute.label}
          href={`${heute.href}${suffix}`}
          size="lg"
          isSelected={pathname === "/"}
          icon={<Sign meaning={heute.icon} form="outline" />}
          selectedIcon={<Sign meaning={heute.icon} form="solid" />}
        />
      </SideNavSection>

      <SideNavSection title="Content">
        {content.map((n) => {
          const active = pathname.startsWith(n.href);
          return (
            <SideNavItem
              key={n.href}
              label={n.label}
              href={`${n.href}${suffix}`}
              size="lg"
              isSelected={active}
              icon={<Sign meaning={n.icon} form="outline" />}
              selectedIcon={<Sign meaning={n.icon} form="solid" />}
              endContent={
                n.href === "/inbox" && inboxCount ? (
                  // Diese Theme-Variante kennt kein goldenes Badge (siehe
                  // theme/house.ts) – neutral ist die vorgesehene Ausweichfarbe.
                  <Badge variant="neutral" label={inboxCount} className="tabular-nums" />
                ) : undefined
              }
            />
          );
        })}
      </SideNavSection>

      <SideNavSection title="Ads">
        {ads.map((n) => {
          const active = pathname.startsWith(n.href);
          const item = (
            <SideNavItem
              key={n.href}
              label={n.label}
              href={`${n.href}${suffix}`}
              size="lg"
              isSelected={active}
              icon={<Sign meaning={n.icon} form="outline" />}
              selectedIcon={<Sign meaning={n.icon} form="solid" />}
              // Schnellzugriff: "Kampagne erstellen" hängt unter "Kampagnen" –
              // derselbe Faden-Mechanismus wie im Hub (components/app-nav.tsx),
              // nicht eine verschachtelte SideNavItem.
              collapsible={n.href === "/campaigns" ? ausklapp("kampagnen") : undefined}
            >
              {n.href === "/campaigns" ? (
                <NavZweig offen={istOffen("kampagnen")}>
                  <NavAktionen
                    aktionen={[
                      { meaning: "add", label: "Kampagne erstellen", href: `/campaigns/new${suffix}` },
                    ]}
                  />
                </NavZweig>
              ) : undefined}
            </SideNavItem>
          );
          return n.href === "/campaigns" ? (
            <NavVerweilen key={n.href} {...verweilen("kampagnen")}>
              {item}
            </NavVerweilen>
          ) : (
            item
          );
        })}
      </SideNavSection>
    </SideNav>
  );
}
