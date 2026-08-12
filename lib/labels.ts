/**
 * Metas Enum-Werte gehören nicht auf den Bildschirm. Unbekanntes wird
 * unverändert durchgereicht – lieber ein technischer Wert als gar keiner.
 */
export const LABELS: Record<string, string> = {
  OUTCOME_LEADS: "Leads",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_ENGAGEMENT: "Engagement",
  LEAD_GENERATION: "Maximise leads",
  LINK_CLICKS: "Link clicks",
  IMPRESSIONS: "Impressions",
  LOWEST_COST_WITHOUT_CAP: "Lowest cost",
  ON_AD: "Instant form",
  EMPLOYMENT: "Employment",
  APPLY_NOW: "Apply now",
  DE: "Germany",
  AT: "Austria",
  CH: "Switzerland",
  facebook: "Facebook",
  instagram: "Instagram",
  feed: "Feed",
  stream: "Instagram feed",
  story: "Stories",
  ACTIVE: "Active",
  PAUSED: "Paused",
};

export const label = (value: string): string => LABELS[value] ?? value;
