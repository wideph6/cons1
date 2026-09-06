import { db } from "./supabase";

export interface ActivityInput {
  user_id: string | null;
  action: string;
  domain?: { id: string | null; hostname: string | null } | null;
  link?: { id: string | null; path: string | null } | null;
  file?: { id: string | null; filename: string | null } | null;
  details?: Record<string, unknown>;
}

/** Record an admin action. Never throws — logging must not break the main operation. */
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    const { error } = await db().from("activity_log").insert({
      user_id: input.user_id,
      action: input.action,
      domain_id: input.domain?.id ?? null,
      link_id: input.link?.id ?? null,
      file_id: input.file?.id ?? null,
      domain_hostname: input.domain?.hostname ?? null,
      link_path: input.link?.path ?? null,
      filename: input.file?.filename ?? null,
      details: input.details ?? {},
    });
    if (error) console.error("[activity] insert failed", error.message);
  } catch (e) {
    console.error("[activity] insert failed", e);
  }
}
