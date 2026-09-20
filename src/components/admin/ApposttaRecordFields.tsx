"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui";
import type { ApposttaField, ApposttaFieldDef } from "@/lib/types";

/** Chosen from the dropdown to reveal a free-text box instead. */
const CUSTOM = "__custom__";

export interface RowSpec {
  id?: string;
  label: string;
  /** Values offered for this row; empty means the value is typed. */
  options: string[];
  allow_custom: boolean;
}

/**
 * Turns the settings definitions into the rows a new record starts with, and their opening values.
 * Nothing here is editable as a row — that is what makes the definitions the single place rows are set.
 */
export function rowsFromDefs(defs: ApposttaFieldDef[]): { rows: RowSpec[]; values: string[] } {
  return {
    rows: defs.map((d) => ({ id: d.id, label: d.label, options: d.options, allow_custom: d.allow_custom })),
    values: defs.map((d) => d.default_value),
  };
}

/**
 * The rows an existing record already carries, which are frozen. A row whose definition still exists
 * keeps offering that definition's values; one whose definition is gone stays editable as free text,
 * so an old record can still be corrected without being dragged onto the newer rows.
 */
export function rowsFromRecord(fields: ApposttaField[], defs: ApposttaFieldDef[]): { rows: RowSpec[]; values: string[] } {
  return {
    rows: fields.map((f) => {
      const def = f.id ? defs.find((d) => d.id === f.id) : undefined;
      return {
        id: f.id,
        label: f.label,
        options: def?.options ?? [],
        allow_custom: def ? def.allow_custom : true,
      };
    }),
    values: fields.map((f) => f.value),
  };
}

/** One value per row. The labels are read-only because they come from the Appostta settings. */
export function ApposttaRecordFields({
  rows,
  values,
  onChange,
  disabled,
}: {
  rows: RowSpec[];
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  /** Rows switched to free text from the dropdown, which a blank value alone could not express. */
  const [custom, setCustom] = useState<Record<number, boolean>>({});

  function set(index: number, value: string) {
    onChange(values.map((v, i) => (i === index ? value : v)));
  }

  if (rows.length === 0) {
    return (
      <p className="text-[12.5px] text-text-muted">
        No certificate rows are set up yet. Open Appostta settings and add the rows every record should carry.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => {
        const value = values[i] ?? "";
        const hasOptions = row.options.length > 0;
        // A stored value that is not in the list is still shown, so opening an old record never
        // silently rewrites what it says.
        const offList = hasOptions && value !== "" && !row.options.includes(value);
        const typing = !hasOptions || offList || Boolean(custom[i]);

        return (
          <div key={row.id ?? i} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2 items-center">
            <div className="text-[13px] text-text flex items-baseline gap-1.5 min-w-0">
              <span className="text-[11px] text-text-muted tabular-nums">{i + 1}</span>
              <span className="truncate">{row.label}</span>
            </div>

            {typing ? (
              <div className="flex gap-2">
                <Input
                  value={value}
                  disabled={disabled}
                  placeholder={hasOptions ? "Custom value" : `Value for ${row.label}`}
                  onChange={(e) => set(i, e.target.value)}
                />
                {hasOptions ? (
                  <button
                    type="button"
                    disabled={disabled}
                    className="text-[12.5px] text-text-muted hover:text-text whitespace-nowrap cursor-pointer"
                    onClick={() => {
                      setCustom((c) => ({ ...c, [i]: false }));
                      set(i, "");
                    }}
                  >
                    Use list
                  </button>
                ) : null}
              </div>
            ) : (
              <Select
                value={value}
                disabled={disabled}
                onChange={(e) => {
                  const picked = e.target.value === CUSTOM;
                  setCustom((c) => ({ ...c, [i]: picked }));
                  if (!picked) set(i, e.target.value);
                }}
              >
                <option value="">— leave blank —</option>
                {row.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
                {row.allow_custom ? <option value={CUSTOM}>Something else…</option> : null}
              </Select>
            )}
          </div>
        );
      })}
    </div>
  );
}
