"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * The hamburger button of the mobile view and the menu it opens under the header. Everything inside
 * the menu is drawn by the page itself (and edited like the rest of it); this only opens and closes it.
 */
export function MobileMenu({
  label,
  hidden,
  buttonProps,
  panelProps,
  panelStyle,
  open: forced,
  children,
}: {
  /** The button's spoken name. */
  label: string;
  /** Hidden from visitors; in the editor it still shows, faded. */
  hidden?: boolean;
  /** Editor attributes for the button (data-edit and its classes). */
  buttonProps?: { className?: string; "data-edit"?: string };
  /** Editor attributes for the panel, so it can be picked and its size and place set. */
  panelProps?: { className?: string; "data-edit"?: string };
  /** The panel's width and place, as the super admin set them. */
  panelStyle?: CSSProperties;
  /** Set by the editor to hold the menu open or shut; visitors toggle it themselves. */
  open?: boolean;
  children: ReactNode;
}) {
  const [own, setOwn] = useState(false);
  const open = forced ?? own;
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (forced !== undefined || !own) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOwn(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [own, forced]);

  return (
    <>
      <button
        ref={button}
        type="button"
        {...buttonProps}
        className={["nmpm-burger", open ? "is-open" : "", buttonProps?.className ?? ""].join(" ").trim()}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        hidden={hidden && forced === undefined ? true : undefined}
        onClick={() => {
          if (forced === undefined) setOwn((o) => !o);
        }}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>
      <div
        id={id}
        {...panelProps}
        className={[`nmpm-drawer`, open ? "is-open" : "", panelProps?.className ?? ""].join(" ").trim()}
        style={panelStyle}
        aria-hidden={!open}
        // A tap on a link inside closes the menu as the page moves on.
        onClick={(e) => {
          if (forced === undefined && (e.target as HTMLElement).closest("a")) setOwn(false);
        }}
      >
        {children}
      </div>
      {open && forced === undefined ? (
        <button type="button" className="nmpm-scrim" aria-label="Close the menu" tabIndex={-1} onClick={() => setOwn(false)} />
      ) : null}
    </>
  );
}
