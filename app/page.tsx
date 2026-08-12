import { Card, Table } from "@heroui/react";
import { listAssets } from "@/lib/customers";
import { meta } from "@/lib/meta";
import { Setup } from "./setup";

export default async function AssetsPage() {
  let assets;
  try {
    assets = await listAssets();
  } catch (e) {
    return <Setup error={(e as Error).message} />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <Card.Header>
          <Card.Title>Werbekonten</Card.Title>
          <Card.Description>Portfolio {meta.business}</Card.Description>
        </Card.Header>
        <Card.Content>
          <Table>
            <Table.Content aria-label="Werbekonten">
              <Table.Header>
                <Table.Column isRowHeader>Name</Table.Column>
                <Table.Column>ID</Table.Column>
                <Table.Column>Währung</Table.Column>
                <Table.Column>Status</Table.Column>
              </Table.Header>
              <Table.Body>
                {assets.accounts.map((a) => (
                  <Table.Row
                    key={a.id}
                    id={a.id}
                    href={`/campaigns?act=${a.id}`}
                  >
                    <Table.Cell>{a.name}</Table.Cell>
                    <Table.Cell className="font-mono text-xs">
                      {a.id}
                    </Table.Cell>
                    <Table.Cell>{a.currency}</Table.Cell>
                    <Table.Cell>
                      {a.account_status === 1
                        ? "aktiv"
                        : String(a.account_status)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table>
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Seiten</Card.Title>
        </Card.Header>
        <Card.Content>
          <Table>
            <Table.Content aria-label="Seiten">
              <Table.Header>
                <Table.Column isRowHeader>Name</Table.Column>
                <Table.Column>ID</Table.Column>
                <Table.Column>Fans</Table.Column>
              </Table.Header>
              <Table.Body>
                {assets.pages.map((p) => (
                  <Table.Row key={p.id} id={p.id}>
                    <Table.Cell>{p.name}</Table.Cell>
                    <Table.Cell className="font-mono text-xs">
                      {p.id}
                    </Table.Cell>
                    <Table.Cell>{p.fan_count ?? "–"}</Table.Cell>
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

export const dynamic = "force-dynamic";
