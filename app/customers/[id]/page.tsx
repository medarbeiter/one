import * as UI from "@/app/shell/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Banner, Button, Card, Separator } from "@/app/shell/ui";
import {
  findCustomer,
  instagramAccountLabel,
  leadgenTosUrl,
  listCustomers,
  needsLeadgenTos,
} from "@/lib/customers";

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const { customers } = await listCustomers();
  const c = findCustomer(customers, id);
  if (!c) notFound();

  const assets = [
    { label: "Seite", name: c.page?.name, id: c.page?.id },
    {
      label: "Instagram",
      name: instagramAccountLabel(c.instagram),
      id: c.instagram?.id,
    },
    ...c.adAccounts.map((a) => ({
      label: "Werbekonto",
      name: `${a.name} · ${a.currency}`,
      id: a.id,
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <UI.TypographyHeading level={1} className="font-display text-xl">
          {c.name}
        </UI.TypographyHeading>
        <Badge variant="neutral" label={c.access === "own" ? "Eigen" : "Kunde"} />
      </div>

      {c.issues.length > 0 && (
        <Banner
          status="error"
          title="Fehlender Zugriff"
          description={
            <>
              {c.issues.join(" · ")} — führe <UI.TypographyCode>bun run assign</UI.TypographyCode> aus,
              nachdem du im Business Manager Zugriff gewährt hast.
            </>
          }
        />
      )}

      {/* Kein Zugriffsproblem, sondern eines, das nur der Kunde selbst löst –
          deshalb eine eigene Meldung mit dem Weg dorthin statt einer Zeile in
          der Liste oben. */}
      {needsLeadgenTos(c.page) && (
        <Banner
          status="warning"
          title="Lead-Bedingungen nicht angenommen"
          description={`Meta lehnt jede Lead-Anzeige über ${c.page?.name} ab, bis ein Administrator dieser Seite die Nutzungsbedingungen annimmt. Über die API ist das nicht möglich.`}
          endContent={
            <Button
              href={leadgenTosUrl(c.page!.id)}
              target="_blank"
              rel="noreferrer"
              variant="secondary"
              size="sm"
              label="Bei Meta annehmen"
            />
          }
        />
      )}

      <div className="flex gap-2">
        <Button as={Link} href={`/inbox?customer=${c.id}`} label="Inbox öffnen" />
        <Button
          as={Link}
          href={`/campaigns?customer=${c.id}`}
          variant="secondary"
          label="Kampagnen"
        />
      </div>

      <Card>
        <UI.CardHeader className="flex items-center justify-between">
          <UI.CardTitle>Assets</UI.CardTitle>
        </UI.CardHeader>
        <UI.CardContent className="flex flex-col gap-4 text-sm">
          {assets.map((a, i) => (
            <div key={`${a.label}-${a.id ?? i}`}>
              {/* Die Linie trennt, statt jede Zeile zu unterstreichen – vor dem
                  ersten Eintrag gibt es deshalb nichts zu trennen. */}
              {i > 0 && <Separator />}
              <Asset {...a} />
            </div>
          ))}
        </UI.CardContent>
      </Card>
    </div>
  );
}

function Asset({ label, name, id }: { label: string; name?: string; id?: string }) {
  return (
    <div className="flex items-baseline gap-3 py-2">
      <span className="text-ink-500 w-28 shrink-0 text-xs">{label}</span>
      <span className="flex-1">{name ?? "—"}</span>
      <UI.TypographyCode>{id ?? "—"}</UI.TypographyCode>
    </div>
  );
}
