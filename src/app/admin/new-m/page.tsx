import { Suspense } from "react";
import { FileManager } from "@/components/admin/FileManager";
import { Loading } from "@/components/ui";
import { NEW_M_TAB } from "@/lib/m";

export default function NewMPage() {
  return (
    <Suspense fallback={<Loading />}>
      <FileManager tab={NEW_M_TAB} />
    </Suspense>
  );
}
