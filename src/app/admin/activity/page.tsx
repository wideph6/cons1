import { Suspense } from "react";
import { ActivityLog } from "@/components/admin/ActivityLog";
import { Loading } from "@/components/ui";

export default function ActivityPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ActivityLog />
    </Suspense>
  );
}
