import type { NextRequest } from "next/server";
import { answerDocument, APPO_DOCS, NEW_M_DOCS, plain, readVisit } from "@/lib/document-tab";

export const dynamic = "force-dynamic";

/**
 * A document's own address on a New M domain (src/lib/document-tab.ts). On a host Appo serves as well the
 * middleware names Appo too, since both write the same address: it is then looked up in both at once (one
 * round trip, as anywhere else) and whichever has the document answers.
 */
export async function GET(req: NextRequest) {
  const visit = readVisit(req, "x-nm");
  if (!visit) return plain(404, "Not found");
  const shared = Boolean(req.headers.get("x-appo-host"));
  return answerDocument(visit, shared ? [NEW_M_DOCS, APPO_DOCS] : [NEW_M_DOCS]);
}
