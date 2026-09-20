"use client";

import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Checkbox, IconButton, Input } from "@/components/ui";
import type { ApposttaFieldDef } from "@/lib/types";

const MAX_OPTIONS = 60;

/** Ids only have to be unique within the list; they exist so records stay matched to a row. */
function newId(): string {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * The certificate rows, defined once for the whole panel.
 *
 * Each row is a label plus the values it offers. A record created afterwards does not edit this
 * list — it only picks one of the values, which is the point of setting them up here.
 */
export function ApposttaFieldDefs({
  value,
  onChange,
  max = 24,
  disabled,
}: {
  value: ApposttaFieldDef[];
  onChange: (next: ApposttaFieldDef[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  /** What is typed in each row's "add a value" box, keyed by row id. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function patch(index: number, part: Partial<ApposttaFieldDef>) {
    onChange(value.map((f, i) => (i === index ? { ...f, ...part } : f)));
  }

  function move(index: number, delta: number) {
    const next = [...value];
    const target = index + delta;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    onChange(next);
  }

  function addOption(index: number) {
    const def = value[index];
    if (!def) return;
    const text = (drafts[def.id] ?? "").trim();
    if (!text || def.options.includes(text) || def.options.length >= MAX_OPTIONS) return;
    patch(index, { options: [...def.options, text] });
    setDrafts((d) => ({ ...d, [def.id]: "" }));
  }

  function removeOption(index: number, option: string) {
    const def = value[index];
    if (!def) return;
    patch(index, {
      options: def.options.filter((o) => o !== option),
      // A default that was just deleted would be a pick nobody could make again.
      default_value: def.default_value === option ? "" : def.default_value,
    });
  }

  return (
    <div className="space-y-2.5">
      {value.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">
          No rows yet. Add the rows every certificate should carry — new records will start with them.
        </p>
      ) : null}

      {value.map((def, i) => (
        <div key={def.id} className="rounded-md border bg-surface-2/40 p-3 space-y-2.5">
          <div className="flex items-start gap-2">
            <span className="text-[11px] text-text-muted tabular-nums pt-2.5 w-4 shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <Input
                value={def.label}
                disabled={disabled}
                placeholder="Row label, e.g. Document type"
                onChange={(e) => patch(i, { label: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <IconButton label={`Move row ${i + 1} up`} disabled={disabled || i === 0} onClick={() => move(i, -1)}>
                <ChevronUp className="size-4" />
              </IconButton>
              <IconButton
                label={`Move row ${i + 1} down`}
                disabled={disabled || i === value.length - 1}
                onClick={() => move(i, 1)}
              >
                <ChevronDown className="size-4" />
              </IconButton>
              <IconButton
                label={`Remove row ${i + 1}`}
                tone="danger"
                disabled={disabled}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          </div>

          <div className="pl-6 space-y-2">
            <div className="text-[12px] text-text-muted">
              Values to choose from when a record is created. Leave empty to type the value each time.
            </div>

            {def.options.length ? (
              <div className="flex flex-wrap gap-1.5">
                {def.options.map((o) => (
                  <span
                    key={o}
                    className="inline-flex items-center gap-1 rounded border bg-surface px-2 py-0.5 text-[12.5px]"
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      title={def.default_value === o ? "Preselected on new records" : "Preselect this on new records"}
                      className="cursor-pointer disabled:cursor-default"
                      onClick={() => patch(i, { default_value: def.default_value === o ? "" : o })}
                    >
                      {o}
                    </button>
                    {def.default_value === o ? <Badge tone="teal">default</Badge> : null}
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Remove value ${o}`}
                      className="text-text-faint hover:text-danger-600"
                      onClick={() => removeOption(i, o)}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="flex gap-2">
              <Input
                value={drafts[def.id] ?? ""}
                disabled={disabled || def.options.length >= MAX_OPTIONS}
                placeholder="Add a value, then press Enter"
                onChange={(e) => setDrafts((d) => ({ ...d, [def.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  // Enter inside a modal would otherwise submit the whole settings form.
                  e.preventDefault();
                  addOption(i);
                }}
              />
              <Button
                size="sm"
                disabled={disabled || !(drafts[def.id] ?? "").trim() || def.options.length >= MAX_OPTIONS}
                onClick={() => addOption(i)}
              >
                Add
              </Button>
            </div>

            {def.options.length === 0 ? (
              <Input
                value={def.default_value}
                disabled={disabled}
                placeholder="Optional: value prefilled on every new record"
                onChange={(e) => patch(i, { default_value: e.target.value })}
              />
            ) : (
              <Checkbox
                checked={def.allow_custom}
                disabled={disabled}
                label="Allow a value outside this list"
                description="Off means a record must pick one of the values above."
                onChange={(e) => patch(i, { allow_custom: e.target.checked })}
              />
            )}
          </div>
        </div>
      ))}

      <Button
        size="sm"
        icon={<Plus className="size-3.5" />}
        disabled={disabled || value.length >= max}
        onClick={() =>
          onChange([...value, { id: newId(), label: "", options: [], allow_custom: true, default_value: "" }])
        }
      >
        Add row
      </Button>
      {value.length >= max ? <span className="ml-2 text-[12px] text-text-muted">Maximum {max} rows.</span> : null}
    </div>
  );
}
