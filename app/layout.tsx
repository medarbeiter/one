import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { Poppins } from "next/font/google";
import { Sidebar } from "./shell/sidebar";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="bg-canvas text-ink-700 flex min-h-full flex-col">
        <header className="border-line bg-surface flex h-14 shrink-0 items-center gap-4 border-b px-4">
          <Link href="/" className="font-display text-ink-900 text-base">
            MedArbeiter <span className="text-gold-700">One</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">{/* Task 8, Task 9 */}</div>
        </header>
        <div className="flex min-h-0 flex-1">
          <Suspense fallback={<div className="border-line w-52 shrink-0 border-r" />}>
            <Sidebar />
          </Suspense>
          <main className="min-w-0 flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
