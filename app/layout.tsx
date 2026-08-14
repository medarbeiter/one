import type { Metadata } from "next";
import { Suspense } from "react";
import { after } from "next/server";
import "./globals.css";
import { Poppins } from "next/font/google";
import { Toast } from "@heroui/react";
import brandIcon from "@/assets/logo-square.png";
import { ensureAssigned } from "@/lib/assign";
import { listCustomers } from "@/lib/customers";
import { NewCampaign } from "./shell/new-campaign";
import { ScopeSwitcher } from "./shell/scope-switcher";
import { Sidebar } from "./shell/sidebar";
import { TokenHealth } from "./shell/token-health";

// Nur für Überschriften und Kennzahlen – Fließtext bleibt System-UI.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MedArbeiter One",
  description: "Meta-Anzeigen, Assets und Unterhaltungen an einem Ort",
  icons: {
    icon: brandIcon.src,
    apple: brandIcon.src,
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Einmal laden, für Scope-Switcher und Token-Status gemeinsam nutzen.
  const { customers, errors } = await listCustomers();
  const issues = customers.flatMap((c) => c.issues);
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
    <html lang="de" className={`${poppins.variable} h-full antialiased`}>
      {/* Die Leiste steht, gescrollt wird nur der Inhalt – bei 200 Kunden ist
          der Kunden-Scope nie weggescrollt. */}
      <body className="bg-canvas text-ink-700 flex h-full overflow-hidden">
        <Suspense fallback={<div className="border-line w-60 shrink-0 border-r" />}>
          <Sidebar
            footer={
              <TokenHealth state={state} detail={[...errors.map((e) => e.message), ...issues]} />
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
        {/* Region für imperative Toasts (toast.success/.danger) – einmal pro App. */}
        <Toast.Provider />
      </body>
    </html>
  );
}
