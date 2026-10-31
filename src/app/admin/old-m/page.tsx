import { Suspense } from "react";
import { FileManager } from "@/components/admin/FileManager";
import { Loading } from "@/components/ui";

export default function OldMPage() {
  return (
    <Suspense fallback={<Loading />}>
      <FileManager />
    </Suspense>
  );
}
