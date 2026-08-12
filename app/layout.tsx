import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { Poppins } from "next/font/google";
import { Toast } from "@heroui/react";
import { listCustomers } from "@/lib/customers";
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
  description: "Meta ads, assets and conversations in one place",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Einmal laden, für Scope-Switcher und Token-Status gemeinsam nutzen.
  const { customers, errors } = await listCustomers();
  const issues = customers.flatMap((c) => c.issues);
  // Ein toter Token macht alles unbrauchbar; fehlende Freigaben nur einzelne Kunden.
  const state = errors.some((e) => e.kind === "token")
    ? "dead"
    : errors.length || issues.length
      ? "degraded"
      : "ok";

  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="bg-canvas text-ink-700 flex min-h-full flex-col">
        <header className="border-line bg-surface flex h-14 shrink-0 items-center gap-4 border-b px-4">
          <Link href="/" className="font-display text-ink-900 text-base">
            MedArbeiter <span className="text-gold-700">One</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <Suspense fallback={<div className="h-9 w-64 shrink-0" />}>
              <ScopeSwitcher customers={customers.map((c) => ({ id: c.id, name: c.name }))} />
            </Suspense>
            <TokenHealth state={state} detail={[...errors.map((e) => e.message), ...issues]} />
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <Suspense fallback={<div className="border-line w-52 shrink-0 border-r" />}>
            <Sidebar />
          </Suspense>
          <main className="min-w-0 flex-1 p-6">{children}</main>
        </div>
        {/* Region für imperative Toasts (toast.success/.danger) – einmal pro App. */}
        <Toast.Provider />
      </body>
    </html>
  );
}
