import * as UI from "@/app/shell/ui";
import Link from "next/link";
import { Avatar, Badge, Banner, Table } from "@/app/shell/ui";
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

      {/* Astryx' Table ist selbst das <table> – die Kopfzeile braucht darum
          eine eigene Zeile, und die Karte darum entfällt. */}
      <Table aria-label="Kunden">
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
        <TableBody columns={6} empty="Kein Kunde passt zu dieser Suche.">
          {rows.map((c) => (
            <UI.TableRow key={c.id} id={c.id}>
              {/* Zweizeilig wie in der Vorlage: die Seite steht unter dem Namen.
                  Astryx' Zeile ist nicht selbst verlinkbar – der Name trägt den
                  Link, wie in der Kampagnenliste. */}
              <UI.TableCell>
                <Link href={`/customers/${c.id}`} className="flex items-center gap-3 hover:underline">
                  {/* Kein Logo im Portfolio – die Initialen sind das
                      Erkennungszeichen der Zeile. Astryx' Avatar bildet sie
                      selbst aus `name`; ein Fallback-Kind gibt es nicht mehr. */}
                  <Avatar size="sm" name={c.name} />
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
    </div>
  );
}
