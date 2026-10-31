import { Suspense } from "react";
import { FileManager } from "@/components/admin/FileManager";
import { Loading } from "@/components/ui";
import { OLD_M_TAB } from "@/lib/m";

export default function OldMPage() {
  return (
    <Suspense fallback={<Loading />}>
      <FileManager tab={OLD_M_TAB} />
    </Suspense>
  );
}
