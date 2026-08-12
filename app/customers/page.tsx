import { Alert, Card, Chip, Table } from "@heroui/react";
import { listCustomers } from "@/lib/customers";

export default async function CustomersPage() {
  const { customers, errors } = await listCustomers();

  return (
    <div className="space-y-4">
      <h1 className="font-display text-ink-900 text-2xl">Customers</h1>

      {/* Ein Kunde ohne Freigabe darf die Übersicht nicht leeren – Fehler werden oben angezeigt. */}
      {errors.map((e, i) => (
        <Alert key={i} status="danger">
          <Alert.Content>
            <Alert.Title>Portfolio partly unavailable</Alert.Title>
            <Alert.Description>{e.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ))}

      <Card>
        <Card.Content>
          <Table>
            <Table.Content aria-label="Customers">
              <Table.Header>
                <Table.Column isRowHeader>Name</Table.Column>
                <Table.Column>Page</Table.Column>
                <Table.Column>Instagram</Table.Column>
                <Table.Column>Ad accounts</Table.Column>
                <Table.Column>Currency</Table.Column>
                <Table.Column>Access</Table.Column>
                <Table.Column>Status</Table.Column>
              </Table.Header>
              <Table.Body>
                {customers.map((c) => (
                  <Table.Row key={c.id} id={c.id} href={`/customers/${c.id}`}>
                    <Table.Cell>{c.name}</Table.Cell>
                    <Table.Cell>{c.page?.name ?? "—"}</Table.Cell>
                    <Table.Cell>{c.igId ? "connected" : "—"}</Table.Cell>
                    <Table.Cell className="tabular-nums">{c.adAccounts.length}</Table.Cell>
                    <Table.Cell>{c.adAccounts[0]?.currency ?? "—"}</Table.Cell>
                    <Table.Cell>{c.access === "own" ? "Own" : "Client"}</Table.Cell>
                    <Table.Cell>
                      {c.issues.length ? (
                        <Chip color="danger" size="sm">
                          {c.issues.length} issue{c.issues.length > 1 ? "s" : ""}
                        </Chip>
                      ) : (
                        <Chip color="success" size="sm">
                          OK
                        </Chip>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table>
        </Card.Content>
      </Card>
    </div>
  );
}
