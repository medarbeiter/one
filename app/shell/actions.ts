"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Beendet die eigene Sitzung — der Cookie stammt vom eigenen OAuth-Rücksprung
 * (app/anmelden/rueckkehr/route.ts), nicht von einem vorgeschalteten Proxy.
 * Diese Seite kann ihn also selbst löschen, wie Hubs `logoutAction`
 * (app/actions.ts dort) es für seine eigene Sitzung tut.
 */
export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/anmelden");
}
