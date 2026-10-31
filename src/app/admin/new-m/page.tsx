import { Suspense } from "react";
import { NewMManager } from "@/components/admin/NewMManager";
import { Loading } from "@/components/ui";

export default function NewMPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewMManager />
    </Suspense>
  );
}
