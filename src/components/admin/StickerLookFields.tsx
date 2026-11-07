"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Checkbox, Select } from "@/components/ui";
import {
  BOLD_MAX,
  BOLD_MIN,
  BOLD_NAMES,
  clampBold,
  cleanSpacing,
  INK,
  MAX_LETTER_SPACING,
  MAX_QR_LINE,
  MAX_WORD_SPACING,
  MIN_LETTER_SPACING,
  MIN_WORD_SPACING,
  MIN_QR_LINE,
  NO_FILL,
  QR_LINE,
  QR_PAPER,
  type StyleKey,
  type TextStyle,
} from "@/lib/sticker-style";

/** Shades from black to grey, for making text darker or lighter in one click. */
const SHADES = ["#000000", "#262626", "#404040", "#595959", "#737373", "#8c8c8c"];

/**
 * The boldness, colour and letter and word spacing of a picked set's text on the sticker, one row per text
 * (its number, its words, its value, or the whole of a one-piece set). Used by New M's and Appo's background
 * editors alike.
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
          const letters = cleanSpacing(next.letterSpacing, MIN_LETTER_SPACING, MAX_LETTER_SPACING);
          if (letters) out.letterSpacing = letters;
          const words = cleanSpacing(next.wordSpacing, MIN_WORD_SPACING, MAX_WORD_SPACING);
          if (words) out.wordSpacing = words;
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
            <SpacingStepper
              label="Letter spacing"
              name={name}
              value={st?.letterSpacing ?? 0}
              min={MIN_LETTER_SPACING}
              max={MAX_LETTER_SPACING}
              disabled={disabled}
              onChange={(v) => put({ ...st, letterSpacing: v })}
            />
            <SpacingStepper
              label="Word spacing"
              name={name}
              value={st?.wordSpacing ?? 0}
              min={MIN_WORD_SPACING}
              max={MAX_WORD_SPACING}
              disabled={disabled}
              onChange={(v) => put({ ...st, wordSpacing: v })}
            />
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

/**
 * Room between letters, or between words, in the sticker's px: half a px less or more at a click, or typed.
 * 0 is as made; below 0 draws them closer.
 */
function SpacingStepper({
  label,
  name,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  /** The text's name, for screen readers. */
  name: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const put = (v: number) => onChange(Math.round(Math.min(max, Math.max(min, v)) * 10) / 10);
  const lower = label.toLowerCase();
  const step = "grid place-items-center size-7 border rounded-md bg-surface hover:bg-surface-2 disabled:opacity-40";
  return (
    <span className="inline-flex items-center gap-1" title={`${label} in px: more spreads it out, less draws it closer (0 as made)`}>
      <span className="text-[12px] text-text-muted">{label}</span>
      <button type="button" className={step} title="Less" aria-label={`${name}: less ${lower}`} disabled={disabled || value <= min} onClick={() => put(value - 0.5)}>
        <Minus className="size-3.5" />
      </button>
      <input
        type="number"
        step={0.5}
        min={min}
        max={max}
        value={draft ?? String(value)}
        disabled={disabled}
        aria-label={`${name}: ${lower}, in px`}
        className="w-14 h-7 rounded-md border border-line-strong bg-surface px-1.5 text-[12.5px] tabular-nums"
        onChange={(e) => {
          setDraft(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(v)) put(v);
        }}
        onBlur={() => setDraft(null)}
      />
      <button type="button" className={step} title="More" aria-label={`${name}: more ${lower}`} disabled={disabled || value >= max} onClick={() => put(value + 0.5)}>
        <Plus className="size-3.5" />
      </button>
    </span>
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

/**
 * The line round the QR code: on or off, and how thick, in the sticker's own px (the units its words are
 * measured in). made is how thick it is as made: 0 for none.
 */
export function QrLineField({
  value,
  made,
  disabled,
  onChange,
}: {
  /** Left out: as made. 0: no line. */
  value: number | undefined;
  made: number;
  disabled?: boolean;
  /** The new thickness, or undefined for as made. */
  onChange: (line: number | undefined) => void;
}) {
  const line = value ?? made;
  const on = line > 0;
  // A line as thick as it is made is kept as made.
  const put = (t: number) => onChange(Math.abs(t - made) < 0.05 ? undefined : Math.round(t * 10) / 10);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="w-24 shrink-0 text-[12.5px] font-medium">Border</span>
      <Checkbox
        label="Line round the QR code"
        checked={on}
        disabled={disabled}
        onChange={(e) => put(e.target.checked ? made || QR_LINE : 0)}
      />
      {on ? (
        <label className="inline-flex items-center gap-1.5 text-[12.5px]">
          <span className="text-text-muted">Thickness</span>
          <input
            type="range"
            min={MIN_QR_LINE}
            max={MAX_QR_LINE}
            step={0.1}
            value={line}
            disabled={disabled}
            aria-label="Thickness of the line round the QR code"
            className="w-40 accent-teal-600"
            onChange={(e) => put(Number(e.target.value))}
          />
          <span className="tabular-nums w-12">{line.toFixed(1)} px</span>
        </label>
      ) : null}
      {value !== undefined ? (
        <Button size="sm" disabled={disabled} onClick={() => onChange(undefined)}>
          As made
        </Button>
      ) : null}
      <span className="basis-full text-[12px] text-text-muted">
        A black line round the code&apos;s square ({made > 0 ? `as made, ${made} px` : "none as made"}). Untick it for no line; a
        thicker line grows outward, so it never covers more of the code.
      </span>
    </div>
  );
}

/** A4 paper's width, in millimetres and in points. */
const A4_MM = 210;
const A4_PT = 595.28;
const MM_PER_PT = 25.4 / 72;

/**
 * How big the whole sticker — its background with every word, value and the QR code on it, as one set — prints
 * on its A4-wide page, set with one slider once its words, values and QR code are in place. The slider reads as
 * the white left at each side: more white makes the whole sticker smaller, less makes it larger, and below
 * nothing its sides are cut. The page's length follows the sticker.
 */
export function PageWidthField({
  size,
  scale,
  disabled,
  onChange,
}: {
  /** The sticker's own size, in sticker units (its background as shown). */
  size: { width: number; height: number };
  /** How big it prints, in points per sticker unit. */
  scale: number;
  disabled?: boolean;
  onChange: (scale: number) => void;
}) {
  const stickerMm = size.width * scale * MM_PER_PT;
  const lengthMm = size.height * scale * MM_PER_PT;
  const side = (A4_MM - stickerMm) / 2;
  const minSide = -A4_MM / 2;
  const maxSide = (A4_MM - 10) / 2;
  const put = (mm: number) => {
    const m = Math.min(maxSide, Math.max(minSide, mm));
    onChange((A4_MM - 2 * m) / MM_PER_PT / size.width);
  };
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [scale, size.width]);
  const round = (v: number) => Math.round(v * 10) / 10;
  return (
    <div className="rounded-md border bg-surface-2 p-3 space-y-2">
      <div className="text-[12.5px] font-medium">
        Page width (A4)
        <span className="font-normal text-text-muted">
          {" "}
          · once the words, values and QR code are in place: the whole sticker grows or shrinks on its A4 page (the white
          in the view above), leaving more or less white at the sides — or none, or cutting its sides. The page&apos;s length
          follows the sticker.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="w-28">White at each side</span>
        <input
          type="range"
          min={minSide}
          max={maxSide}
          step={0.5}
          value={Math.min(maxSide, Math.max(minSide, side))}
          disabled={disabled}
          aria-label="White at each side of the A4 page, in millimetres (less than 0 cuts the sticker's sides)"
          className="w-64 accent-teal-600"
          onChange={(e) => put(Number(e.target.value))}
        />
        <input
          type="number"
          step={0.5}
          value={draft ?? String(round(side))}
          disabled={disabled}
          aria-label="White at each side, in millimetres"
          className="w-20 rounded-md border border-line-strong bg-surface px-2 h-8"
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(n)) put(n);
          }}
          onBlur={() => setDraft(null)}
        />
        <span>mm</span>
        {Math.abs(side) >= 0.25 ? (
          <Button size="sm" disabled={disabled} onClick={() => onChange(A4_PT / size.width)}>
            Edge to edge
          </Button>
        ) : null}
      </div>
      <p className="text-[12px] text-text-muted">
        {Math.abs(side) < 0.25
          ? "Edge to edge: "
          : side > 0
            ? `${round(side)} mm of white on the left and on the right: `
            : `${round(-side)} mm cut off each side: `}
        the sticker prints {(stickerMm / 10).toFixed(1)} cm wide on a page 21.0 cm wide and {(lengthMm / 10).toFixed(1)} cm long.
      </p>
    </div>
  );
}
