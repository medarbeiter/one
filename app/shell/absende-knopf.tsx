"use client";

import { Button } from "@astryxdesign/core";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

/**
 * Ein Absendeknopf, der von selbst weiß, dass er gerade absendet — 1:1 aus
 * dem Hub übernommen (components/absende-knopf.tsx). `useFormStatus` liest
 * den Zustand des Formulars, in dem der Knopf *steht*; darum muss er eine
 * eigene Komponente sein und darf nicht im selben Bauteil wie das `<form>`
 * stehen. Die Abmeldung ist der Weg, an dem ein zweiter Klick am teuersten
 * ist: die Sitzung ist beim ersten schon fort, und der zweite läuft ins Leere.
 */
export function AbsendeKnopf(props: Omit<ComponentProps<typeof Button>, "type" | "isLoading">) {
  const { pending } = useFormStatus();
  return <Button {...props} type="submit" isLoading={pending} />;
}
