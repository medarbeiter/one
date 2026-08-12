import { listCustomers } from "@/lib/customers";
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

  const knownInitials = (process.env.META_INITIALS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-ink-900 text-2xl">New campaign</h1>
      <Wizard
        customers={usable.map((c) => ({
          id: c.id,
          name: c.name,
          adAccounts: c.adAccounts.map((a) => ({ id: a.id, name: a.name })),
        }))}
        knownInitials={knownInitials}
        defaultCustomer={defaultCustomer}
      />
    </div>
  );
}
