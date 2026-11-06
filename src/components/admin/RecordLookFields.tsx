"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { AS_DESIGNED, clampMove, clampSize, LOOK_SIZE, type PieceLook } from "@/lib/record-looks";

/** One piece the panel moves and sizes. */
export interface LookPiece {
  id: string;
  name: string;
  /** The piece has its size set elsewhere (the certificate box's own look), so only its place is set here. */
  noSize?: boolean;
}

/**
 * Where each piece of a verification record entry sits and how large it is: moved by design pixels (typed,
 * nudged with the arrows, Shift for 10, or dragged on the page while it is picked) and sized in percent
 * (typed, − / + by 5, Shift for 25, or the slider). Used by New M's and Appo's page editors alike.
 */
export function RecordLookFields({
  pieces,
  looks,
  onChange,
  title = "Position and size",
  hint = "Drag the dashed piece on the page, or set it here. Moves are in design pixels (Shift + arrow moves 10); size is a percent of the design. Nothing else on the page is pushed aside by a move.",
}: {
  pieces: LookPiece[];
  looks: Record<string, PieceLook | undefined>;
  /** The pieces that changed, each with its new look, or null where it is back as designed. */
  onChange: (updates: Record<string, PieceLook | null>) => void;
  title?: string;
  hint?: string;
}) {
  const at = (id: string): PieceLook => looks[id] ?? AS_DESIGNED;
  const put = (id: string, l: PieceLook) => {
    const next = { x: clampMove(l.x), y: clampMove(l.y), size: clampSize(l.size) };
    onChange({ [id]: next.x === 0 && next.y === 0 && next.size === 100 ? null : next });
  };
  const changed = pieces.filter((p) => looks[p.id]);

  return (
    <div className="rounded-md border bg-surface-2 p-2.5 space-y-2.5">
      <div>
        <div className="text-[13px] font-medium">{title}</div>
        <p className="text-[12px] text-text-muted mt-0.5">{hint}</p>
      </div>
      {pieces.map((piece) => {
        const l = at(piece.id);
        const nudge = (dx: number, dy: number) => (e: React.MouseEvent) => {
          const step = e.shiftKey ? 10 : 1;
          put(piece.id, { ...l, x: l.x + dx * step, y: l.y + dy * step });
        };
        const grow = (by: number) => (e: React.MouseEvent) => put(piece.id, { ...l, size: l.size + by * (e.shiftKey ? 25 : 5) });
        return (
          <div key={piece.id} className="space-y-1.5 border-t pt-2 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-semibold truncate">{piece.name}</span>
              {looks[piece.id] ? (
                <button
                  type="button"
                  className="ml-auto text-[12px] text-teal-700 hover:underline"
                  onClick={() => onChange({ [piece.id]: null })}
                >
                  Put back
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <label className="inline-flex items-center gap-1 text-[12px] text-text-muted">
                X
                <Input
                  type="number"
                  step={1}
                  value={l.x}
                  aria-label={`${piece.name}: across`}
                  className="w-16 h-7 py-0 text-[12.5px]"
                  onChange={(e) => e.target.value !== "" && put(piece.id, { ...l, x: Number(e.target.value) })}
                />
              </label>
              <label className="inline-flex items-center gap-1 text-[12px] text-text-muted">
                Y
                <Input
                  type="number"
                  step={1}
                  value={l.y}
                  aria-label={`${piece.name}: down`}
                  className="w-16 h-7 py-0 text-[12.5px]"
                  onChange={(e) => e.target.value !== "" && put(piece.id, { ...l, y: Number(e.target.value) })}
                />
              </label>
              <span className="inline-flex">
                <button type="button" className="px-1.5 h-7 border rounded-l-md hover:bg-surface" title="Left (Shift: 10)" onClick={nudge(-1, 0)}>
                  ←
                </button>
                <button type="button" className="px-1.5 h-7 border-y hover:bg-surface" title="Up (Shift: 10)" onClick={nudge(0, -1)}>
                  ↑
                </button>
                <button type="button" className="px-1.5 h-7 border-y border-l hover:bg-surface" title="Down (Shift: 10)" onClick={nudge(0, 1)}>
                  ↓
                </button>
                <button type="button" className="px-1.5 h-7 border rounded-r-md hover:bg-surface" title="Right (Shift: 10)" onClick={nudge(1, 0)}>
                  →
                </button>
              </span>
            </div>
            {piece.noSize ? null : (
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-text-muted w-8">Size</span>
                <button
                  type="button"
                  className="grid place-items-center size-7 border rounded-md hover:bg-surface disabled:opacity-40"
                  title="Smaller (Shift: by 25)"
                  aria-label={`${piece.name}: smaller`}
                  disabled={l.size <= LOOK_SIZE.min}
                  onClick={grow(-1)}
                >
                  <Minus className="size-3.5" />
                </button>
                <input
                  type="range"
                  min={LOOK_SIZE.min}
                  max={LOOK_SIZE.max}
                  step={1}
                  value={l.size}
                  aria-label={`${piece.name}: size`}
                  className="flex-1 min-w-0 accent-teal-600"
                  onChange={(e) => put(piece.id, { ...l, size: Number(e.target.value) })}
                />
                <button
                  type="button"
                  className="grid place-items-center size-7 border rounded-md hover:bg-surface disabled:opacity-40"
                  title="Larger (Shift: by 25)"
                  aria-label={`${piece.name}: larger`}
                  disabled={l.size >= LOOK_SIZE.max}
                  onClick={grow(1)}
                >
                  <Plus className="size-3.5" />
                </button>
                <SizeInput label={`${piece.name}: size in percent`} value={l.size} onChange={(size) => put(piece.id, { ...l, size })} />
                <span className="text-[12px] text-text-muted">%</span>
              </div>
            )}
          </div>
        );
      })}
      {changed.length > 1 ? (
        <Button
          size="sm"
          icon={<RotateCcw className="size-3.5" />}
          onClick={() => onChange(Object.fromEntries(changed.map((p) => [p.id, null])))}
        >
          Put all back as designed
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The size typed in percent. Half-typed numbers (the 1 of 150) are not applied; a number in range is
 * applied as it is typed, and leaving the box brings anything else into range.
 */
function SizeInput({ label, value, onChange }: { label: string; value: number; onChange: (size: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    const next = draft.trim() === "" || !Number.isFinite(n) ? value : clampSize(n);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <div className="w-[4.25rem] shrink-0">
      <Input
        type="number"
        min={LOOK_SIZE.min}
        max={LOOK_SIZE.max}
        step={1}
        value={draft}
        aria-label={label}
        className="h-7 py-0 text-[12.5px] pr-1"
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isInteger(n) && n >= LOOK_SIZE.min && n <= LOOK_SIZE.max) onChange(n);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
    </div>
  );
}
