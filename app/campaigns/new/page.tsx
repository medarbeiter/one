import { listCustomers } from "@/lib/customers";
import { Stepper } from "./stepper";

export default async function NewCampaignPage({ searchParams }: PageProps<"/campaigns/new">) {
  const sp = await searchParams;
  const { customers } = await listCustomers();
  // Ohne Seite und Konto lässt sich nichts anlegen – gar nicht erst anbieten.
  const usable = customers.filter((c) => c.page && c.adAccounts.length);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-ink-900 text-2xl">New campaign</h1>
      <Stepper
        customers={usable.map((c) => ({
          id: c.id,
          name: c.name,
          adAccounts: c.adAccounts.map((a) => ({ id: a.id, name: a.name })),
        }))}
        defaultCustomer={typeof sp.customer === "string" ? sp.customer : undefined}
      />
    </div>
  );
}
