import { Typography } from "@/app/shell/ui";
import {
  clients,
  listCustomers,
  needsLeadgenTos,
  payers,
  resolveClientByName,
} from "@/lib/customers";
import { KNOWN_INITIALS } from "@/lib/naming";
import { Wizard } from "./wizard";

export default async function NewCampaignPage({ searchParams }: PageProps<"/campaigns/new">) {
  const sp = await searchParams;
  const { customers } = await listCustomers();

  // Zwei Achsen, zwei Listen: das Konto zahlt, die Seite veröffentlicht.
  // Ein Konto ohne Seite ist brauchbar (MedArbeiter zahlt für fremde Seiten),
  // eine Seite ohne Konto ebenso – vorher fiel beides zusammen durch das Raster.
  // Ein Konto kann mehreren Kunden gehören (MedArbeiter zahlt über dasselbe
  // Konto auch für "Jobs - MedArbeiter") – zur Wahl steht es trotzdem einmal.
  const byId = new Map<string, { id: string; name: string; customerId: string; customerName: string }>();
  for (const c of payers(customers))
    for (const a of c.adAccounts)
      if (!byId.has(a.id))
        byId.set(a.id, { id: a.id, name: a.name, customerId: c.id, customerName: c.name });
  const accounts = [...byId.values()];
  const clientOptions = clients(customers)
    .map((c) => ({
      id: c.id,
      name: c.name,
      pageId: c.page!.id,
      pageName: c.page!.name,
      instagram: c.instagram,
      // Der einzige Blocker, der schon vor jeder Eingabe feststeht: ohne
      // angenommene Lead-Gen-Bedingungen lehnt Meta jede Anzeige dieser Seite
      // ab, und niemand außer einem Administrator der Seite kann das ändern.
      needsLeadgenTos: needsLeadgenTos(c.page),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  // Instagram kommt im bestehenden Seiten-Portfolio-Aufruf mit. Dadurch kann
  // der Client den Nutzernamen sofort zeigen, ohne nach der Auswahl noch einen
  // Server-Action-Roundtrip zu starten.

  const requested = typeof sp.customer === "string" ? sp.customer : undefined;
  // Reihenfolge: URL-Parameter, sonst MedArbeiter (das übliche Konto),
  // sonst irgendein nutzbares Konto – nie ganz ohne Auswahl starten.
  // Über die Kundenliste gesucht, nicht über die entdoppelte Kontenliste: sonst
  // verlöre der zweite Eigentümer eines geteilten Kontos seine Vorauswahl.
  const accountOf = (id?: string) => customers.find((c) => c.id === id)?.adAccounts[0]?.id;
  const defaultAccount = accountOf(requested) ?? accountOf("medarbeiter") ?? accounts[0]?.id ?? "";

  // Ein ?client=-Parameter darf den beworbenen Kunden vorbelegen; getippt wird
  // sein Name, weil dasselbe Feld den Kampagnennamen speist.
  const requestedClient = typeof sp.client === "string" ? sp.client : undefined;
  const defaultBusiness =
    clientOptions.find((c) => c.id === requestedClient)?.name ??
    (requestedClient ? resolveClientByName(clientOptions, requestedClient)?.name : undefined) ??
    "";

  return (
    <div className="space-y-4">
      <Typography.Heading level={1} className="font-display text-xl">
        Neue Kampagne
      </Typography.Heading>
      <Typography.Paragraph color="muted" size="sm">
        Erstellt Kampagne, Anzeigengruppe und eine Anzeige pro Datei — alles pausiert.
      </Typography.Paragraph>
      <Wizard
        accounts={accounts}
        clients={clientOptions}
        knownInitials={[...KNOWN_INITIALS]}
        defaultAccount={defaultAccount}
        defaultBusiness={defaultBusiness}
      />
    </div>
  );
}
