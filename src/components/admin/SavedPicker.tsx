"use client";

import { Check, ChevronDown, Loader2, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cx } from "@/components/ui";

export interface PickerChoice {
  value: string;
  /** What the choice says. */
  text: string;
  /** A fainter second part, e.g. an officer's designation. */
  detail?: string;
  /** A saved value (the default), the empty choice, a value kept from the document, or "add a new one". */
  kind?: "saved" | "none" | "kept" | "add";
  /**
   * Present on a saved value the signed-in user may take off its list: a bin beside it asks once, then
   * calls this. It should throw when the removal failed, so the value stays.
   */
  remove?: () => Promise<void>;
}

/** With more saved values than this, the list opens with a search box. */
const SEARCH_FROM = 8;

/**
 * Picks one of the values saved so far, like a select, with a bin beside each saved value for whoever
 * may remove them. Removing only stops a value being offered again; nothing that already uses it changes.
 */
export function SavedPicker({
  id,
  value,
  choices,
  onChange,
  disabled,
  removeNote,
}: {
  id?: string;
  value: string;
  choices: PickerChoice[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Said when a removal is confirmed, e.g. that documents using it keep it. */
  removeNote: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  /** The value whose removal is being asked about, then carried out. */
  const [asking, setAsking] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  /** Removed here; hidden at once, before the saved lists have been read again. */
  const [gone, setGone] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const all = useMemo(() => choices.filter((c) => (c.kind ?? "saved") !== "saved" || !gone.includes(c.value)), [choices, gone]);
  const searchable = all.filter((c) => (c.kind ?? "saved") === "saved").length > SEARCH_FROM;
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (q ? all.filter((c) => c.kind === "add" || `${c.text} ${c.detail ?? ""}`.toLowerCase().includes(q)) : all),
    [all, q],
  );
  const current = all.find((c) => c.value === value);

  function openList() {
    setQuery("");
    setAsking(null);
    setActive(Math.max(0, all.findIndex((c) => c.value === value)));
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    setAsking(null);
    if (refocus) trigger.current?.focus();
  }

  function pick(c: PickerChoice) {
    onChange(c.value);
    close();
  }

  function focusList() {
    (searchable ? search.current : list.current)?.focus();
  }

  async function remove(c: PickerChoice) {
    if (!c.remove) return;
    setRemoving(true);
    try {
      await c.remove();
      setGone((g) => [...g, c.value]);
    } catch {
      // The caller has said why; the value stays.
    } finally {
      setAsking(null);
      setRemoving(false);
      // The question's buttons are gone, so the keyboard goes back to the list.
      window.setTimeout(focusList, 0);
    }
  }

  // Opening puts the keyboard in the search box, or on the list.
  useEffect(() => {
    if (open) focusList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The highlighted choice stays in sight, and in range as the list narrows.
  useEffect(() => {
    if (!open) return;
    if (active > shown.length - 1) {
      setActive(Math.max(0, shown.length - 1));
      return;
    }
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, shown.length]);

  // A click or the keyboard going anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("focusin", away);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("focusin", away);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      // Closes this list only, not the dialog it sits in.
      e.preventDefault();
      e.stopPropagation();
      if (asking && !removing) {
        setAsking(null);
        focusList();
      } else if (!asking) {
        close();
      }
      return;
    }
    // The bins and the confirm buttons handle their own keys.
    if (asking || !(e.target as HTMLElement).hasAttribute("data-nav")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(shown.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      const c = shown[active];
      if (c) {
        e.preventDefault();
        pick(c);
      }
    } else if (e.key === "Delete" && !searchable) {
      const c = shown[active];
      if (c?.remove) {
        e.preventDefault();
        setAsking(c.value);
      }
    }
  }

  const line = (c: PickerChoice) => (c.detail ? `${c.text} — ${c.detail}` : c.text);

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        id={id}
        type="button"
        className="ctl relative text-left pr-8"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
      >
        <span className={cx("block truncate", (!current || current.kind === "none") && "text-text-muted")}>
          {current ? line(current) : value || "—"}
        </span>
        <ChevronDown className="size-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      </button>

      {open ? (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-md border border-line-strong bg-surface shadow-lg">
          {searchable ? (
            <div className="p-1.5 border-b">
              <input
                ref={search}
                data-nav=""
                className="ctl py-1 text-[13px]"
                placeholder="Search the saved values…"
                aria-label="Search the saved values"
                aria-controls={listId}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                  setAsking(null);
                }}
              />
            </div>
          ) : null}
          <ul
            ref={list}
            id={listId}
            data-nav=""
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            className="max-h-64 overflow-auto py-1"
            // The highlighted row shows where the keyboard is; a ring around the whole list would only add noise.
            style={{ outline: "none" }}
          >
            {shown.map((c, i) =>
              asking === c.value ? (
                <li key={c.value} data-index={i} className="mx-1 my-0.5 rounded bg-danger-50 border border-danger-600/20 px-2.5 py-2">
                  <p className="text-[13px] text-text break-words">
                    Stop suggesting <strong>{line(c)}</strong>? {removeNote}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      autoFocus
                      disabled={removing}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded bg-danger-600 text-white text-[12.5px] font-medium disabled:opacity-70"
                      onClick={() => remove(c)}
                    >
                      {removing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      Remove
                    </button>
                    <button
                      type="button"
                      disabled={removing}
                      className="h-7 px-2.5 rounded border border-line-strong bg-surface text-[12.5px] font-medium"
                      onClick={() => {
                        setAsking(null);
                        focusList();
                      }}
                    >
                      Keep it
                    </button>
                  </div>
                </li>
              ) : (
                <li
                  key={c.value}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={c.value === value}
                  className={cx("flex items-center gap-1 pl-3 pr-1 cursor-pointer text-[13.5px]", i === active && "bg-surface-2")}
                  onMouseMove={() => setActive(i)}
                  // Keeps the keyboard where it is, so the list stays open.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c)}
                >
                  <span
                    className={cx(
                      "flex-1 min-w-0 py-1.5 break-words",
                      c.kind === "none" && "text-text-muted",
                      c.kind === "kept" && "text-text-muted italic",
                      c.kind === "add" && "text-teal-700 font-medium",
                    )}
                  >
                    {c.text}
                    {c.detail ? <span className="text-text-muted"> — {c.detail}</span> : null}
                  </span>
                  {c.value === value ? <Check className="size-3.5 shrink-0 text-teal-700" aria-hidden="true" /> : null}
                  {c.remove ? (
                    <button
                      type="button"
                      className="shrink-0 grid place-items-center size-7 rounded text-text-faint hover:text-danger-600 hover:bg-danger-50 focus-visible:text-danger-600 focus-visible:bg-danger-50 outline-none"
                      aria-label={`Stop suggesting ${line(c)}`}
                      title="Stop suggesting this (documents that use it keep it)"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActive(i);
                        setAsking(c.value);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </li>
              ),
            )}
            {shown.length === 0 ? <li className="px-3 py-2 text-[12.5px] text-text-muted">Nothing matches.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
