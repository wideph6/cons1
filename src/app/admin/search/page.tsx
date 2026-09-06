import { Suspense } from "react";
import { SearchFiles } from "@/components/admin/SearchFiles";
import { Loading } from "@/components/ui";

export default function SearchPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SearchFiles />
    </Suspense>
  );
}
