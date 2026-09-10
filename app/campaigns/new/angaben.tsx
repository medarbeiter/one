"use client";

import type { ReactNode } from "react";
import { Text } from "@astryxdesign/core";
import form from "./campaign-form.module.css";

/** Read-only information uses the same muted surface throughout the campaign form. */
export function Infotafel({
  titel,
  children,
  className = "",
}: {
  titel?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${form.info} ${className}`}>
      {titel ? (
        <Text type="large" weight="medium" as="h3" className={form.infoTitle}>
          {titel}
        </Text>
      ) : null}
      {children}
    </div>
  );
}

/** Label/value pairs stack on narrow screens and preserve their semantic relationship. */
export function Angaben({ titel, rows }: { titel?: ReactNode; rows: [string, string][] }) {
  return (
    <Infotafel titel={titel}>
      <dl className={form.values}>
        {rows.map(([k, v]) => <div key={k} className={form.valueRow}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </Infotafel>
  );
}
