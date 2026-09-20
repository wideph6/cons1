"use client";

import { ChevronDown, ChevronUp, Columns2, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Checkbox, IconButton, Input } from "@/components/ui";
import type { ApposttaFieldDef, ApposttaFieldPart } from "@/lib/types";

const MAX_OPTIONS = 60;

/** Ids only have to be unique within the list; they exist so records stay matched to a row. */
function newId(): string {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function emptyPart(): ApposttaFieldPart {
  return { label: "", options: [], allow_custom: true, default_value: "" };
}

/**
 * One half of a row: its heading and the values it offers. A row that is not split has only the
 * first of these; a split row has two, sharing the row's single number.
 */
function PartEditor({
  part,
  onChange,
  draft,
  onDraft,
  placeholder,
  disabled,
}: {
  part: ApposttaFieldPart;
  onChange: (next: ApposttaFieldPart) => void;
  /** What is typed in this part's "add a value" box. */
  draft: string;
  onDraft: (next: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  function addOption() {
    const text = draft.trim();
    if (!text || part.options.includes(text) || part.options.length >= MAX_OPTIONS) return;
    onChange({ ...part, options: [...part.options, text] });
    onDraft("");
  }

  function removeOption(option: string) {
    onChange({
      ...part,
      options: part.options.filter((o) => o !== option),
      // A default that was just deleted would be a pick nobody could make again.
      default_value: part.default_value === option ? "" : part.default_value,
    });
  }

  return (
    <div className="space-y-2">
      <Input
        value={part.label}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange({ ...part, label: e.target.value })}
      />

      {part.options.length ? (
        <div className="flex flex-wrap gap-1.5">
          {part.options.map((o) => (
            <span key={o} className="inline-flex items-center gap-1 rounded border bg-surface px-2 py-0.5 text-[12.5px]">
              <button
                type="button"
                disabled={disabled}
                title={part.default_value === o ? "Preselected on new records" : "Preselect this on new records"}
                className="cursor-pointer disabled:cursor-default"
                onClick={() => onChange({ ...part, default_value: part.default_value === o ? "" : o })}
              >
                {o}
              </button>
              {part.default_value === o ? <Badge tone="teal">default</Badge> : null}
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove value ${o}`}
                className="text-text-faint hover:text-danger-600"
                onClick={() => removeOption(o)}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Input
          value={draft}
          disabled={disabled || part.options.length >= MAX_OPTIONS}
          placeholder="Add a value, then press Enter"
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Enter inside a modal would otherwise submit the whole settings form.
            e.preventDefault();
            addOption();
          }}
        />
        <Button size="sm" disabled={disabled || !draft.trim() || part.options.length >= MAX_OPTIONS} onClick={addOption}>
          Add
        </Button>
      </div>

      {part.options.length === 0 ? (
        <Input
          value={part.default_value}
          disabled={disabled}
          placeholder="Optional: value prefilled on every new record"
          onChange={(e) => onChange({ ...part, default_value: e.target.value })}
        />
      ) : (
        <Checkbox
          checked={part.allow_custom}
          disabled={disabled}
          label="Allow a value outside this list"
          description="Off means a record must pick one of the values above."
          onChange={(e) => onChange({ ...part, allow_custom: e.target.checked })}
        />
      )}
    </div>
  );
}

/**
 * The certificate rows, defined once for the whole panel.
 *
 * Each row is a heading plus the values it offers. A row can be split into two parts, each with its
 * own heading and values; the two sit on one numbered row, so the number is printed once at the
 * start. A record created afterwards does not edit any of this — it only picks values.
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
  /** What is typed in each part's "add a value" box, keyed by row id and part. */
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

  function setSplit(index: number, on: boolean) {
    const def = value[index];
    if (!def) return;
    if (on) patch(index, { second: emptyPart() });
    else onChange(value.map((f, i) => (i === index ? { ...f, second: undefined } : f)));
  }

  function draftFor(id: string, part: "a" | "b"): string {
    return drafts[`${id}:${part}`] ?? "";
  }

  function setDraft(id: string, part: "a" | "b", next: string) {
    setDrafts((d) => ({ ...d, [`${id}:${part}`]: next }));
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
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-muted tabular-nums w-4 shrink-0">{i + 1}</span>
            <span className="text-[12.5px] font-medium flex-1">
              {def.second ? "Split row — two headings, one number" : "Row"}
            </span>
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

          <div
            className={
              def.second
                ? "pl-6 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 sm:divide-x sm:divide-line"
                : "pl-6"
            }
          >
            <div className={def.second ? "sm:pr-4" : undefined}>
              <PartEditor
                part={def}
                disabled={disabled}
                placeholder={def.second ? "Left heading" : "Row heading, e.g. Document type"}
                draft={draftFor(def.id, "a")}
                onDraft={(t) => setDraft(def.id, "a", t)}
                onChange={(next) => patch(i, next)}
              />
            </div>

            {def.second ? (
              <div className="sm:pl-4">
                <PartEditor
                  part={def.second}
                  disabled={disabled}
                  placeholder="Right heading"
                  draft={draftFor(def.id, "b")}
                  onDraft={(t) => setDraft(def.id, "b", t)}
                  onChange={(next) => patch(i, { second: next })}
                />
              </div>
            ) : null}
          </div>

          <div className="pl-6">
            <Button
              size="sm"
              icon={def.second ? <X className="size-3.5" /> : <Columns2 className="size-3.5" />}
              disabled={disabled}
              onClick={() => setSplit(i, !def.second)}
            >
              {def.second ? "Merge back into one" : "Split into two parts"}
            </Button>
          </div>
        </div>
      ))}

      <Button
        size="sm"
        icon={<Plus className="size-3.5" />}
        disabled={disabled || value.length >= max}
        onClick={() => onChange([...value, { id: newId(), ...emptyPart() }])}
      >
        Add row
      </Button>
      {value.length >= max ? <span className="ml-2 text-[12px] text-text-muted">Maximum {max} rows.</span> : null}
    </div>
  );
}
