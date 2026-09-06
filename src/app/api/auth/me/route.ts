import { ok, requireUser, run } from "@/lib/api";

export async function GET() {
  return run(async () => {
    const user = await requireUser();
    return ok({ user });
  });
}
