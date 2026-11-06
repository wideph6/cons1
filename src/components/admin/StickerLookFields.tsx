"use client";

import { Minus, Plus } from "lucide-react";
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
