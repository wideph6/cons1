"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Checkbox, Select } from "@/components/ui";
import { BOLD_MAX, BOLD_MIN, BOLD_NAMES, clampBold, INK, NO_FILL, QR_PAPER, type StyleKey, type TextStyle } from "@/lib/sticker-style";

/** Shades from black to grey, for making text darker or lighter in one click. */
const SHADES = ["#000000", "#262626", "#404040", "#595959", "#737373", "#8c8c8c"];

/**
 * The boldness and colour of a picked set's text on the sticker, one row per text half (its words, its
 * value, or the whole of a one-piece set). Used by New M's and Appo's background editors alike.
 */
export function StickerTextLook({
  rows,
  styles,
  madeBold,
  disabled,
  onChange,
}: {
  rows: Array<{ key: StyleKey; name: string }>;
  styles: Partial<Record<StyleKey, TextStyle>> | undefined;
  /** The boldness step each half is written with as made. */
  madeBold: (key: StyleKey) => number;
  disabled?: boolean;
  /** A half's new look, or null when it is back as made. */
  onChange: (key: StyleKey, style: TextStyle | null) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map(({ key, name }) => {
        const st = styles?.[key];
        const made = madeBold(key);
        const bold = st?.bold ?? made;
        const color = st?.color ?? INK;
        const put = (next: TextStyle) => {
          const out: TextStyle = {};
          if (next.bold !== undefined && next.bold !== made) out.bold = clampBold(next.bold);
          if (next.color && next.color !== INK) out.color = next.color;
          onChange(key, Object.keys(out).length ? out : null);
        };
        return (
          <div key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="w-24 shrink-0 text-[12.5px] font-medium truncate" title={name}>
              {name}
            </span>
            <span className="inline-flex items-center gap-1" title="Boldness">
              <span className="text-[12px] text-text-muted">Bold</span>
              <button
                type="button"
                className="grid place-items-center size-7 border rounded-md bg-surface hover:bg-surface-2 disabled:opacity-40"
                title="Lighter"
                aria-label={`${name}: lighter`}
                disabled={disabled || bold <= BOLD_MIN}
                onClick={() => put({ ...st, bold: bold - 1 })}
              >
                <Minus className="size-3.5" />
              </button>
              <Select
                value={bold}
                disabled={disabled}
                aria-label={`${name}: boldness`}
                className="w-40"
                // Inline: the control's own padding would otherwise cut the text off at this height.
                style={{ height: 28, paddingTop: 0, paddingBottom: 0, fontSize: 12.5 }}
                onChange={(e) => put({ ...st, bold: Number(e.target.value) })}
              >
                {BOLD_NAMES.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {i + 1} · {label}
                    {i + 1 === made ? " (as made)" : ""}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                className="grid place-items-center size-7 border rounded-md bg-surface hover:bg-surface-2 disabled:opacity-40"
                title="Bolder"
                aria-label={`${name}: bolder`}
                disabled={disabled || bold >= BOLD_MAX}
                onClick={() => put({ ...st, bold: bold + 1 })}
              >
                <Plus className="size-3.5" />
              </button>
            </span>
            <span className="inline-flex items-center gap-1" title="Colour: darker or lighter, or any other">
              <span className="text-[12px] text-text-muted">Colour</span>
              {SHADES.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={disabled}
                  title={c === INK ? "Black (as made)" : c}
                  aria-label={`${name}: colour ${c}`}
                  aria-pressed={color === c}
                  className={`size-5 rounded-full border ${color === c ? "ring-2 ring-teal-600 ring-offset-1" : ""}`}
                  style={{ background: c }}
                  onClick={() => put({ ...st, color: c })}
                />
              ))}
              <input
                type="color"
                value={color}
                disabled={disabled}
                aria-label={`${name}: any colour`}
                title="Any colour"
                className="h-6 w-8 cursor-pointer rounded border bg-surface p-0"
                onChange={(e) => put({ ...st, color: e.target.value })}
              />
            </span>
            {st ? (
              <button type="button" className="text-[12px] text-teal-700 hover:underline" disabled={disabled} onClick={() => onChange(key, null)}>
                As made
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** The colour behind the QR code: white as made, any other, or none so the background shows through. */
export function QrPaperField({
  value,
  disabled,
  onChange,
}: {
  /** Left out for white; NO_FILL for none. */
  value: string | undefined;
  disabled?: boolean;
  onChange: (fill: string | undefined) => void;
}) {
  const none = value === NO_FILL;
  const color = none ? QR_PAPER : (value ?? QR_PAPER);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="w-24 shrink-0 text-[12.5px] font-medium">Behind the QR</span>
      <label className="inline-flex items-center gap-1.5 text-[12.5px]">
        <input
          type="color"
          value={color}
          disabled={disabled || none}
          aria-label="Colour behind the QR code"
          className="h-6 w-8 cursor-pointer rounded border bg-surface p-0 disabled:opacity-40"
          onChange={(e) => onChange(e.target.value.toLowerCase() === QR_PAPER ? undefined : e.target.value)}
        />
        <span className="text-text-muted">{none ? "no colour" : color}</span>
      </label>
      <Checkbox
        label="No colour (the background shows)"
        checked={none}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked ? NO_FILL : undefined)}
      />
      {value !== undefined ? (
        <Button size="sm" disabled={disabled} onClick={() => onChange(undefined)}>
          White, as made
        </Button>
      ) : null}
      <span className="basis-full text-[12px] text-text-muted">
        The colour fills the square exactly behind the code. Keep it light, or phones may not read the code.
      </span>
    </div>
  );
}

/** Every set of the sticker with a box to turn it on or off; a set turned off is left off every sticker. */
export function StickerSetsShown<Id extends string>({
  sets,
  shown,
  disabled,
  onChange,
}: {
  sets: ReadonlyArray<{ id: Id; name: string }>;
  shown: (id: Id) => boolean;
  disabled?: boolean;
  onChange: (id: Id, on: boolean) => void;
}) {
  return (
    <div className="rounded-md border bg-surface-2 p-3 space-y-2">
      <div className="text-[12.5px] font-medium">
        On the sticker
        <span className="font-normal text-text-muted"> · untick a set to leave it off every sticker; tick it to bring it back.</span>
      </div>
      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {sets.map((s) => (
          <Checkbox key={s.id} label={s.name} checked={shown(s.id)} disabled={disabled} onChange={(e) => onChange(s.id, e.target.checked)} />
        ))}
      </div>
    </div>
  );
}

const PRINT_UNITS = [
  { id: "cm", label: "cm", points: 72 / 2.54, step: 0.1 },
  { id: "mm", label: "mm", points: 72 / 25.4, step: 1 },
  { id: "in", label: "inch", points: 72, step: 0.05 },
] as const;
type PrintUnit = (typeof PRINT_UNITS)[number]["id"];

/**
 * The size the whole sticker prints at: the background (image or PDF) with every value, word and the QR code
 * on it, as one. Width or height can be typed; the other follows, so the sticker keeps its shape. Stored as
 * the width in points (printWidth); left out, it prints as made.
 */
export function PrintSizeField({
  size,
  madePoints,
  value,
  disabled,
  onChange,
}: {
  /** The sticker's own size, in sticker units. */
  size: { width: number; height: number };
  /** Points per sticker unit as made: the background PDF's own size, or 96 units to the inch. */
  madePoints: number;
  /** The width set, in points; null for as made. */
  value: number | null;
  disabled?: boolean;
  onChange: (printWidth: number | null) => void;
}) {
  const [unit, setUnit] = useState<PrintUnit>("cm");
  const u = PRINT_UNITS.find((x) => x.id === unit)!;
  const widthPt = value ?? size.width * madePoints;
  const heightPt = (widthPt * size.height) / size.width;
  /** A length in points, in the chosen unit: whole millimetres, or hundredths of a centimetre or inch. */
  const shown = (pt: number) => String(Number((pt / u.points).toFixed(unit === "mm" ? 0 : 2)));
  const [draft, setDraft] = useState<{ w: string; h: string } | null>(null);
  useEffect(() => setDraft(null), [value, unit, size.width, size.height]);
  const put = (side: "w" | "h", text: string) => {
    setDraft(side === "w" ? { w: text, h: shown(heightPt) } : { w: shown(widthPt), h: text });
    const n = Number(text);
    if (!text.trim() || !Number.isFinite(n) || n <= 0) return;
    const pt = n * u.points;
    const w = side === "w" ? pt : (pt * size.width) / size.height;
    if (w < 28.35 || w > 14400) return;
    onChange(Math.round(w * 100) / 100);
  };
  return (
    <div className="rounded-md border bg-surface-2 p-3 space-y-2">
      <div className="text-[12.5px] font-medium">
        Print size of the whole sticker
        <span className="font-normal text-text-muted">
          {" "}
          · the background and everything on it (words, values, signature, QR code) print together as one set, at this size.
          Type the width or the height; the other follows, so nothing is stretched.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <label className="inline-flex items-center gap-1.5">
          Width
          <input
            type="number"
            min={0}
            step={u.step}
            value={draft?.w ?? shown(widthPt)}
            disabled={disabled}
            aria-label="Printed width"
            className="w-24 rounded-md border border-line-strong bg-surface px-2 h-8"
            onChange={(e) => put("w", e.target.value)}
            onBlur={() => setDraft(null)}
          />
        </label>
        <span>×</span>
        <label className="inline-flex items-center gap-1.5">
          Height
          <input
            type="number"
            min={0}
            step={u.step}
            value={draft?.h ?? shown(heightPt)}
            disabled={disabled}
            aria-label="Printed height"
            className="w-24 rounded-md border border-line-strong bg-surface px-2 h-8"
            onChange={(e) => put("h", e.target.value)}
            onBlur={() => setDraft(null)}
          />
        </label>
        <select
          value={unit}
          disabled={disabled}
          aria-label="Unit"
          className="rounded-md border border-line-strong bg-surface px-2 h-8"
          onChange={(e) => setUnit(e.target.value as PrintUnit)}
        >
          {PRINT_UNITS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        {value !== null ? (
          <Button size="sm" disabled={disabled} onClick={() => onChange(null)}>
            As made ({(Math.round(((size.width * madePoints) / u.points) * 100) / 100).toString()} {u.label} wide)
          </Button>
        ) : (
          <span className="text-text-muted">as made</span>
        )}
      </div>
    </div>
  );
}
