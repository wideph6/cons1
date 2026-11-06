import type { CSSProperties, ReactNode } from "react";
import { Sized } from "@/components/RecordSized";
import { moveCss } from "@/lib/record-looks";
import {
  certificateStyle,
  rowValue,
  type CertificateFont,
  type DesktopContent,
  type PageRecord,
  type RecordRow,
  type RowPart,
} from "@/lib/appo-page";

/**
 * The entries of Appo's verification record, drawn the same way in the desktop and the mobile view;
 * each view passes its own class prefix (apo / apom), its design-pixel unit and its fonts.
 *
 * Inside every entry's box the number, the words and the value (and in the officer's box the
 * designation and the signature) sit where the layout puts them, moved and sized by whatever the super
 * admin set under Page design. A move shifts the text where it is drawn without pushing anything else
 * aside, as on the sticker; a larger text grows and wraps within its box, and a larger signature grows
 * round its middle. In the editor each of these carries data-move ("<entry>:<part>") so it can be dragged.
 */

type Ed = (path: string, hidden?: boolean, extra?: string) => { className?: string; "data-edit"?: string };

export interface RecordRowsProps {
  /** The view's class prefix: "apo" (desktop) or "apom" (mobile). */
  p: "apo" | "apom";
  rec: DesktopContent["record"];
  r: PageRecord;
  /** One design pixel of the view, as CSS. */
  unit: (n: number) => string;
  fonts: Record<CertificateFont, string>;
  ed: Ed;
  visible: (item: { hidden: boolean }) => boolean;
  editing: boolean;
  /** Shown in the editor when the sample document has no signature. */
  sampleSignature: ReactNode;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function dash(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s || "—";
}

/** True when any entry shown has a number, so the entries keep a gutter for them. */
export function hasNumbers(rows: RecordRow[], visible: (item: { hidden: boolean }) => boolean): boolean {
  return rows.some((row) => visible(row) && row.id !== "certificate" && row.number.trim() !== "");
}

export function RecordRows({ p, rec, r, unit, fonts, ed, visible, editing, sampleSignature }: RecordRowsProps) {
  /**
   * A set of text moved within its box. Text that flows (the words, the value) is shifted relatively,
   * which also works where it runs on one line; boxes placed on their own (the number, the signature)
   * are translated.
   */
  function moved(row: RecordRow, part: RowPart, placed = false, scaleSelf = false): CSSProperties | undefined {
    const scale = scaleSelf ? (row.sizes?.[part] ?? 100) / 100 : 1;
    return moveCss(row.moves[part], unit, placed ? "shift" : "flow", scale);
  }

  /** A set of text at the size and boldness the super admin set. */
  function sized(row: RecordRow, part: RowPart, children: ReactNode): ReactNode {
    return (
      <Sized size={row.sizes?.[part]} weight={row.weights?.[part]}>
        {children}
      </Sized>
    );
  }

  /** Marks a set of text for dragging in the editor. */
  function mv(row: RecordRow, part: RowPart): { "data-move"?: string } {
    return editing ? { "data-move": `${row.id}:${part}` } : {};
  }

  return (
    <>
      {rec.rows.map((row) => {
        if (!visible(row)) return null;
        const path = `record.rows.${row.id}`;
        const align: CSSProperties | undefined = row.align !== "left" ? { textAlign: row.align } : undefined;
        const alignClass = row.align === "center" ? "is-center" : row.align === "right" ? "is-right" : null;
        const num = row.number.trim() ? (
          <span className={`${p}-row-num`} style={moved(row, "number", true)} {...mv(row, "number")}>
            {sized(row, "number", row.number)}
          </span>
        ) : null;

        if (row.id === "certificate") {
          const justify = row.align === "left" ? "flex-start" : row.align === "right" ? "flex-end" : "center";
          return (
            <div key={row.id} {...ed(path, row.hidden, `${p}-certrow`)}>
              <span className={`${p}-certbox`} style={{ ...certificateStyle(rec.certificate, unit, fonts), justifyContent: justify, textAlign: row.align }}>
                <span style={moved(row, "words")} {...mv(row, "words")}>
                  {row.text}
                </span>
              </span>
            </div>
          );
        }

        if (row.id === "officer") {
          return (
            <div key={row.id} {...ed(path, row.hidden, cx(`${p}-row ${p}-row-officer`, alignClass))}>
              {num}
              <div className={`${p}-officer-text`} style={align}>
                <span className={`${p}-row-label`} style={moved(row, "words")} {...mv(row, "words")}>
                  {sized(row, "words", row.text)}
                </span>
                <span className={`${p}-row-value`} style={moved(row, "value")} {...mv(row, "value")}>
                  {sized(row, "value", dash(r.officer_name))}
                </span>
                {visible(rec.designation) && r.officer_designation ? (
                  <span {...ed("record.designation", rec.designation.hidden, `${p}-officer-role`)} style={moved(row, "designation")} {...mv(row, "designation")}>
                    {sized(row, "designation", r.officer_designation)}
                  </span>
                ) : null}
              </div>
              {visible(rec.signature) && (r.signature_url || editing) ? (
                <span {...ed("record.signature", rec.signature.hidden, `${p}-signature`)} style={moved(row, "signature", true, true)} {...mv(row, "signature")}>
                  {r.signature_url ? (
                    // Signatures are signed R2 links that expire; next/image would cache them.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.signature_url} alt={`Signature of ${r.officer_name || "the approving officer"}`} draggable={false} />
                  ) : (
                    sampleSignature
                  )}
                </span>
              ) : null}
            </div>
          );
        }

        const words = (
          <span key="words" className={`${p}-row-label`} style={moved(row, "words")} {...mv(row, "words")}>
            {sized(row, "words", row.text)}
          </span>
        );
        const value = (
          <span key="value" className={`${p}-row-value`} style={moved(row, "value")} {...mv(row, "value")}>
            {sized(row, "value", dash(rowValue(row, r)))}
          </span>
        );
        return (
          <div
            key={row.id}
            {...ed(path, row.hidden, cx(`${p}-row`, alignClass, row.layout === "inline" && "is-inline", row.layout === "reversed" && "is-reversed"))}
            style={align}
          >
            {num}
            {row.layout === "reversed" ? [value, words] : row.layout === "inline" ? [words, " ", value] : [words, value]}
          </div>
        );
      })}
    </>
  );
}
