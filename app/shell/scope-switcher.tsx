"use client";

import { ComboBox, Input, ListBox } from "@heroui/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Key } from "react";

const ALL = "__all__";

type Item = { id: string; name: string };

export function ScopeSwitcher({ customers }: { customers: Item[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Der Scope steht in der URL, nicht im State – sonst überlebt er keinen
  // Seitenwechsel und keinen Zurück-Button.
  function select(key: Key | null) {
    const next = new URLSearchParams(params);
    if (!key || key === ALL) next.delete("customer");
    else next.set("customer", String(key));
    // Eine Auswahl aus einem anderen Kunden gehört nicht in den neuen Scope.
    next.delete("item");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const items: Item[] = [{ id: ALL, name: "All customers" }, ...customers];

  return (
    <ComboBox
      aria-label="Customer scope"
      selectedKey={params.get("customer") ?? ALL}
      onSelectionChange={select}
      className="w-64"
    >
      <ComboBox.InputGroup>
        {/* Das eigentliche Eingabefeld – ComboBox.Value zeigt nur an, tippt aber nicht mit. */}
        <Input placeholder="All customers" />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox items={items}>
          {(c: Item) => (
            // textValue explizit setzen – ohne das findet der "contains"-Filter beim Tippen
            // keinen verlässlichen Text und die Liste läuft bei jedem Tastendruck leer.
            <ListBox.Item id={c.id} textValue={c.name}>
              {c.name}
            </ListBox.Item>
          )}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}
