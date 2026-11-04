import { Suspense } from "react";
import { AppoManager } from "@/components/admin/AppoManager";
import { Loading } from "@/components/ui";

export default function AppoPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AppoManager />
    </Suspense>
  );
}
