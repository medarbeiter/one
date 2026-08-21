"use client";

import { useSearchParams } from "next/navigation";
import { Button } from "@astryxdesign/core";
import { Sign } from "@/theme/icons";

/** Die Primäraktion der App, in jeder Ansicht an derselben Stelle. */
export function NewCampaign() {
  const customer = useSearchParams().get("customer");

  return (
    <Button
      href={`/campaigns/new${customer ? `?customer=${customer}` : ""}`}
      variant="primary"
      icon={<Sign meaning="add" />}
      label="Neue Kampagne"
    />
  );
}
