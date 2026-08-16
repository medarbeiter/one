"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Badge } from "@astryxdesign/core";
import logo from "@/assets/logo.png";
import { Icon, type IconName } from "./icons";

const nav: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Heute", icon: "home" },
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/campaigns", label: "Kampagnen", icon: "megaphone" },
  { href: "/customers", label: "Kunden", icon: "users" },
];

export function Sidebar({
  inboxCount,
  footer,
}: {
  inboxCount?: number;
  /** Vom Server gerendert (Token-Status) und hier nur einsortiert. */
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  // Der Kunden-Scope überlebt jeden Seitenwechsel – sonst wäre er kein Scope.
  const customer = params.get("customer");
  const suffix = customer ? `?customer=${customer}` : "";

  return (
    <nav className="border-line flex w-60 shrink-0 flex-col gap-1 border-r p-3 text-sm">
      <Link href={`/${suffix}`} className="mb-3 rounded-xl p-2" aria-label="MedArbeiter One – Startseite">
        <Image src={logo} alt="MedArbeiter One" className="h-auto w-full" priority />
      </Link>

      {nav.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={`${n.href}${suffix}`}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
              active
                ? "bg-surface text-ink-900 shadow-surface font-medium"
                : "text-ink-700 hover:bg-surface/60"
            }`}
          >
            <Icon name={n.icon} className={active ? "text-gold-700 size-4" : "text-ink-300 size-4"} />
            <span className="flex-1">{n.label}</span>
            {n.href === "/inbox" && inboxCount ? (
              // Diese Theme-Variante kennt kein goldenes Badge (siehe
              // theme/house.ts) – neutral ist die vorgesehene Ausweichfarbe.
              <Badge variant="neutral" label={inboxCount} className="tabular-nums" />
            ) : null}
          </Link>
        );
      })}

      {footer && <div className="mt-auto pt-3">{footer}</div>}
    </nav>
  );
}
