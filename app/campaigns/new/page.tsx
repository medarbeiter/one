import { listCustomers } from "@/lib/customers";
import { KNOWN_INITIALS } from "@/lib/naming";
import { Wizard } from "./wizard";

export default async function NewCampaignPage({ searchParams }: PageProps<"/campaigns/new">) {
  const sp = await searchParams;
  const { customers } = await listCustomers();
  // Ohne Seite und Konto lässt sich nichts anlegen – gar nicht erst anbieten.
  const usable = customers.filter((c) => c.page && c.adAccounts.length);

  const requested = typeof sp.customer === "string" ? sp.customer : undefined;
  // Reihenfolge: URL-Parameter, sonst MedArbeiter (das übliche Konto),
  // sonst irgendein nutzbares Konto – nie ganz ohne Auswahl starten.
  const defaultCustomer =
    (requested && usable.some((c) => c.id === requested) ? requested : undefined) ??
    (usable.some((c) => c.id === "medarbeiter") ? "medarbeiter" : usable[0]?.id) ??
    "";

  return (
    <div className="space-y-4">
      <h1 className="font-display text-ink-900 text-2xl">New campaign</h1>
      <Wizard
        customers={usable.map((c) => ({
          id: c.id,
          name: c.name,
          // usable filtert bereits auf c.page vorhanden – das ! ist hier sicher.
          pageId: c.page!.id,
          igId: c.igId,
          adAccounts: c.adAccounts.map((a) => ({ id: a.id, name: a.name })),
        }))}
        knownInitials={[...KNOWN_INITIALS]}
        defaultCustomer={defaultCustomer}
      />
    </div>
  );
}
