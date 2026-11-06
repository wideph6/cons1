import type { ReactNode } from "react";
import { zoomOf } from "@/lib/record-looks";

/**
 * A piece of the verification record at the size the super admin set (see record-looks.ts): zoomed in
 * place, so text grows and wraps within its box, and an image inside grows with it. As designed, the
 * piece is drawn exactly as before, with nothing round it.
 */
export function Sized({ size, children }: { size?: number; children: ReactNode }) {
  const zoom = zoomOf(size);
  return zoom ? <span style={{ zoom }}>{children}</span> : <>{children}</>;
}
