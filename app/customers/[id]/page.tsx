import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@heroui/styles";
import { Alert, Card, Chip, Separator, Typography } from "@/app/shell/ui";
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
        <Typography.Heading level={1} className="font-display text-xl">
          {c.name}
        </Typography.Heading>
        <Chip size="sm">{c.access === "own" ? "Eigen" : "Kunde"}</Chip>
      </div>

      {c.issues.length > 0 && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>Fehlender Zugriff</Alert.Title>
            <Alert.Description>
              {c.issues.join(" · ")} — führe <Typography.Code>bun run assign</Typography.Code> aus,
              nachdem du im Business Manager Zugriff gewährt hast.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {/* Kein Zugriffsproblem, sondern eines, das nur der Kunde selbst löst –
          deshalb eine eigene Meldung mit dem Weg dorthin statt einer Zeile in
          der Liste oben. */}
      {needsLeadgenTos(c.page) && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>Lead-Bedingungen nicht angenommen</Alert.Title>
            <Alert.Description>
              Meta lehnt jede Lead-Anzeige über {c.page?.name} ab, bis ein Administrator dieser
              Seite die Nutzungsbedingungen annimmt. Über die API ist das nicht möglich.
            </Alert.Description>
          </Alert.Content>
          <a
            href={leadgenTosUrl(c.page!.id)}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Bei Meta annehmen
          </a>
        </Alert>
      )}

      <div className="flex gap-2">
        <Link href={`/inbox?customer=${c.id}`} className={buttonVariants()}>
          Inbox öffnen
        </Link>
        <Link
          href={`/campaigns?customer=${c.id}`}
          className={buttonVariants({ variant: "outline" })}
        >
          Kampagnen
        </Link>
      </div>

      <Card>
        <Card.Header>
          <Card.Title>Assets</Card.Title>
        </Card.Header>
        <Card.Content className="text-sm">
          {assets.map((a, i) => (
            <div key={`${a.label}-${a.id ?? i}`}>
              {/* Die Linie trennt, statt jede Zeile zu unterstreichen – vor dem
                  ersten Eintrag gibt es deshalb nichts zu trennen. */}
              {i > 0 && <Separator />}
              <Asset {...a} />
            </div>
          ))}
        </Card.Content>
      </Card>
    </div>
  );
}

function Asset({ label, name, id }: { label: string; name?: string; id?: string }) {
  return (
    <div className="flex items-baseline gap-3 py-2">
      <span className="text-ink-500 w-28 shrink-0 text-xs">{label}</span>
      <span className="flex-1">{name ?? "—"}</span>
      <Typography.Code>{id ?? "—"}</Typography.Code>
    </div>
  );
}
