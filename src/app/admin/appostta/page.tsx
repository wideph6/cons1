import { Suspense } from "react";
import { ApposttaManager } from "@/components/admin/ApposttaManager";
import { Loading } from "@/components/ui";

export default function ApposttaPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ApposttaManager />
    </Suspense>
  );
}
