// Muss vor allem stehen, was ein Datum formatiert: legt Deutsch als Vorgabe
// für Intl.DateTimeFormat fest (Begründung in der Datei).
import "@/lib/intl-de";

import type { Metadata, Viewport } from "next";
import { Figtree, Poppins } from "next/font/google";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { after } from "next/server";
import { AppShell } from "@astryxdesign/core";
import "./globals.css";
import brandIcon from "@/assets/logo-square.png";
import { ensureAssigned } from "@/lib/assign";
import { reconcile } from "@/lib/inbox-ingest";
import { countUnanswered, openDb } from "@/lib/inbox-store";
import { listCustomers } from "@/lib/customers";
import { openSession, SESSION_COOKIE, sessionSecret } from "@/lib/session";
import { IntlDeutschImBrowser } from "@/components/intl-de-client";
import { Providers } from "./providers";
import { Leiste } from "./shell/leiste";
import { NewCampaign } from "./shell/new-campaign";
import { ScopeSwitcher } from "./shell/scope-switcher";
import { AccountRow } from "./shell/account-row";
import { Sidebar } from "./shell/sidebar";
import { TokenHealth } from "./shell/token-health";

export const metadata: Metadata = {
  title: "MedArbeiter One",
  description: "Meta-Anzeigen, Assets und Unterhaltungen an einem Ort",
  icons: {
    icon: brandIcon.src,
    apple: brandIcon.src,
  },
};

// themeColor: Next 14 zog das aus metadata heraus in einen eigenen Export
// (Hub macht dasselbe in seinem layout.tsx). #faf8f3 ist der Paper-Wert aus
// theme/house.ts.
export const viewport: Viewport = {
  themeColor: "#faf8f3",
  colorScheme: "light",
};

// Self-hosted through next/font: no runtime request to Google, no CDN failure
// mode, and no client IP leaving the house. The theme's font-family tokens
// resolve to these variables.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Wer arbeitet hier? Der Proxy lässt ohne gültige Sitzung niemanden bis
  // hierher – null gibt es trotzdem, etwa wenn die Sitzung zwischen Proxy und
  // Rendern abläuft; dann fehlt nur das Namensschild, die Seite lebt weiter.
  const person = await openSession(
    (await cookies()).get(SESSION_COOKIE)?.value,
    sessionSecret(),
  );
  // Einmal laden, für Scope-Switcher und Token-Status gemeinsam nutzen.
  const { customers, errors, issues: overrideIssues } = await listCustomers();
  const issues = [...customers.flatMap((c) => c.issues), ...overrideIssues];
  // Neue Kunden weisen sich selbst zu. after() läuft nach der Antwort: der
  // Abgleich hält keine Seite auf, und sein Fehlschlag zerlegt kein Rendering.
  after(ensureAssigned);
  // Derselbe Rhythmus wie ensureAssigned: läuft nach der Antwort, ein
  // Graph-Aussetzer darf die Seite nicht zerlegen. Läuft für jedes
  // Rendering – bun:sqlite ist ein warmer, lokaler Prozess, keine Kosten wie
  // bei einem entfernten Dienst; ein doppelter Lauf schreibt nur dieselben
  // Zeilen erneut.
  after(async () => {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    try {
      const { failed } = await reconcile(openDb(), customers);
      for (const f of failed) console.error(`[inbox] Abgleich fehlgeschlagen für ${f.customerId}: ${f.message}`);
    } catch (e) {
      console.error(`[inbox] Abgleich nicht möglich: ${(e as Error).message}`);
    }
  });
  // Ein toter Token macht alles unbrauchbar; fehlende Freigaben nur einzelne Kunden.
  const state = errors.some((e) => e.kind === "token")
    ? "dead"
    : errors.length || issues.length
      ? "degraded"
      : "ok";

  return (
    <html lang="de" className={`${poppins.variable} ${figtree.variable} h-full antialiased`}>
      {/* AppShell/SideNav aus @astryxdesign/core – dieselbe Schale wie im Hub
          (app/(app)/layout.tsx dort), nur mit den Inhalten dieses Hauses.
          Innen gescrollt wird weiterhin nur `main`, nicht die ganze Schale –
          bei 200 Kunden ist der Kunden-Scope nie weggescrollt. */}
      <body className="text-ink-700">
        <IntlDeutschImBrowser />
        <Providers>
          <AppShell
            contentPadding={0}
            sideNav={
              <Suspense fallback={<div className="h-full w-[260px] shrink-0" />}>
                <Sidebar
                  inboxCount={countUnanswered(openDb())}
                  footer={
                    // Der Verbindungsstatus ist vorerst ausgeblendet (Hub
                    // zeigt ihn an dieser Stelle nicht) – die Kontozeile
                    // bleibt der einzige Fußinhalt.
                    <div className="space-y-2">
                      {/* <TokenHealth state={state} detail={[...errors.map((e) => e.message), ...issues]} /> */}
                      {person && <AccountRow person={person} />}
                    </div>
                  }
                />
              </Suspense>
            }
          >
            {/* Die Leiste steht IM scrollenden Blatt, nicht darüber: nur so
                sind Leiste und Kopfband eine durchgehende Goldfläche, und nur
                so kann sie beim Rollen über den Kopf laufen und sich dabei
                ihre Kante zurückholen (app/shell/leiste.tsx). Dass sie dabei
                stehen bleibt, macht `position: sticky` gegen genau diesen
                Scroller — der Kundenscope ist bei 200 Kunden nie weggerollt.
                `main` trägt deshalb keinen eigenen Innenabstand mehr: den
                setzen die Bänder, damit die Wäsche bis an die Fensterkante
                läuft. */}
            <main className="h-full overflow-y-auto">
              <Leiste
                aktion={
                  <Suspense fallback={null}>
                    <NewCampaign />
                  </Suspense>
                }
              >
                <Suspense fallback={<div className="h-9 w-64 shrink-0" />}>
                  <ScopeSwitcher customers={customers.map((c) => ({ id: c.id, name: c.name }))} />
                </Suspense>
              </Leiste>
              {children}
            </main>
          </AppShell>
          {/* Die Toast-Region kommt jetzt aus Providers (LayerProvider) –
              der umschließt den ganzen Baum unten, statt daneben zu stehen. */}
        </Providers>
      </body>
    </html>
  );
}
