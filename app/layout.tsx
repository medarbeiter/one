import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Poppins } from "next/font/google";

// Nur für Überschriften und Kennzahlen – Fließtext bleibt System-UI.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MedArbeiter One",
  description: "Meta Ads & Business Assets ohne Klickstrecke",
};

const nav = [
  { href: "/", label: "Assets" },
  { href: "/campaigns", label: "Kampagnen" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="bg-surface text-foreground min-h-full">
        <header className="border-default-200 flex items-center gap-6 border-b px-6 py-3">
          <Link href="/" className="font-semibold">
            MedArbeiter <span className="text-default-500">One</span>
          </Link>
          <nav className="flex gap-4 text-sm">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="text-default-600 hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl p-6">{children}</main>
      </body>
    </html>
  );
}
