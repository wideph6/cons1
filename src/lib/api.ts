import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import { ApiError } from "./errors";
import { can, PERMISSION_LABELS, type Permission } from "./permissions";
import type { User } from "./types";

export { ApiError };

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("[api]", e);
  const message = e instanceof Error ? e.message : "Something went wrong";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Wrap a handler body so thrown ApiErrors become JSON responses. */
export async function run(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    return errorResponse(e);
  }
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Not signed in");
  return user;
}

export function requirePermission(user: User, perm: Permission): void {
  if (!can(user, perm)) {
    throw new ApiError(403, `You don't have permission to: ${PERMISSION_LABELS[perm].toLowerCase()}`);
  }
}

export function requireSuperadmin(user: User): void {
  if (user.role !== "superadmin") {
    throw new ApiError(403, "Only the super admin can do this");
  }
}

export async function readBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Request body must be valid JSON");
  }
}

/** Unwrap a supabase result, converting errors into ApiErrors. */
export function must<T>(
  res: { data: T | null; error: { message: string; code?: string } | null },
  notFoundMessage?: string,
): T {
  if (res.error) {
    if (res.error.code === "23505") throw new ApiError(409, "That name already exists here");
    throw new ApiError(500, res.error.message);
  }
  if (res.data === null || res.data === undefined) {
    throw new ApiError(404, notFoundMessage ?? "Not found");
  }
  return res.data;
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = value ? parseInt(value, 10) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
