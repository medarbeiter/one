// Muss vor allem stehen, was ein Datum formatiert: legt Deutsch als Vorgabe
// für Intl.DateTimeFormat fest (Begründung in der Datei).
import "@/lib/intl-de";

import type { Metadata } from "next";
import { Figtree, Poppins } from "next/font/google";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { after } from "next/server";
import "./globals.css";
import brandIcon from "@/assets/logo-square.png";
import { ensureAssigned } from "@/lib/assign";
import { listCustomers } from "@/lib/customers";
import { openSession, SESSION_COOKIE, sessionSecret } from "@/lib/session";
import { IntlDeutschImBrowser } from "@/components/intl-de-client";
import { Providers } from "./providers";
import { NewCampaign } from "./shell/new-campaign";
import { ScopeSwitcher } from "./shell/scope-switcher";
import { Sidebar } from "./shell/sidebar";
import { TokenHealth } from "./shell/token-health";
import { UserBadge } from "./shell/user-badge";

export const metadata: Metadata = {
  title: "MedArbeiter One",
  description: "Meta-Anzeigen, Assets und Unterhaltungen an einem Ort",
  icons: {
    icon: brandIcon.src,
    apple: brandIcon.src,
  },
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
  // Ein toter Token macht alles unbrauchbar; fehlende Freigaben nur einzelne Kunden.
  const state = errors.some((e) => e.kind === "token")
    ? "dead"
    : errors.length || issues.length
      ? "degraded"
      : "ok";

  return (
    <html
      lang="de"
      data-astryx-theme="house"
      className={`${poppins.variable} ${figtree.variable} h-full antialiased`}
    >
      {/* Die Leiste steht, gescrollt wird nur der Inhalt – bei 200 Kunden ist
          der Kunden-Scope nie weggescrollt. */}
      <body className="bg-canvas text-ink-700 flex h-full overflow-hidden">
        <IntlDeutschImBrowser />
        <Providers>
          <Suspense fallback={<div className="border-line w-60 shrink-0 border-r" />}>
            <Sidebar
              footer={
                <div className="space-y-2">
                  {person && <UserBadge person={person} />}
                  <TokenHealth state={state} detail={[...errors.map((e) => e.message), ...issues]} />
                </div>
              }
            />
          </Suspense>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="border-line flex h-16 shrink-0 items-center gap-3 border-b px-6">
              <Suspense fallback={<div className="h-9 w-72 shrink-0" />}>
                <ScopeSwitcher customers={customers.map((c) => ({ id: c.id, name: c.name }))} />
              </Suspense>
              <div className="ml-auto flex items-center gap-2">
                <Suspense fallback={null}>
                  <NewCampaign />
                </Suspense>
              </div>
            </header>
            <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
          </div>
          {/* Die Toast-Region kommt jetzt aus Providers (LayerProvider) –
              der umschließt den ganzen Baum unten, statt daneben zu stehen. */}
        </Providers>
      </body>
    </html>
  );
}
