import * as UI from "@/app/shell/ui";
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
        <UI.TypographyHeading level={1} className="font-display text-xl">
          Kunden
        </UI.TypographyHeading>
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
          <UI.AlertContent>
            <UI.AlertTitle>Portfolio teilweise nicht verfügbar</UI.AlertTitle>
            <UI.AlertDescription>{e.message}</UI.AlertDescription>
          </UI.AlertContent>
        </Alert>
      ))}

      {/* Table bringt die Karte selbst mit: graue Kopfzeile, weiße Zeilenfläche. */}
      <Table>
        <UI.TableContent aria-label="Kunden">
          <UI.TableHeader>
            <UI.TableColumn isRowHeader>Kunde</UI.TableColumn>
            <UI.TableColumn>Instagram</UI.TableColumn>
            <UI.TableColumn>Werbekonten</UI.TableColumn>
            <UI.TableColumn>Währung</UI.TableColumn>
            <UI.TableColumn>Zugriff</UI.TableColumn>
            <UI.TableColumn>Status</UI.TableColumn>
          </UI.TableHeader>
          <TableBody empty="Kein Kunde passt zu dieser Suche.">
            {rows.map((c) => (
              <UI.TableRow key={c.id} id={c.id} href={`/customers/${c.id}`}>
                {/* Zweizeilig wie in der Vorlage: die Seite steht unter dem Namen. */}
                <UI.TableCell>
                  <span className="flex items-center gap-3">
                    <Avatar size="sm" variant="soft" color="accent">
                      <UI.AvatarFallback>{initials(c.name)}</UI.AvatarFallback>
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
                </UI.TableCell>
                <UI.TableCell>{instagramAccountLabel(c.instagram) ?? "—"}</UI.TableCell>
                <UI.TableCell className="tabular-nums">{c.adAccounts.length}</UI.TableCell>
                <UI.TableCell>{c.adAccounts[0]?.currency ?? "—"}</UI.TableCell>
                <UI.TableCell>{c.access === "own" ? "Eigen" : "Kunde"}</UI.TableCell>
                <UI.TableCell>
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
                </UI.TableCell>
              </UI.TableRow>
            ))}
          </TableBody>
        </UI.TableContent>
      </Table>
    </div>
  );
}
