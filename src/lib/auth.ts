import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { ApiError } from "./errors";
import { db } from "./supabase";
import { SESSION_COOKIE, verifySession } from "./session";
import type { DbUser, User } from "./types";

export const USER_COLUMNS =
  "id,email,name,role,permissions,is_active,created_by,created_at,last_login_at";

/** Current signed-in user, re-read from the database so permission changes apply immediately. */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  const { data } = await db().from("users").select(USER_COLUMNS).eq("id", session.sub).maybeSingle();
  if (!data || !data.is_active) return null;
  return data as User;
}

export function publicUser(u: DbUser | User): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    permissions: u.permissions ?? {},
    is_active: u.is_active,
    created_by: u.created_by,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
  };
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function validatePassword(p: unknown): string {
  if (typeof p !== "string" || p.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters");
  }
  return p;
}
