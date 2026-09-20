"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui";
import type { ApposttaField, ApposttaFieldDef, ApposttaFieldPart } from "@/lib/types";

/** Chosen from the dropdown to reveal a free-text box instead. */
const CUSTOM = "__custom__";

/** One half of a row as the record form needs it: a heading and what may be put under it. */
export interface PartSpec {
  label: string;
  /** Values offered for this part; empty means the value is typed. */
  options: string[];
  allow_custom: boolean;
}

export interface RowSpec {
  id?: string;
  first: PartSpec;
  /** Present on a split row. It shares the row's number and has its own heading. */
  second?: PartSpec;
}

/** The value a row holds: one per part. */
export interface RowValue {
  value: string;
  second: string;
}

function specFromPart(part: ApposttaFieldPart): PartSpec {
  return { label: part.label, options: part.options, allow_custom: part.allow_custom };
}

/**
 * Turns the settings definitions into the rows a new record starts with, and their opening values.
 * Nothing here is editable as a row — that is what makes the definitions the single place rows are set.
 */
export function rowsFromDefs(defs: ApposttaFieldDef[]): { rows: RowSpec[]; values: RowValue[] } {
  return {
    rows: defs.map((d) => ({
      id: d.id,
      first: specFromPart(d),
      second: d.second ? specFromPart(d.second) : undefined,
    })),
    values: defs.map((d) => ({ value: d.default_value, second: d.second?.default_value ?? "" })),
  };
}

/**
 * The rows an existing record already carries, which are frozen. A part whose definition still exists
 * keeps offering that definition's values; one whose definition is gone stays editable as free text,
 * so an old record can still be corrected without being dragged onto the newer rows.
 *
 * A row that was split when it was created stays split, with the two headings it was given.
 */
export function rowsFromRecord(
  fields: ApposttaField[],
  defs: ApposttaFieldDef[],
): { rows: RowSpec[]; values: RowValue[] } {
  return {
    rows: fields.map((f) => {
      const def = f.id ? defs.find((d) => d.id === f.id) : undefined;
      const free = (label: string): PartSpec => ({ label, options: [], allow_custom: true });
      return {
        id: f.id,
        first: def ? { ...specFromPart(def), label: f.label } : free(f.label),
        second: f.second
          ? def?.second
            ? { ...specFromPart(def.second), label: f.second.label }
            : free(f.second.label)
          : undefined,
      };
    }),
    values: fields.map((f) => ({ value: f.value, second: f.second?.value ?? "" })),
  };
}

/** One part's editor: a dropdown of the values it offers, or a text box where it offers none. */
function PartInput({
  part,
  value,
  onChange,
  disabled,
}: {
  part: PartSpec;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  /** Switched to free text from the dropdown, which a blank value alone could not express. */
  const [custom, setCustom] = useState(false);

  const hasOptions = part.options.length > 0;
  // A stored value that is not in the list is still shown, so opening an old record never silently
  // rewrites what it says.
  const offList = hasOptions && value !== "" && !part.options.includes(value);
  const typing = !hasOptions || offList || custom;

  if (typing) {
    return (
      <div className="flex gap-2">
        <Input
          value={value}
          disabled={disabled}
          placeholder={hasOptions ? "Custom value" : `Value for ${part.label}`}
          onChange={(e) => onChange(e.target.value)}
        />
        {hasOptions ? (
          <button
            type="button"
            disabled={disabled}
            className="text-[12.5px] text-text-muted hover:text-text whitespace-nowrap cursor-pointer"
            onClick={() => {
              setCustom(false);
              onChange("");
            }}
          >
            Use list
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <Select
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const picked = e.target.value === CUSTOM;
        setCustom(picked);
        if (!picked) onChange(e.target.value);
      }}
    >
      <option value="">— leave blank —</option>
      {part.options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      {part.allow_custom ? <option value={CUSTOM}>Something else…</option> : null}
    </Select>
  );
}

/** One value per part. The headings are read-only because they come from the Appostta settings. */
export function ApposttaRecordFields({
  rows,
  values,
  onChange,
  disabled,
}: {
  rows: RowSpec[];
  values: RowValue[];
  onChange: (next: RowValue[]) => void;
  disabled?: boolean;
}) {
  function set(index: number, part: Partial<RowValue>) {
    onChange(values.map((v, i) => (i === index ? { ...v, ...part } : v)));
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
        const held = values[i] ?? { value: "", second: "" };
        return (
          <div key={row.id ?? i} className="flex items-start gap-1.5">
            {/* Printed once per row, whether or not the row is split. */}
            <span className="text-[11px] text-text-muted tabular-nums w-4 shrink-0 pt-2.5">{i + 1}</span>

            <div
              className={
                row.second
                  ? "flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-surface-2/40 px-2.5 py-2"
                  : "flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2 items-center"
              }
            >
              {row.second ? (
                <>
                  <div className="space-y-1 min-w-0">
                    <div className="text-[12.5px] text-text truncate">{row.first.label}</div>
                    <PartInput
                      part={row.first}
                      value={held.value}
                      disabled={disabled}
                      onChange={(v) => set(i, { value: v })}
                    />
                  </div>
                  <div className="space-y-1 min-w-0 sm:border-l sm:border-line sm:pl-4">
                    <div className="text-[12.5px] text-text truncate">{row.second.label}</div>
                    <PartInput
                      part={row.second}
                      value={held.second}
                      disabled={disabled}
                      onChange={(v) => set(i, { second: v })}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[13px] text-text truncate min-w-0">{row.first.label}</div>
                  <PartInput
                    part={row.first}
                    value={held.value}
                    disabled={disabled}
                    onChange={(v) => set(i, { value: v })}
                  />
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
