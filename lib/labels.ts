/**
 * Metas Enum-Werte gehören nicht auf den Bildschirm. Unbekanntes wird
 * unverändert durchgereicht – lieber ein technischer Wert als gar keiner.
 */
export const LABELS: Record<string, string> = {
  OUTCOME_LEADS: "Leads",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_ENGAGEMENT: "Engagement",
  LEAD_GENERATION: "Leads maximieren",
  LINK_CLICKS: "Link-Klicks",
  IMPRESSIONS: "Impressionen",
  LOWEST_COST_WITHOUT_CAP: "Niedrigste Kosten",
  ON_AD: "Instant-Formular",
  EMPLOYMENT: "Stellenanzeigen",
  APPLY_NOW: "Jetzt bewerben",
  DE: "Deutschland",
  AT: "Österreich",
  CH: "Schweiz",
  facebook: "Facebook",
  instagram: "Instagram",
  feed: "Feed",
  stream: "Instagram-Feed",
  story: "Stories",
  ACTIVE: "Aktiv",
  PAUSED: "Pausiert",
};

export const label = (value: string): string => LABELS[value] ?? value;

/**
 * „3 Anzeigen", „1 Anzeige" – nicht „1 Anzeige(n)". Die Klammerform stand an
 * fünf Stellen und war überall dort falsch, wo die Zahl bekannt ist, also
 * überall. Zwei Formen genügen: das Deutsche unterscheidet hier nur Singular
 * und Plural, und die 0 nimmt den Plural.
 */
export const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;
