import type { NextRequest } from "next/server";
import { answerDocument, APPO_DOCS, plain, readVisit } from "@/lib/document-tab";

export const dynamic = "force-dynamic";

/** A document's own address on an Appo domain (src/lib/document-tab.ts). */
export async function GET(req: NextRequest) {
  const visit = readVisit(req, "x-appo");
  if (!visit) return plain(404, "Not found");
  return answerDocument(visit, [APPO_DOCS]);
}
