import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { VerifyPage } from "@/components/new-m-page/VerifyPage";
import { assetUrls, findVisit, getDesktop } from "@/lib/new-m-page-server";

export const dynamic = "force-dynamic";

/** The page content, read once per visit even though the title and the page both need it. */
const loadPage = cache(getDesktop);

function decode(v: string | null): string {
  if (!v) return "";
  try {
    return decodeURIComponent(v);
  } catch {
    return "";
  }
}

/** The address the visitor opened, as the middleware passed it on. */
async function visit() {
  const h = await headers();
  return {
    host: (h.get("x-nm-host") ?? "").toLowerCase(),
    path: decode(h.get("x-nm-path")) || "/",
    search: decode(h.get("x-nm-search")),
  };
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const page = await loadPage();
    return {
      title: page.content.meta.title,
      robots: { index: false, follow: false },
      referrer: "same-origin",
    };
  } catch {
    return { title: "Verification", robots: { index: false, follow: false } };
  }
}

/**
 * The public verification page. The middleware sends a visit here only when its host is a New M domain
 * and its address is one of that domain's links; the lookup is repeated here against the database, so
 * nothing the browser sends can make a document appear.
 */
export default async function VerifyRoute() {
  const v = await visit();
  if (!v.host) notFound();

  const [result, page] = await Promise.all([findVisit(v.host, v.path, v.search), loadPage()]);
  if (!result.matched) notFound();

  const assets = await assetUrls(page.content).catch(() => ({}));
  return <VerifyPage content={page.content} record={result.record} assets={assets} />;
}
