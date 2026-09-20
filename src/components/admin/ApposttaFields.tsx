"use client";

import { ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button, IconButton, Input } from "@/components/ui";
import type { ApposttaField } from "@/lib/types";

/** Editable label/value rows. The numbering shown here is the numbering printed on the certificate. */
export function ApposttaFields({
  value,
  onChange,
  max = 24,
  disabled,
}: {
  value: ApposttaField[];
  onChange: (next: ApposttaField[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  function patch(index: number, part: Partial<ApposttaField>) {
    onChange(value.map((f, i) => (i === index ? { ...f, ...part } : f)));
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function move(index: number, delta: number) {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">No rows yet. Add the first one below.</p>
      ) : null}

      {value.map((f, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex flex-col items-center pt-2 w-5 shrink-0">
            <span className="text-[11px] text-text-muted tabular-nums">{i + 1}</span>
            <button
              type="button"
              className="text-text-faint hover:text-text disabled:opacity-30 cursor-pointer"
              title="Move up"
              aria-label={`Move row ${i + 1} up`}
              disabled={disabled || i === 0}
              onClick={() => move(i, -1)}
            >
              <ChevronUp className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 flex-1 min-w-0">
            <Input
              value={f.label}
              disabled={disabled}
              placeholder="Label, e.g. Document type"
              onChange={(e) => patch(i, { label: e.target.value })}
            />
            <Input
              value={f.value}
              disabled={disabled}
              placeholder="Value"
              onChange={(e) => patch(i, { value: e.target.value })}
            />
          </div>
          <IconButton label={`Remove row ${i + 1}`} tone="danger" disabled={disabled} onClick={() => remove(i)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ))}

      <Button
        size="sm"
        icon={<Plus className="size-3.5" />}
        disabled={disabled || value.length >= max}
        onClick={() => onChange([...value, { label: "", value: "" }])}
      >
        Add row
      </Button>
      {value.length >= max ? <span className="ml-2 text-[12px] text-text-muted">Maximum {max} rows.</span> : null}
    </div>
  );
}
