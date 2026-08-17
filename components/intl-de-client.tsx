'use client';

/**
 * Zieht `lib/intl-de.ts` in das Browser-Bündel. Die Datei wirkt beim Laden des
 * Moduls — also vor dem Hydrieren —, damit der Kalender im Browser dasselbe
 * Gebietsschema benutzt wie beim Rendern auf dem Server. Die Begründung steht
 * dort.
 */

import '@/lib/intl-de';

export function IntlDeutschImBrowser() {
  return null;
}
