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

/** A4 paper's width, in millimetres. */
const A4_MM = 210;

/**
 * How the sticker sits across an A4 page, set with one slider once its words, values and QR code are in place:
 * white left on both sides, edge to edge, or its sides cut. The page is A4-wide; its length follows the sticker,
 * so the longer the image, the longer the page.
 */
export function PageWidthField({
  size,
  value,
  disabled,
  onChange,
}: {
  /** The sticker's own size, in sticker units (its background as shown). */
  size: { width: number; height: number };
  /** The sticker's width against the page's (1 = edge to edge). */
  value: number;
  disabled?: boolean;
  onChange: (k: number) => void;
}) {
  const min = 0.2;
  const max = 2;
  const put = (k: number) => onChange(Math.round(Math.min(max, Math.max(min, k)) * 1000) / 1000);
  // The slider runs in millimetres left at each side: positive is white, negative is cut off.
  const side = ((1 - value) * A4_MM) / 2;
  const toFill = (mm: number) => 1 - (2 * mm) / A4_MM;
  const stickerMm = A4_MM * value;
  const lengthMm = (stickerMm * size.height) / size.width;
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  return (
    <div className="rounded-md border bg-surface-2 p-3 space-y-2">
      <div className="text-[12.5px] font-medium">
        Page width (A4)
        <span className="font-normal text-text-muted">
          {" "}
          · set once the words, values and QR code are in place: how much white is left at the sides of an A4 page, none,
          or how much of the sticker&apos;s sides is cut. The page&apos;s length follows on its own.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="w-28">White at each side</span>
        <input
          type="range"
          min={-((max - 1) * A4_MM) / 2}
          max={((1 - min) * A4_MM) / 2}
          step={0.5}
          value={side}
          disabled={disabled}
          aria-label="White at each side of the A4 page, in millimetres (less than 0 cuts the sticker's sides)"
          className="w-64 accent-teal-600"
          onChange={(e) => put(toFill(Number(e.target.value)))}
        />
        <input
          type="number"
          step={0.5}
          value={draft ?? String(Math.round(side * 10) / 10)}
          disabled={disabled}
          aria-label="White at each side, in millimetres"
          className="w-20 rounded-md border border-line-strong bg-surface px-2 h-8"
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(n)) put(toFill(n));
          }}
          onBlur={() => setDraft(null)}
        />
        <span>mm</span>
        {Math.abs(value - 1) > 0.0005 ? (
          <Button size="sm" disabled={disabled} onClick={() => onChange(1)}>
            Edge to edge
          </Button>
        ) : null}
      </div>
      <p className="text-[12px] text-text-muted">
        {Math.abs(side) < 0.25
          ? "Edge to edge: "
          : side > 0
            ? `${(Math.round(side * 10) / 10).toString()} mm of white on the left and on the right: `
            : `${(Math.round(-side * 10) / 10).toString()} mm cut off each side: `}
        the sticker prints {(stickerMm / 10).toFixed(1)} cm wide on a page 21.0 cm wide and {(lengthMm / 10).toFixed(1)} cm long.
      </p>
    </div>
  );
}
