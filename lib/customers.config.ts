/**
 * Meta kennt keinen Kundenbegriff: Werbekonten und Seiten kommen als zwei
 * flache Listen ohne Verbindung dazwischen. Diese Zuordnung weiß nur die
 * Agentur. Startfassung erzeugen und danach von Hand korrigieren:
 *   bun run customers > lib/customers.config.ts
 */
export type CustomerConfig = {
  /** Stabiler Slug – steht im URL-Parameter ?customer= und darf sich nicht ändern. */
  id: string;
  name: string;
  pageId: string;
  igId?: string;
  adAccountIds: string[];
};

export const customers: CustomerConfig[] = [];
