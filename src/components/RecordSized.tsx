import type { ReactNode } from "react";
import { zoomOf } from "@/lib/record-looks";

/**
 * A piece of the verification record at the size and boldness the super admin set (see record-looks.ts):
 * zoomed in place, so text grows and wraps within its box, and an image inside grows with it; its text
 * set thinner or bolder. As designed, the piece is drawn exactly as before, with nothing round it.
 */
export function Sized({ size, weight, children }: { size?: number; weight?: number; children: ReactNode }) {
  const zoom = zoomOf(size);
  if (!zoom && weight === undefined) return <>{children}</>;
  return <span style={{ ...(zoom ? { zoom } : {}), ...(weight !== undefined ? { fontWeight: weight } : {}) }}>{children}</span>;
}
