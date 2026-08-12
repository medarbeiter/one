"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const nav = [
  { href: "/", label: "Today" },
  { href: "/inbox", label: "Inbox" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/customers", label: "Customers" },
];

export function Sidebar({ inboxCount }: { inboxCount?: number }) {
  const pathname = usePathname();
  const params = useSearchParams();
  // Der Kunden-Scope überlebt jeden Seitenwechsel – sonst wäre er kein Scope.
  const customer = params.get("customer");
  const suffix = customer ? `?customer=${customer}` : "";

  return (
    <nav className="border-line flex w-52 shrink-0 flex-col gap-1 border-r p-3 text-sm">
      {nav.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={`${n.href}${suffix}`}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between rounded-md px-3 py-2 ${
              active ? "bg-gold-100 text-ink-900 font-medium" : "text-ink-700 hover:bg-canvas"
            }`}
          >
            {n.label}
            {n.href === "/inbox" && inboxCount ? (
              <span className="bg-gold-500 text-ink-900 rounded-full px-1.5 text-xs tabular-nums">
                {inboxCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
