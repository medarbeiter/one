import { Alert, Avatar, Chip, Table, Typography } from "@/app/shell/ui";
import { instagramAccountLabel, listCustomers, needsLeadgenTos } from "@/lib/customers";
import { ActiveFilters, FacetSearch, Facets } from "@/app/shell/facets";
import { TableBody } from "@/app/shell/table-body";

// Kein Logo im Portfolio – die Initialen sind das Erkennungszeichen der Zeile.
const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.toLowerCase() : undefined;
  const { customers, errors } = await listCustomers();
  // Über 200 Kunden scrollt niemand durch – die Suche ist der Einstieg.
  const rows = q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Typography.Heading level={1} className="font-display text-xl">
          Kunden
        </Typography.Heading>
        <Chip size="sm" variant="soft" className="tabular-nums">
          {rows.length}
        </Chip>
      </div>

      <Facets>
        <FacetSearch value={q} />
      </Facets>
      <ActiveFilters params={sp} labels={{ q: "Suche" }} />

      {/* Ein Kunde ohne Freigabe darf die Übersicht nicht leeren – Fehler werden oben angezeigt. */}
      {errors.map((e, i) => (
        <Alert key={i} status="danger">
          <Alert.Content>
            <Alert.Title>Portfolio teilweise nicht verfügbar</Alert.Title>
            <Alert.Description>{e.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ))}

      {/* Table bringt die Karte selbst mit: graue Kopfzeile, weiße Zeilenfläche. */}
      <Table>
        <Table.Content aria-label="Kunden">
          <Table.Header>
            <Table.Column isRowHeader>Kunde</Table.Column>
            <Table.Column>Instagram</Table.Column>
            <Table.Column>Werbekonten</Table.Column>
            <Table.Column>Währung</Table.Column>
            <Table.Column>Zugriff</Table.Column>
            <Table.Column>Status</Table.Column>
          </Table.Header>
          <TableBody empty="Kein Kunde passt zu dieser Suche.">
            {rows.map((c) => (
              <Table.Row key={c.id} id={c.id} href={`/customers/${c.id}`}>
                {/* Zweizeilig wie in der Vorlage: die Seite steht unter dem Namen. */}
                <Table.Cell>
                  <span className="flex items-center gap-3">
                    <Avatar size="sm" variant="soft" color="accent">
                      <Avatar.Fallback>{initials(c.name)}</Avatar.Fallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="text-ink-900 block truncate font-medium">{c.name}</span>
                      {/* Die Seite heißt meist wie der Kunde – zweimal dasselbe zu lesen
                          ist keine Information. Nur der Unterschied kommt unter den Namen. */}
                      {c.page?.name !== c.name && (
                        <span className="text-ink-500 block truncate text-xs">
                          {c.page?.name ?? "keine Seite"}
                        </span>
                      )}
                    </span>
                  </span>
                </Table.Cell>
                <Table.Cell>{instagramAccountLabel(c.instagram) ?? "—"}</Table.Cell>
                <Table.Cell className="tabular-nums">{c.adAccounts.length}</Table.Cell>
                <Table.Cell>{c.adAccounts[0]?.currency ?? "—"}</Table.Cell>
                <Table.Cell>{c.access === "own" ? "Eigen" : "Kunde"}</Table.Cell>
                <Table.Cell>
                  {/* Drei Zustände in einer Spalte, nach Dringlichkeit: fehlender
                      Zugriff zuerst (ohne ihn wissen wir über die Seite ohnehin
                      nichts), dann die Bedingungen. Beides ist "nicht bereit",
                      aber nur das erste behebt die Agentur selbst. */}
                  {c.issues.length ? (
                    <Chip color="danger" variant="soft" size="sm">
                      {c.issues.length} Problem{c.issues.length > 1 ? "e" : ""}
                    </Chip>
                  ) : needsLeadgenTos(c.page) ? (
                    <Chip color="warning" variant="soft" size="sm">
                      Lead-Bedingungen offen
                    </Chip>
                  ) : (
                    <Chip color="success" variant="soft" size="sm">
                      OK
                    </Chip>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </TableBody>
        </Table.Content>
      </Table>
    </div>
  );
}
