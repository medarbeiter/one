import * as UI from "@/app/shell/ui";
import Link from "next/link";
import { Avatar, Badge, Banner, Card, Table } from "@/app/shell/ui";
import { instagramAccountLabel, listCustomers, needsLeadgenTos } from "@/lib/customers";
import { ActiveFilters, FacetSearch, Facets } from "@/app/shell/facets";
import { TableBody } from "@/app/shell/table-body";

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
        <Badge variant="neutral" className="tabular-nums" label={rows.length} />
      </div>

      <Facets>
        <FacetSearch value={q} />
      </Facets>
      <ActiveFilters params={sp} labels={{ q: "Suche" }} />

      {/* Ein Kunde ohne Freigabe darf die Übersicht nicht leeren – Fehler werden oben angezeigt. */}
      {errors.map((e, i) => (
        <Banner
          key={i}
          status="error"
          title="Portfolio teilweise nicht verfügbar"
          description={e.message}
        />
      ))}

      {/* Astryx' Table ist selbst das <table> und bringt keine Fläche mit – die
          Karte, die HeroUIs Table noch selbst mitbrachte (graue Kopfzeile,
          weiße Zeilenfläche), steht deshalb hier: ohne Innenabstand, damit die
          Kopfzeile bündig mit dem Kartenrand abschließt. */}
      <Card elevation="low" padding={0}>
        {/* hasHover: nur der Name trägt den Link, also muss wenigstens die
            Zeile unter dem Zeiger zeigen, dass hier etwas anzuklicken ist. */}
        <Table aria-label="Kunden" hasHover>
          <UI.TableHeader>
            <UI.TableRow isHeaderRow>
              <UI.TableColumn>Kunde</UI.TableColumn>
              <UI.TableColumn>Instagram</UI.TableColumn>
              <UI.TableColumn>Werbekonten</UI.TableColumn>
              <UI.TableColumn>Währung</UI.TableColumn>
              <UI.TableColumn>Zugriff</UI.TableColumn>
              <UI.TableColumn>Status</UI.TableColumn>
            </UI.TableRow>
          </UI.TableHeader>
          {/* `columns` muss der Zahl der Kopfzellen oben entsprechen – der
              Leertext spannt sich über sie, und niemand merkt eine Abweichung. */}
          <TableBody columns={6} empty="Kein Kunde passt zu dieser Suche.">
            {rows.map((c) => (
              <UI.TableRow key={c.id} id={c.id}>
                {/* Zweizeilig wie in der Vorlage: die Seite steht unter dem Namen.
                    Astryx' Zeile ist nicht selbst verlinkbar – der Name trägt den
                    Link, wie in der Kampagnenliste. scope="row" macht diese Zelle
                    zum Zeilenkopf, damit ein Screenreader in den Zellen rechts
                    sagt, zu welchem Kunden sie gehören. */}
                <UI.TableCell scope="row">
                  <Link
                    href={`/customers/${c.id}`}
                    className="flex items-center gap-3 hover:underline"
                  >
                    {/* Kein Logo im Portfolio – die Initialen sind das
                        Erkennungszeichen der Zeile. Astryx' Avatar bildet sie
                        selbst aus `name`; ein Fallback-Kind gibt es nicht mehr.
                        Der Name steht direkt daneben im selben Link, das Bild
                        soll ihn nicht ein zweites Mal vorlesen – aber `name`
                        muss bleiben, sonst gibt es keine Initialen. Astryx
                        rechnet `alt || name`, ein leeres alt fällt also auf den
                        Namen zurück; nur der Wrapper nimmt ihn wirklich heraus.
                        tooltip={false} spart dazu den Tooltip, der sonst mitten
                        im Link einen zweiten Tabstopp aufmachte. */}
                    <span aria-hidden="true" className="contents">
                      <Avatar size="sm" name={c.name} tooltip={false} />
                    </span>
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
                  </Link>
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
                    <Badge
                      variant="error"
                      label={`${c.issues.length} Problem${c.issues.length > 1 ? "e" : ""}`}
                    />
                  ) : needsLeadgenTos(c.page) ? (
                    <Badge variant="warning" label="Lead-Bedingungen offen" />
                  ) : (
                    <Badge variant="success" label="OK" />
                  )}
                </UI.TableCell>
              </UI.TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
