"use client";

import { useEffect, useState } from "react";
import { adSetName } from "@/lib/naming";
import type { AdSetInput } from "@/lib/launch";

const KEY = "medarbeiter:new-campaign";

export type WizardState = {
  /** Das Werbekonto, unter dem angelegt wird – fast immer MedArbeiter. */
  customerId: string;
  /** Der beworbene Kunde. Nicht dasselbe wie customerId. */
  business: string;
  roles: string[];
  roleFreeText: string;
  startDate: string; // yyyy-mm-dd, so it round-trips through sessionStorage
  initials: string;
  campaignName: string;
  /** true, sobald der Name von Hand geändert wurde – dann nicht mehr überschreiben. */
  nameEdited: boolean;
  dailyBudgetEuros: number;
  spendCapEuros?: number;
  adSets: WizardAdSet[];
};

// AdSetInput ist der API-Payload-Vertrag (siehe lib/launch.ts) – die id ist reines
// UI-Konzept fürs React-key-Problem beim Entfernen mittlerer Blöcke und gehört
// nicht dort hinein. onCreate() in wizard.tsx entfernt sie wieder vor dem Submit.
export type WizardAdSet = AdSetInput & { id: string };

export const emptyAdSet = (index: number, city?: string): WizardAdSet => ({
  id: crypto.randomUUID(),
  name: adSetName(index, city),
  addressString: "",
  radiusKm: 17,
  formId: "",
  bodies: [""],
  titles: [""],
  description: "",
  videos: [],
});

export const initialState = (customerId = "", initials = ""): WizardState => ({
  customerId,
  business: "",
  roles: [],
  roleFreeText: "",
  startDate: new Date().toISOString().slice(0, 10),
  initials,
  campaignName: "",
  nameEdited: false,
  dailyBudgetEuros: 17,
  adSets: [emptyAdSet(0)],
});

// sessionStorage statt Datenbank: Der Entwurf muss nur einen Reload überleben,
// die hochgeladenen Videos liegen ohnehin schon im Werbekonto.
export function useWizardState(defaults: WizardState) {
  const [state, setState] = useState<WizardState>(defaults);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as WizardState;
        // Alte Entwürfe aus sessionStorage kennen die id noch nicht – ohne
        // Nachrüsten würden React-keys undefined und Blöcke kollabieren.
        setState({
          ...parsed,
          adSets: parsed.adSets.map((s) => ({ ...s, id: s.id ?? crypto.randomUUID() })),
        });
      } catch {
        // kaputter Entwurf ist kein Grund, die Seite nicht zu zeigen
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) sessionStorage.setItem(KEY, JSON.stringify(state));
  }, [state, loaded]);

  return [state, setState, () => sessionStorage.removeItem(KEY)] as const;
}
