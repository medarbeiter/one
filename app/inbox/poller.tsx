"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Fragt /api/inbox/count alle ~20s und bei Fokus ab. Ein warmer SQLite-Read
 * kostet nichts; nur der eine Poll direkt nach einem Webhook-Ereignis
 * aktualisiert wirklich etwas. Kein SSE, keine gehaltene Verbindung – diese
 * App hat keine Sticky-Session-Geschichte und braucht für ein 20s-Fenster
 * keine.
 */
export function Poller({ customer, baseline }: { customer?: string; baseline: { count: number } }) {
  const router = useRouter();
  const last = useRef(baseline.count);

  useEffect(() => {
    const check = async () => {
      const qs = customer ? `?customer=${customer}` : "";
      const res = await fetch(`/api/inbox/count${qs}`).catch(() => undefined);
      if (!res?.ok) return;
      const { count } = await res.json();
      if (count !== last.current) {
        last.current = count;
        router.refresh();
      }
    };
    const id = setInterval(check, 20_000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", check);
    };
  }, [customer, router]);

  return null;
}
